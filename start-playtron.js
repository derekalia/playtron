#!/usr/bin/env node

/**
 * Wrapper script to start Playtron MCP server with a descriptive process name
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Set a descriptive process title
process.title = 'playtron-mcp-server';

// Store original process info
const PROCESS_INFO_FILE = path.join(process.cwd(), '.playtron.process.json');

// Signal handling
let child = null;
let isShuttingDown = false;

async function cleanup(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  
  console.log(`\n[Playtron Wrapper] Received ${signal}, shutting down gracefully...`);
  
  if (child && !child.killed) {
    console.log(`[Playtron Wrapper] Sending ${signal} to child process (PID: ${child.pid})...`);
    
    // Send the signal to the child process
    child.kill(signal);
    
    // Wait for child to exit gracefully
    const timeout = setTimeout(() => {
      if (!child.killed) {
        console.log('[Playtron Wrapper] Child process did not exit gracefully, forcing kill...');
        child.kill('SIGKILL');
      }
    }, 5000);
    
    // Wait for child to exit
    await new Promise((resolve) => {
      child.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }
  
  // Clean up process info file
  try {
    if (fs.existsSync(PROCESS_INFO_FILE)) {
      fs.unlinkSync(PROCESS_INFO_FILE);
    }
  } catch (err) {
    console.error('[Playtron Wrapper] Error removing process info:', err);
  }
  
  console.log('[Playtron Wrapper] Cleanup complete');
  process.exit(0);
}

// Prevent default SIGINT behavior and handle it ourselves
process.on('SIGINT', async () => {
  console.log('\n[Playtron Wrapper] Caught Control-C (SIGINT)');
  await cleanup('SIGINT');
});

process.on('SIGTERM', async () => {
  await cleanup('SIGTERM');
});

process.on('SIGHUP', async () => {
  await cleanup('SIGHUP');
});

// Handle unexpected exits
process.on('exit', (code) => {
  if (!isShuttingDown && child && !child.killed) {
    console.log('[Playtron Wrapper] Emergency cleanup on exit...');
    child.kill('SIGKILL');
  }
  console.log(`[Playtron Wrapper] Exiting with code ${code}`);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('[Playtron Wrapper] Uncaught exception:', error);
  cleanup('SIGTERM').catch(() => process.exit(1));
});

// Write process information
function writeProcessInfo() {
  const info = {
    wrapperPid: process.pid,
    childPid: child ? child.pid : null,
    startTime: new Date().toISOString(),
    processTitle: process.title,
    transportType: process.env.TRANSPORT_TYPE || 'stdio'
  };
  
  try {
    fs.writeFileSync(PROCESS_INFO_FILE, JSON.stringify(info, null, 2));
  } catch (err) {
    console.error('[Playtron Wrapper] Error writing process info:', err);
  }
}

// Start the actual MCP server
function startServer() {
  console.log('[Playtron Wrapper] Starting Playtron MCP Server...');
  console.log(`[Playtron Wrapper] Process title: ${process.title}`);
  console.log(`[Playtron Wrapper] Wrapper PID: ${process.pid}`);
  console.log('[Playtron Wrapper] Press Ctrl+C to stop gracefully');
  
  // Determine the command and args
  const tsxPath = require.resolve('tsx/cli');
  const serverPath = path.join(__dirname, 'src', 'index.ts');
  
  // Spawn the child process
  // Use 'pipe' for stdin to prevent child from receiving SIGINT directly
  // But inherit stdout/stderr so we can see the output
  child = spawn(process.execPath, [tsxPath, serverPath], {
    stdio: ['pipe', 'inherit', 'inherit'],
    env: {
      ...process.env,
      PLAYTRON_WRAPPER_PID: process.pid.toString(),
      // Tell the child to ignore SIGINT - we'll handle it
      NODE_OPTIONS: (process.env.NODE_OPTIONS || '') + ' --no-warnings'
    }
  });
  
  console.log(`[Playtron Wrapper] Child process started with PID: ${child.pid}`);
  
  // Write process info
  writeProcessInfo();
  
  // Handle child exit
  child.on('exit', (code, signal) => {
    if (!isShuttingDown) {
      console.log(`[Playtron Wrapper] Child process exited unexpectedly`);
      console.log(`[Playtron Wrapper]   Exit code: ${code}`);
      console.log(`[Playtron Wrapper]   Signal: ${signal}`);
      
      // Clean up and exit
      isShuttingDown = true;
      try {
        if (fs.existsSync(PROCESS_INFO_FILE)) {
          fs.unlinkSync(PROCESS_INFO_FILE);
        }
      } catch (err) {
        // Ignore
      }
      process.exit(code || 1);
    }
  });
  
  child.on('error', (err) => {
    console.error('[Playtron Wrapper] Child process error:', err);
    cleanup('SIGTERM').catch(() => process.exit(1));
  });
}

// Check for existing instances
function checkExistingInstance() {
  try {
    if (fs.existsSync(PROCESS_INFO_FILE)) {
      const info = JSON.parse(fs.readFileSync(PROCESS_INFO_FILE, 'utf-8'));
      
      // Check if wrapper process is still running
      try {
        process.kill(info.wrapperPid, 0);
        console.error(`[Playtron Wrapper] Another instance is already running:`);
        console.error(`  Wrapper PID: ${info.wrapperPid}`);
        console.error(`  Child PID: ${info.childPid}`);
        console.error(`  Started: ${info.startTime}`);
        console.error(`\nTo stop it, run: npm run stop`);
        return true;
      } catch {
        // Process not running, clean up stale file
        console.log('[Playtron Wrapper] Removing stale process info file');
        fs.unlinkSync(PROCESS_INFO_FILE);
      }
    }
  } catch (err) {
    console.error('[Playtron Wrapper] Error checking existing instance:', err);
  }
  return false;
}

// Main
if (checkExistingInstance()) {
  process.exit(1);
}

// Start the server
console.log('===========================================');
console.log('🚀 Playtron MCP Server Wrapper');
console.log('===========================================');

startServer();