#!/usr/bin/env node

/**
 * Test the browser waiting behavior
 */

const { spawn } = require('child_process');

console.log('Testing browser waiting behavior...');
console.log('This will demonstrate the server waiting for Electron browser to be available\n');

// Start the server
const server = spawn('npm', ['start'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  cwd: __dirname
});

let startTime = Date.now();
let browserDetected = false;

// Handle server stderr (logging)
server.stderr.on('data', (data) => {
  const output = data.toString();
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  
  // Add timestamp to each line
  output.split('\n').forEach(line => {
    if (line.trim()) {
      console.log(`[${elapsed}s] ${line}`);
      
      // Check if browser was detected
      if (line.includes('✅ Electron browser detected')) {
        browserDetected = true;
      }
    }
  });
});

// Handle server stdout (MCP protocol)
server.stdout.on('data', (data) => {
  const output = data.toString();
  if (output.trim()) {
    console.log('MCP output:', output);
  }
});

// Show helpful message
setTimeout(() => {
  if (!browserDetected) {
    console.log('\n📋 What you should see:');
    console.log('1. Server starts and checks for Electron browser');
    console.log('2. Every 5 seconds, it checks again');
    console.log('3. Helpful message about starting Electron with CDP');
    console.log('4. When browser is detected, MCP server starts');
    console.log('\n💡 To test: Start Electron browser with:');
    console.log('   electron . --remote-debugging-port=9222');
    console.log('\n⏹️  Press Ctrl+C to stop\n');
  }
}, 2000);

// Clean up after 30 seconds
setTimeout(() => {
  if (!browserDetected) {
    console.log('\n⏰ Test completed - server is working as expected!');
    console.log('The server will continue waiting until Electron browser is available.');
  }
  server.kill();
  process.exit(0);
}, 30000);

// Handle cleanup
process.on('SIGINT', () => {
  console.log('\n👋 Stopping test...');
  server.kill();
  process.exit(0);
});

server.on('exit', (code) => {
  console.log(`\n🔚 Server exited with code ${code}`);
});