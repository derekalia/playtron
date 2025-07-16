#!/bin/bash

echo "🔍 Testing MCP SSE endpoints with curl..."
echo ""

# Test root endpoint
echo "1. Testing root endpoint:"
curl -i http://localhost:3001/
echo ""
echo ""

# Test SSE endpoint
echo "2. Testing SSE endpoint (will run for 5 seconds):"
timeout 5 curl -i -H "Accept: text/event-stream" http://localhost:3001/sse
echo ""
echo ""

# Test message endpoint with initialize
echo "3. Testing message endpoint with initialize request:"
curl -i -X POST http://localhost:3001/message \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {
        "roots": {
          "listChanged": true
        }
      },
      "clientInfo": {
        "name": "curl-test",
        "version": "1.0.0"
      }
    }
  }'
echo ""
echo ""

# Test tools list
echo "4. Testing tools/list request:"
curl -i -X POST http://localhost:3001/message \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/list",
    "params": {}
  }'