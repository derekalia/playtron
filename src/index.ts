#!/usr/bin/env node

import { FastMCP } from 'fastmcp';
import { PlaywrightCDPConnector } from './playwright-cdp-connector';
import { allTools } from './tools';

const server = new FastMCP({
  name: 'playtron',
  version: '1.0.0' as `${number}.${number}.${number}`,
});

// Global connector instance
const connector = new PlaywrightCDPConnector();
let isConnected = false;
let requestCount = 0;

// Helper function to ensure we're connected
async function ensureConnected(): Promise<void> {
  requestCount++;
  
  try {
    // First check if browser is available
    const browserAvailable = await checkElectronBrowser();
    if (!browserAvailable) {
      throw new Error('Electron browser not running. Start it with CDP enabled on port 9222');
    }
    
    if (!isConnected || !connector.isConnected()) {
      await connector.connect();
      isConnected = true;
    }
    
    // Ensure we're controlling the correct page
    await connector.ensureCorrectPage();
    
    const page = await connector.getPage();
    if (!page) {
      throw new Error('No page available in Playwright connection');
    }
  } catch (error) {
    isConnected = false;
    throw error;
  }
}

// Register all tools from the modular structure
for (const tool of allTools) {
  server.addTool({
    name: tool.schema.name,
    description: tool.schema.description,
    parameters: tool.schema.inputSchema,
    execute: async (args: any) => {
      try {
        // Ensure connection before executing tool
        await ensureConnected();
        
        // Execute the tool
        const result = await tool.handle(connector, args);
        
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
        throw error;
      }
    }
  });
}

// Check if Electron browser is running on CDP port
async function checkElectronBrowser(): Promise<boolean> {
  try {
    const response = await fetch('http://localhost:9222/json/version');
    return response.ok;
  } catch (error) {
    return false;
  }
}

// Start the server with stdio transport
server.start({
  transportType: 'stdio'
}).catch(error => {
  console.error('Failed to start MCP server:', error);
  process.exit(1);
});