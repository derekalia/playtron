#!/bin/bash

# Show status of Playtron processes

echo "======================================"
echo "📊 Playtron Process Status"
echo "======================================"
echo ""

# Check process info file
if [ -f ".playtron.process.json" ]; then
    echo "📄 Process Info File:"
    cat .playtron.process.json | sed 's/^/   /'
    echo ""
    
    # Extract PIDs
    WRAPPER_PID=$(grep '"wrapperPid"' .playtron.process.json | sed 's/[^0-9]//g')
    CHILD_PID=$(grep '"childPid"' .playtron.process.json | sed 's/[^0-9]//g')
    
    # Check if processes are running
    echo "🔍 Process Status:"
    if [ -n "$WRAPPER_PID" ] && kill -0 $WRAPPER_PID 2>/dev/null; then
        echo "   ✅ Wrapper process is running (PID: $WRAPPER_PID)"
    else
        echo "   ❌ Wrapper process is NOT running"
    fi
    
    if [ -n "$CHILD_PID" ] && kill -0 $CHILD_PID 2>/dev/null; then
        echo "   ✅ Child process is running (PID: $CHILD_PID)"
    else
        echo "   ❌ Child process is NOT running"
    fi
else
    echo "❌ No process info file found"
fi

# Check lock file
echo ""
if [ -f ".playtron.lock" ]; then
    LOCK_PID=$(cat .playtron.lock)
    echo "🔒 Lock File:"
    echo "   PID: $LOCK_PID"
    if kill -0 $LOCK_PID 2>/dev/null; then
        echo "   ✅ Process is running"
    else
        echo "   ❌ Process is NOT running (stale lock file)"
    fi
else
    echo "🔓 No lock file found"
fi

# List all related processes
echo ""
echo "🔍 All Playtron-related processes:"
PROCESSES=$(ps aux | grep -E "playtron-mcp-server|tsx.*src/index\.ts|node.*playtron" | grep -v grep | grep -v status-playtron)

if [ -z "$PROCESSES" ]; then
    echo "   No processes found"
else
    echo "$PROCESSES" | while read line; do
        PID=$(echo "$line" | awk '{print $2}')
        CMD=$(echo "$line" | awk '{$1=$2=$3=$4=$5=$6=$7=$8=$9=$10=""; print $0}' | sed 's/^ *//')
        echo "   PID $PID: $CMD"
    done
fi

echo ""
echo "======================================"