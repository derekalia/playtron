#!/bin/bash

# Test script for Control-C handling

echo "==================================="
echo "Testing Playtron Control-C Handling"
echo "==================================="
echo ""
echo "This script will:"
echo "1. Start the Playtron server"
echo "2. Wait a few seconds"
echo "3. Send Control-C"
echo "4. Verify clean shutdown"
echo ""

# Clean up any existing processes first
if [ -f ".playtron.process.json" ] || [ -f ".playtron.lock" ]; then
    echo "Cleaning up existing processes..."
    ./stop-playtron.sh > /dev/null 2>&1
    sleep 1
fi

echo "Starting Playtron server..."
npm start &
SERVER_PID=$!

echo "Server started with PID: $SERVER_PID"
echo "Waiting 3 seconds for server to initialize..."
sleep 3

echo ""
echo "Sending Control-C (SIGINT) to server..."
kill -INT $SERVER_PID

echo "Waiting for graceful shutdown..."
COUNTER=0
while kill -0 $SERVER_PID 2>/dev/null && [ $COUNTER -lt 10 ]; do
    sleep 0.5
    COUNTER=$((COUNTER + 1))
done

echo ""
if kill -0 $SERVER_PID 2>/dev/null; then
    echo "❌ FAILED: Server did not shut down gracefully"
    echo "   Server is still running after 5 seconds"
    echo "   Forcing kill..."
    kill -9 $SERVER_PID
    exit 1
else
    echo "✅ SUCCESS: Server shut down gracefully"
fi

# Check for leftover files
echo ""
echo "Checking for cleanup..."
if [ -f ".playtron.process.json" ]; then
    echo "❌ WARNING: Process info file was not cleaned up"
else
    echo "✅ Process info file cleaned up"
fi

if [ -f ".playtron.lock" ]; then
    echo "❌ WARNING: Lock file was not cleaned up"
else
    echo "✅ Lock file cleaned up"
fi

# Check for orphaned processes
echo ""
echo "Checking for orphaned processes..."
ORPHANS=$(ps aux | grep -E "playtron-mcp-server|tsx.*src/index\.ts" | grep -v grep | wc -l)
if [ $ORPHANS -gt 0 ]; then
    echo "❌ WARNING: Found $ORPHANS orphaned process(es)"
    ps aux | grep -E "playtron-mcp-server|tsx.*src/index\.ts" | grep -v grep
else
    echo "✅ No orphaned processes found"
fi

echo ""
echo "Test complete!"