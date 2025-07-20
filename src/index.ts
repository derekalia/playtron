import { FastMCP } from 'fastmcp';
import { PlaywrightCDPConnector } from './playwright-cdp-connector';
import { allTools } from './tools';
import * as fs from 'fs';
import * as path from 'path';

// Singleton lock file path
const LOCK_FILE = path.join(process.cwd(), '.playtron.lock');

// Check if another instance is already running
function checkExistingInstance(): boolean {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const pidData = fs.readFileSync(LOCK_FILE, 'utf-8');
      const oldPid = parseInt(pidData, 10);
      
      // Check if the process with this PID is still running
      try {
        process.kill(oldPid, 0); // This doesn't kill the process, just checks if it exists
        console.error(`[MCP-CDP] ⚠️  Another instance is already running (PID: ${oldPid})`);
        console.error('[MCP-CDP] ⚠️  Please stop the existing instance before starting a new one');
        console.error(`[MCP-CDP] ⚠️  You can run: kill ${oldPid}`);
        return true;
      } catch {
        // Process doesn't exist, remove stale lock file
        console.error('[MCP-CDP] 🧹 Removing stale lock file from previous instance');
        fs.unlinkSync(LOCK_FILE);
      }
    }
  } catch (error) {
    console.error('[MCP-CDP] Error checking lock file:', error);
  }
  return false;
}

// Create lock file for this instance
function createLockFile(): void {
  try {
    fs.writeFileSync(LOCK_FILE, process.pid.toString());
    console.error(`[MCP-CDP] 🔒 Created lock file (PID: ${process.pid})`);
  } catch (error) {
    console.error('[MCP-CDP] Error creating lock file:', error);
  }
}

// Remove lock file
function removeLockFile(): void {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const pidData = fs.readFileSync(LOCK_FILE, 'utf-8');
      const lockPid = parseInt(pidData, 10);
      
      // Only remove if it's our lock file
      if (lockPid === process.pid) {
        fs.unlinkSync(LOCK_FILE);
        console.error('[MCP-CDP] 🔓 Removed lock file');
      }
    }
  } catch (error) {
    console.error('[MCP-CDP] Error removing lock file:', error);
  }
}

// Check for existing instance before starting
if (checkExistingInstance()) {
  process.exit(1);
}

// Create lock file for this instance
createLockFile();

const server = new FastMCP({
  name: 'playtron',
  version: '1.0.0' as `${number}.${number}.${number}`,
});

// Log server capabilities
console.error(`[MCP-CDP] 🔍 FastMCP server starting... (PID: ${process.pid})`);
console.error('[MCP-CDP] 🔍 Registering tools from modular structure');

// Global connector instance
const connector = new PlaywrightCDPConnector();
let isConnected = false;
let requestCount = 0;

// Enhanced error handling for uncaught errors
process.on('uncaughtException', (error) => {
  console.error('[MCP-CDP] Uncaught Exception:', error);
  console.error('[MCP-CDP] Stack:', error.stack);
  // Don't exit - try to recover
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[MCP-CDP] Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit - try to recover
});

// Add heartbeat to show server is alive (every 5 minutes)
const heartbeatInterval = setInterval(() => {
  console.error(`[MCP-CDP] Heartbeat - Server alive (PID: ${process.pid}, Requests: ${requestCount})`);
}, 300000); // 5 minutes

// Status monitoring interval (will be set later)
let statusInterval: NodeJS.Timeout | null = null;

// Track if we're already shutting down to prevent multiple cleanup calls
let isShuttingDown = false;

// Graceful shutdown handler
async function cleanup() {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;
  
  console.error('[MCP-CDP] Starting cleanup...');
  
  // Clear intervals
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
  }
  if (statusInterval) {
    clearInterval(statusInterval);
  }
  
  // Disconnect from browser
  if (connector) {
    try {
      await connector.disconnect();
    } catch (error) {
      console.error('[MCP-CDP] Error during disconnect:', error);
    }
  }
  
  // Remove lock file
  removeLockFile();
  
  console.error('[MCP-CDP] Cleanup complete, exiting...');
  process.exit(0);
}

// Handle all possible shutdown signals
process.on('SIGINT', async () => {
  console.error('[MCP-CDP] Received SIGINT, shutting down gracefully...');
  await cleanup();
});

process.on('SIGTERM', async () => {
  console.error('[MCP-CDP] Received SIGTERM, shutting down gracefully...');
  await cleanup();
});

process.on('SIGHUP', async () => {
  console.error('[MCP-CDP] Received SIGHUP, shutting down gracefully...');
  await cleanup();
});

// Handle process exits
process.on('exit', () => {
  console.error('[MCP-CDP] Process exiting...');
});

// Handle when parent process dies (important for child processes)
process.on('disconnect', async () => {
  console.error('[MCP-CDP] Parent process disconnected, shutting down...');
  await cleanup();
});

