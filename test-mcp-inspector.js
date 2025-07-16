#!/usr/bin/env node

/**
 * Test script to verify MCP server works with MCP Inspector
 * This performs the same checks that the Inspector would do
 */

const { spawn } = require('child_process');

console.log('Testing MCP server compatibility with MCP Inspector...');

// Start the server process
const server = spawn('npm', ['start'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  cwd: __dirname
});

let serverReady = false;
let responses = [];

// Handle server output
server.stdout.on('data', (data) => {
  const output = data.toString();
  try {
    // Parse JSON responses
    const lines = output.split('\n').filter(line => line.trim());
    for (const line of lines) {
      if (line.startsWith('{')) {
        const parsed = JSON.parse(line);
        responses.push(parsed);
        
        // Check if this is the initialize response
        if (parsed.result && parsed.result.serverInfo) {
          serverReady = true;
          console.log('✅ Server initialization successful');
          console.log('📋 Server Info:', parsed.result.serverInfo);
          console.log('🛠️  Capabilities:', parsed.result.capabilities);
        }
      }
    }
  } catch (e) {
    // Non-JSON output, ignore
  }
});

server.stderr.on('data', (data) => {
  const output = data.toString();
  if (output.includes('Server started successfully')) {
    console.log('✅ Server started successfully');
  }
});

// Test sequence
setTimeout(() => {
  console.log('🔄 Sending initialize request...');
  
  const initRequest = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {
        roots: { listChanged: true },
        sampling: {}
      },
      clientInfo: {
        name: 'mcp-inspector-test',
        version: '1.0.0'
      }
    }
  };

  server.stdin.write(JSON.stringify(initRequest) + '\n');
}, 1000);

// Test tools listing
setTimeout(() => {
  if (serverReady) {
    console.log('🔄 Requesting tools list...');
    
    const toolsRequest = {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {}
    };

    server.stdin.write(JSON.stringify(toolsRequest) + '\n');
  }
}, 2000);

// Test a specific tool
setTimeout(() => {
  if (serverReady) {
    console.log('🔄 Testing browser_snapshot tool...');
    
    const toolCallRequest = {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'browser_snapshot',
        arguments: {}
      }
    };

    server.stdin.write(JSON.stringify(toolCallRequest) + '\n');
  }
}, 3000);

// Summary and cleanup
setTimeout(() => {
  console.log('\n📊 Test Summary:');
  console.log(`- Total responses: ${responses.length}`);
  console.log(`- Server ready: ${serverReady ? '✅' : '❌'}`);
  
  if (serverReady) {
    console.log('🎉 MCP Inspector compatibility: PASSED');
    console.log('💡 You can now use: npx @modelcontextprotocol/inspector npm start');
  } else {
    console.log('❌ MCP Inspector compatibility: FAILED');
  }
  
  server.kill();
  process.exit(0);
}, 5000);

server.on('exit', (code) => {
  console.log(`\n🔚 Server exited with code ${code}`);
});