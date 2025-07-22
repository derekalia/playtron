#!/bin/bash

# Emergency cleanup script for Playtron processes

echo "🧹 Playtron Process Cleanup Utility"
echo "=================================="
echo "This script will find and kill ALL Playtron-related processes"
echo ""

# Function to kill process
kill_process() {
    local PID=$1
    if kill -0 $PID 2>/dev/null; then
        echo "  Killing PID $PID..."
        kill -9 $PID 2>/dev/null
    fi
}

# Find all related processes
echo "Searching for Playtron processes..."

# Search patterns
PATTERNS=(
    "playtron-mcp-server"
    "tsx.*src/index\.ts"
    "node.*start-playtron"
    "node.*playtron"
    "fastmcp.*playtron"
)

FOUND_PIDS=""

for PATTERN in "${PATTERNS[@]}"; do
    PIDS=$(ps aux | grep -E "$PATTERN" | grep -v grep | grep -v cleanup-playtron | awk '{print $2}')
    if [ -n "$PIDS" ]; then
        FOUND_PIDS="$FOUND_PIDS $PIDS"
    fi
done

# Remove duplicates
UNIQUE_PIDS=$(echo $FOUND_PIDS | tr ' ' '\n' | sort -u | tr '\n' ' ')

if [ -z "$UNIQUE_PIDS" ]; then
    echo "✅ No Playtron processes found"
else
    echo "Found the following PIDs: $UNIQUE_PIDS"
    echo ""
    
    # Show process details
    for PID in $UNIQUE_PIDS; do
        if ps -p $PID > /dev/null 2>&1; then
            echo "PID $PID:"
            ps -p $PID -o pid,ppid,user,comm,args | tail -n 1
        fi
    done
    
    echo ""
    read -p "Kill all these processes? (y/N) " -n 1 -r
    echo ""
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        for PID in $UNIQUE_PIDS; do
            kill_process $PID
        done
        echo "✅ All processes killed"
    else
        echo "❌ Aborted"
    fi
fi

# Clean up files
echo ""
echo "Cleaning up lock files..."
rm -f .playtron.lock .playtron.process.json

echo "✅ Cleanup complete"