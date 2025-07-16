#!/usr/bin/env node

/**
 * Test script to verify MCP server connection
 * This simulates how an MCP client would connect to the server
 */

const { spawn } = require('child_process');
const readline = require('readline');

console.log('Testing MCP connection...');

// Start the server process
const server = spawn('npm', ['start'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  cwd: __dirname
});

// Create readline interface for stdin/stdout
const rl = readline.createInterface({
  input: server.stdout,
  output: process.stdout,
  terminal: false
});

// Handle server output
server.stdout.on('data', (data) => {
  console.log('Server output:', data.toString());
});

server.stderr.on('data', (data) => {
  console.error('Server error:', data.toString());
});

// Send initialize request
setTimeout(() => {
  console.log('Sending initialize request...');
  
  const initRequest = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {
        roots: {
          listChanged: true
        }
      },
      clientInfo: {
        name: 'test-client',
        version: '1.0.0'
      }
    }
  };

  server.stdin.write(JSON.stringify(initRequest) + '\n');
}, 1000);

// Clean up after 5 seconds
setTimeout(() => {
  console.log('Test completed');
  server.kill();
  process.exit(0);
}, 5000);

server.on('exit', (code) => {
  console.log(`Server exited with code ${code}`);
});