#!/usr/bin/env node

/**
 * Test script to verify SSE MCP server connection
 * This simulates how an SSE MCP client would connect to the server
 */

const EventSource = require('eventsource');
const fetch = require('node-fetch');

const MCP_PORT = 3001;
const SSE_URL = `http://localhost:${MCP_PORT}/sse`;
const MESSAGE_URL = `http://localhost:${MCP_PORT}/message`;

console.log('🔌 Testing SSE MCP connection...');
console.log(`📡 SSE endpoint: ${SSE_URL}`);
console.log(`📡 Message endpoint: ${MESSAGE_URL}`);

// Create SSE connection
const eventSource = new EventSource(SSE_URL);

eventSource.onopen = () => {
  console.log('✅ SSE connection established');
  
  // Send initialize request via POST
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
        name: 'test-sse-client',
        version: '1.0.0'
      }
    }
  };

  console.log('📤 Sending initialize request...');
  fetch(MESSAGE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(initRequest)
  }).catch(err => {
    console.error('❌ Error sending initialize request:', err.message);
  });

  // Request tools list after initialization
  setTimeout(() => {
    const toolsRequest = {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {}
    };

    console.log('📤 Requesting tools list...');
    fetch(MESSAGE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(toolsRequest)
    }).catch(err => {
      console.error('❌ Error requesting tools:', err.message);
    });
  }, 1000);

  // Close connection after 5 seconds
  setTimeout(() => {
    console.log('🔚 Closing connection...');
    eventSource.close();
    process.exit(0);
  }, 5000);
};

eventSource.onmessage = (event) => {
  try {
    const message = JSON.parse(event.data);
    console.log('📥 Received:', JSON.stringify(message, null, 2));
    
    if (message.result && message.result.tools) {
      console.log(`🛠️  Found ${message.result.tools.length} tools!`);
      message.result.tools.forEach(tool => {
        console.log(`   - ${tool.name}: ${tool.description}`);
      });
    }
  } catch (error) {
    console.log('📥 Raw message:', event.data);
  }
};

eventSource.onerror = (error) => {
  console.error('❌ SSE error:', error);
  console.error('💡 Make sure the MCP server is running with: npm run start:sse');
  eventSource.close();
  process.exit(1);
};

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n🛑 Terminating test...');
  eventSource.close();
  process.exit(0);
});