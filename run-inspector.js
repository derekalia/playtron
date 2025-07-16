#!/usr/bin/env node

/**
 * Launch MCP Inspector with the correct server command
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Launching MCP Inspector...');
console.log('📁 Working directory:', __dirname);
console.log('🔧 Server command: npm start');

// Run the inspector with the correct command
const inspector = spawn('npx', [
  '@modelcontextprotocol/inspector',
  'npm',
  'start'
], {
  cwd: __dirname,
  stdio: 'inherit',
  env: {
    ...process.env,
    // Set working directory for the inspector
    PWD: __dirname
  }
});

inspector.on('error', (error) => {
  console.error('❌ Failed to start MCP Inspector:', error.message);
  process.exit(1);
});

inspector.on('exit', (code) => {
  console.log(`\n🔚 MCP Inspector exited with code ${code}`);
  process.exit(code);
});

// Handle cleanup
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down MCP Inspector...');
  inspector.kill('SIGINT');
});

process.on('SIGTERM', () => {
  console.log('\n👋 Shutting down MCP Inspector...');
  inspector.kill('SIGTERM');
});