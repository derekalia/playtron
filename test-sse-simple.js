#!/usr/bin/env node

/**
 * Simple test to check if SSE endpoint is accessible
 */

const http = require('http');

const MCP_PORT = 3001;

console.log('🔍 Testing basic HTTP connectivity...');

// Test if server is running
http.get(`http://localhost:${MCP_PORT}/`, (res) => {
  console.log(`✅ Server responded with status: ${res.statusCode}`);
  console.log(`   Headers:`, res.headers);
  
  let data = '';
  res.on('data', chunk => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log(`   Body: ${data}`);
  });
}).on('error', (err) => {
  console.error('❌ Connection error:', err.message);
  console.error('💡 Make sure the MCP server is running with: npm run start:sse');
});

// Test SSE endpoint
setTimeout(() => {
  console.log('\n🔍 Testing SSE endpoint...');
  http.get(`http://localhost:${MCP_PORT}/sse`, (res) => {
    console.log(`✅ SSE endpoint responded with status: ${res.statusCode}`);
    console.log(`   Headers:`, res.headers);
    
    res.on('data', chunk => {
      console.log(`   SSE data: ${chunk.toString()}`);
    });
    
    setTimeout(() => {
      res.destroy();
      process.exit(0);
    }, 2000);
  }).on('error', (err) => {
    console.error('❌ SSE endpoint error:', err.message);
  });
}, 1000);