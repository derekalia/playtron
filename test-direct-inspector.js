#!/usr/bin/env node

/**
 * Test the MCP server directly with Inspector-style requests
 * This simulates what the MCP Inspector would do
 */

const { spawn } = require('child_process');

console.log('Testing MCP server with Inspector-style requests...');

// Start the server
const server = spawn('npm', ['start'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  cwd: __dirname
});

let testResults = {
  initialize: false,
  tools_list: false,
  tool_call: false,
  errors: []
};

// Handle responses
server.stdout.on('data', (data) => {
  const output = data.toString();
  try {
    const lines = output.split('\n').filter(line => line.trim());
    for (const line of lines) {
      if (line.startsWith('{')) {
        const response = JSON.parse(line);
        
        // Check initialize response
        if (response.result && response.result.serverInfo) {
          testResults.initialize = true;
          console.log('✅ Initialize: SUCCESS');
          console.log('   Server:', response.result.serverInfo.name, response.result.serverInfo.version);
          console.log('   Protocol:', response.result.protocolVersion);
        }
        
        // Check tools list response
        if (response.result && response.result.tools) {
          testResults.tools_list = true;
          console.log('✅ Tools List: SUCCESS');
          console.log(`   Found ${response.result.tools.length} tools`);
          response.result.tools.forEach((tool, i) => {
            console.log(`   ${i + 1}. ${tool.name} - ${tool.description}`);
          });
        }
        
        // Check tool call response
        if (response.result && response.result.content) {
          testResults.tool_call = true;
          console.log('✅ Tool Call: SUCCESS');
          console.log('   Response:', response.result.content[0].text);
        }
        
        // Check for errors
        if (response.error) {
          testResults.errors.push(response.error);
          console.log('❌ Error:', response.error.message);
        }
      }
    }
  } catch (e) {
    // Non-JSON output
  }
});

server.stderr.on('data', (data) => {
  // Log server startup
  if (data.toString().includes('Server started successfully')) {
    console.log('🟢 Server started successfully');
  }
});

// Test sequence
setTimeout(() => {
  console.log('\n🔄 Step 1: Initialize server...');
  server.stdin.write(JSON.stringify({
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
  }) + '\n');
}, 1000);

setTimeout(() => {
  console.log('\n🔄 Step 2: List tools...');
  server.stdin.write(JSON.stringify({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
    params: {}
  }) + '\n');
}, 2000);

setTimeout(() => {
  console.log('\n🔄 Step 3: Call a tool...');
  server.stdin.write(JSON.stringify({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'getPageInfo',
      arguments: {}
    }
  }) + '\n');
}, 3000);

// Summary
setTimeout(() => {
  console.log('\n📊 TEST SUMMARY');
  console.log('================');
  console.log(`Initialize: ${testResults.initialize ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Tools List: ${testResults.tools_list ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Tool Call:  ${testResults.tool_call ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Errors:     ${testResults.errors.length === 0 ? '✅ NONE' : `❌ ${testResults.errors.length}`}`);
  
  const allPassed = testResults.initialize && testResults.tools_list && testResults.tool_call && testResults.errors.length === 0;
  
  console.log('\n🎯 OVERALL RESULT');
  console.log(`MCP Inspector Compatibility: ${allPassed ? '✅ FULLY COMPATIBLE' : '❌ ISSUES FOUND'}`);
  
  if (allPassed) {
    console.log('\n💡 Your server is ready for MCP Inspector!');
    console.log('   Run: npm run inspect');
  } else {
    console.log('\n🔧 Issues found that need fixing:');
    testResults.errors.forEach(error => console.log(`   - ${error.message}`));
  }
  
  server.kill();
  process.exit(allPassed ? 0 : 1);
}, 5000);

server.on('exit', (code) => {
  console.log(`\n🔚 Server process exited with code ${code}`);
});