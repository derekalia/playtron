#!/bin/bash

# Stop Playtron server gracefully

echo "🛑 Stopping Playtron server..."

# Check if lock file exists
if [ -f ".playtron.lock" ]; then
    PID=$(cat .playtron.lock)
    
    # Check if process exists
    if kill -0 $PID 2>/dev/null; then
        echo "Found Playtron process (PID: $PID)"
        
        # Send SIGTERM for graceful shutdown
        kill -TERM $PID
        
        # Wait for process to exit (max 5 seconds)
        for i in {1..10}; do
            if ! kill -0 $PID 2>/dev/null; then
                echo "✅ Playtron server stopped successfully"
                exit 0
            fi
            sleep 0.5
        done
        
        # If still running, force kill
        echo "⚠️  Process didn't stop gracefully, forcing kill..."
        kill -9 $PID
        rm -f .playtron.lock
    else
        echo "⚠️  Lock file exists but process is not running"
        rm -f .playtron.lock
    fi
else
    echo "No lock file found, checking for running processes..."
    
    # Find any playtron processes
    PIDS=$(ps aux | grep -E "tsx.*src/index\.ts|node.*playtron" | grep -v grep | awk '{print $2}')
    
    if [ -n "$PIDS" ]; then
        echo "Found Playtron processes: $PIDS"
        for PID in $PIDS; do
            kill -TERM $PID
        done
        sleep 1
        echo "✅ Stopped all Playtron processes"
    else
        echo "No Playtron processes found"
    fi
fi

echo "🧹 Cleanup complete"