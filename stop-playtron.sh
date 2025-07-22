#!/bin/bash

# Stop Playtron server gracefully

echo "🛑 Stopping Playtron MCP Server..."

# Function to stop a process gracefully
stop_process() {
    local PID=$1
    local NAME=$2
    
    if kill -0 $PID 2>/dev/null; then
        echo "  Stopping $NAME (PID: $PID)..."
        
        # Send SIGTERM for graceful shutdown
        kill -TERM $PID
        
        # Wait for process to exit (max 5 seconds)
        local count=0
        while kill -0 $PID 2>/dev/null && [ $count -lt 10 ]; do
            sleep 0.5
            count=$((count + 1))
        done
        
        if kill -0 $PID 2>/dev/null; then
            echo "  ⚠️  Process didn't stop gracefully, forcing kill..."
            kill -9 $PID
        else
            echo "  ✅ $NAME stopped successfully"
        fi
    fi
}

# Check for process info file (new method)
if [ -f ".playtron.process.json" ]; then
    echo "Found process info file"
    
    # Extract PIDs using basic tools (works on macOS)
    WRAPPER_PID=$(grep '"wrapperPid"' .playtron.process.json | sed 's/[^0-9]//g')
    CHILD_PID=$(grep '"childPid"' .playtron.process.json | sed 's/[^0-9]//g')
    
    if [ -n "$WRAPPER_PID" ]; then
        stop_process $WRAPPER_PID "Wrapper process"
    fi
    
    if [ -n "$CHILD_PID" ]; then
        stop_process $CHILD_PID "Child process"
    fi
    
    rm -f .playtron.process.json
fi

# Check for lock file (legacy method)
if [ -f ".playtron.lock" ]; then
    echo "Found legacy lock file"
    PID=$(cat .playtron.lock)
    stop_process $PID "Legacy process"
    rm -f .playtron.lock
fi

# Find any remaining playtron processes
echo "Checking for any remaining processes..."

# Find processes by name
PIDS=$(ps aux | grep -E "playtron-mcp-server|tsx.*src/index\.ts|node.*playtron" | grep -v grep | awk '{print $2}')

if [ -n "$PIDS" ]; then
    echo "Found additional Playtron processes:"
    for PID in $PIDS; do
        # Get process info
        PINFO=$(ps -p $PID -o comm= 2>/dev/null || echo "unknown")
        echo "  PID $PID: $PINFO"
        stop_process $PID "Process"
    done
else
    echo "No additional Playtron processes found"
fi

# Clean up any stale files
echo "🧹 Cleaning up..."
rm -f .playtron.lock .playtron.process.json

# Check if any processes are still running
REMAINING=$(ps aux | grep -E "playtron-mcp-server|tsx.*src/index\.ts" | grep -v grep | wc -l)
if [ $REMAINING -gt 0 ]; then
    echo "⚠️  Warning: $REMAINING Playtron process(es) may still be running"
    echo "You may need to manually kill them or run this script again"
else
    echo "✅ All Playtron processes have been stopped"
fi