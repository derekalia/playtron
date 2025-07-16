#!/usr/bin/env node

/**
 * Test a simple tool call to see the actual response
 */

const { spawn } = require('child_process');

const server = spawn('npm', ['start'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  cwd: __dirname
});

let responses = [];

server.stdout.on('data', (data) => {
  const output = data.toString();
  try {
    const lines = output.split('\n').filter(line => line.trim());
    for (const line of lines) {
      if (line.startsWith('{')) {
        const response = JSON.parse(line);
        responses.push(response);
        console.log('Response:', JSON.stringify(response, null, 2));
      }
    }
  } catch (e) {
    // Non-JSON output
  }
});

server.stderr.on('data', (data) => {
  console.log('Server log:', data.toString());
});

// Initialize first
setTimeout(() => {
  console.log('Initializing...');
  server.stdin.write(JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test', version: '1.0.0' }
    }
  }) + '\n');
}, 1000);

// Then test a tool
setTimeout(() => {
  console.log('Testing getPageInfo tool...');
  server.stdin.write(JSON.stringify({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: {
      name: 'getPageInfo',
      arguments: {}
    }
  }) + '\n');
}, 2000);

setTimeout(() => {
  console.log('Responses received:', responses.length);
  server.kill();
  process.exit(0);
}, 4000);

server.on('exit', (code) => {
  console.log(`Server exited with code ${code}`);
});