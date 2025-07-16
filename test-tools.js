#!/usr/bin/env node

/**
 * Test script to verify MCP server tools are properly registered
 */

const { spawn } = require('child_process');

console.log('Testing MCP tools registration...');

// Start the server process
const server = spawn('npm', ['start'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  cwd: __dirname
});

let responses = [];

// Handle server output
server.stdout.on('data', (data) => {
  const output = data.toString();
  try {
    // Try to parse each line as JSON
    const lines = output.split('\n').filter(line => line.trim());
    for (const line of lines) {
      if (line.startsWith('{')) {
        const parsed = JSON.parse(line);
        responses.push(parsed);
        console.log('Response:', JSON.stringify(parsed, null, 2));
      }
    }
  } catch (e) {
    console.log('Non-JSON output:', output);
  }
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

// Request tools list
setTimeout(() => {
  console.log('Requesting tools list...');
  
  const toolsRequest = {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
    params: {}
  };

  server.stdin.write(JSON.stringify(toolsRequest) + '\n');
}, 2000);

// Clean up after 8 seconds
setTimeout(() => {
  console.log('Test completed');
  server.kill();
  process.exit(0);
}, 8000);

server.on('exit', (code) => {
  console.log(`Server exited with code ${code}`);
});