// Helper function to ensure we're connected
async function ensureConnected(): Promise<void> {
  // Increment request counter silently
  requestCount++;
  
  try {
    // First check if browser is available
    const browserAvailable = await checkElectronBrowser();
    if (!browserAvailable) {
      console.error('[MCP-CDP] ⚠️ Browser not available yet. Please start the Electron browser.');
      throw new Error('Electron browser not running. Start it with CDP enabled on port 9222');
    }
    
    if (!isConnected || !connector.isConnected()) {
      console.error('[MCP-CDP] Not connected, establishing connection...');
      await connector.connect();
      isConnected = true;
      console.error('[MCP-CDP] Successfully connected to Electron browser');
    } else {
      // Already connected, reusing connection
    }
    
    // Ensure we're controlling the correct page (WebContentsView, not the UI)
    await connector.ensureCorrectPage();
    
    const page = connector.getPage();
    if (!page) {
      console.error('[MCP-CDP] ERROR: No page available after connection');
      throw new Error('No page available in Playwright connection');
    }
    
    // Connection successful
    
  } catch (error) {
    console.error('[MCP-CDP] Error in ensureConnected:', error);
    isConnected = false; // Reset connection state
    throw error;
  }
}

// Register all tools from the modular structure
for (const tool of allTools) {
  console.error(`[MCP-CDP] 🔧 Registering tool: ${tool.schema.name} (${tool.capability})`);
  
  server.addTool({
    name: tool.schema.name,
    description: tool.schema.description,
    parameters: tool.schema.inputSchema,
    execute: async (args: any) => {
      console.error(`[MCP-CDP] 🔧 Tool ${tool.schema.name} called with args:`, JSON.stringify(args, null, 2));
      requestCount++;
      
      try {
        // Ensure connection before executing tool
        await ensureConnected();
        
        // Execute the tool
        const result = await tool.handle(connector, args);
        
        console.error(`[MCP-CDP] ✅ Tool ${tool.schema.name} completed successfully`);
        
        // Convert ToolResult to FastMCP format
        if (result.content && result.content.length > 0) {
          const content = result.content[0];
          if (content.type === 'image' && content.data) {
            return {
              type: 'image' as const,
              data: content.data,
              mimeType: content.mimeType || 'image/png'
            };
          } else {
            return content.text || '';
          }
        }
        
        return 'Success';
      } catch (error) {
        console.error(`[MCP-CDP] ❌ Tool ${tool.schema.name} failed:`, error);
        throw error;
      }
    }
  });
}

// Check if Electron browser is running on CDP port
async function checkElectronBrowser(): Promise<boolean> {
  try {
    const response = await fetch('http://localhost:9222/json/version');
    if (response.ok) {
      const data = await response.json();
      console.error(`[MCP-CDP] ✅ Electron browser detected: ${data.Browser} (${data['Protocol-Version']})`);
      return true;
    }
    return false;
  } catch (error) {
    return false;
  }
}


// Start the server
async function startServer() {
  console.error('[MCP-CDP] ===========================================');
  console.error('[MCP-CDP] Starting Playwright CDP MCP server v2...');
  console.error(`[MCP-CDP] Process PID: ${process.pid}`);
  console.error(`[MCP-CDP] Node version: ${process.version}`);
  console.error('[MCP-CDP] This server connects to Electron via CDP for enhanced browser control');
  console.error('[MCP-CDP] Features: Modular tools, accessibility snapshots, smart selectors');
  console.error('[MCP-CDP] ===========================================');

  // Browser connection will be established lazily when first tool is used
  console.error('[MCP-CDP] 🔌 Browser connection will be established when needed');

  // Get port from environment or use default
  const MCP_PORT = process.env.MCP_PORT || 3002;
  const TRANSPORT_TYPE = process.env.TRANSPORT_TYPE || 'httpStream';

  console.error(`[MCP-CDP] 🚀 Starting MCP server on port ${MCP_PORT} (${TRANSPORT_TYPE})...`);
  
  // Log registered tools
  console.error(`[MCP-CDP] 📊 Server has ${allTools.length} tools registered`);
  console.error('[MCP-CDP] 🔧 Registered tools by capability:');
  
  const toolsByCapability = new Map<string, string[]>();
  for (const tool of allTools) {
    if (!toolsByCapability.has(tool.capability)) {
      toolsByCapability.set(tool.capability, []);
    }
    toolsByCapability.get(tool.capability)!.push(tool.schema.name);
  }
  
  for (const [capability, tools] of toolsByCapability) {
    console.error(`[MCP-CDP]    ${capability}: ${tools.join(', ')}`);
  }
  
  const startOptions: any = {
    transportType: TRANSPORT_TYPE as 'httpStream' | 'stdio'
  };
  
  if (TRANSPORT_TYPE === 'httpStream') {
    startOptions.httpStream = {
      port: Number(MCP_PORT),
      endpoint: '/sse'
    };
  }
  
  console.error('[MCP-CDP] 📋 Start options:', startOptions);
  
  server.start(startOptions).then(() => {
    if (TRANSPORT_TYPE === 'httpStream') {
      console.error(`[MCP-CDP] ✅ MCP server started successfully on http://localhost:${MCP_PORT}`);
      console.error(`[MCP-CDP] 🔗 SSE endpoint: http://localhost:${MCP_PORT}/sse`);
      console.error('[MCP-CDP] 🔍 Waiting for client connections...');
      
      // Add status monitoring
      statusInterval = setInterval(() => {
        console.error(`[MCP-CDP] 📊 Status: ${requestCount} requests processed so far`);
      }, 10000);
    } else {
      console.error('[MCP-CDP] ✅ MCP server started successfully on stdio');
    }
  }).catch(error => {
    console.error('[MCP-CDP] ❌ Failed to start MCP server:', error);
    console.error('[MCP-CDP] Error details:', error.stack);
    process.exit(1);
  });
}

// Start the server
startServer().catch(error => {
  console.error('[MCP-CDP] ❌ Failed to start server:', error);
  process.exit(1);
});