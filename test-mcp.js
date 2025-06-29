#!/usr/bin/env node

/**
 * Test script for MCP server
 * Sends JSON-RPC requests and displays responses
 */

const { spawn } = require('child_process');
const readline = require('readline');

// Start the MCP server
const mcpServer = spawn('node', ['src/mcp-server-simple.js']);

// Create interface to read server responses
const rl = readline.createInterface({
  input: mcpServer.stdout,
  crlfDelay: Infinity
});

// Handle server responses
rl.on('line', (line) => {
  try {
    const response = JSON.parse(line);
    console.log('Response:', JSON.stringify(response, null, 2));
  } catch (error) {
    console.log('Raw output:', line);
  }
});

// Handle server errors
mcpServer.stderr.on('data', (data) => {
  console.error('Server log:', data.toString());
});

// Send test requests
async function runTests() {
  console.log('Testing MCP server...\n');

  // Test 1: Initialize
  console.log('1. Sending initialize request...');
  sendRequest({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '1.0'
    }
  });

  await sleep(1000);

  // Test 2: List tools
  console.log('\n2. Sending tools/list request...');
  sendRequest({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
    params: {}
  });

  await sleep(1000);

  // Test 3: Call a tool
  console.log('\n3. Calling analyzeCodebase tool...');
  sendRequest({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'analyzeCodebase',
      arguments: {
        projectPath: '/path/to/test/project'
      }
    }
  });

  await sleep(1000);

  // Test 4: Invalid request
  console.log('\n4. Sending invalid request...');
  sendRequest({
    jsonrpc: '2.0',
    id: 4,
    method: 'unknown/method'
  });

  await sleep(1000);

  console.log('\nTests completed. Closing server...');
  mcpServer.kill();
  process.exit(0);
}

function sendRequest(request) {
  const jsonStr = JSON.stringify(request);
  console.log('Request:', jsonStr);
  mcpServer.stdin.write(jsonStr + '\n');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Handle server exit
mcpServer.on('close', (code) => {
  console.log(`Server exited with code ${code}`);
  process.exit(code);
});

// Run tests
runTests();