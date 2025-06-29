/**
 * Modular Independence Tests
 * Verifies that the MCP server and its components work independently
 */

const MCPServer = require('../../../src/mcp/server');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs').promises;

// Test without mocking dependencies to verify true independence
describe('MCP Modular Independence Tests', () => {
    describe('Standalone MCP Server', () => {
        let server;
        const TEST_PORT = 3006;
        
        test('MCP server should start without pipeline dependencies', async () => {
            // Create server without any mocks
            server = new MCPServer({
                port: TEST_PORT,
                host: 'localhost',
                enableLogging: false
            });
            
            // Should start successfully
            await expect(server.start()).resolves.not.toThrow();
            
            // Verify server is listening
            const client = new WebSocket(`ws://localhost:${TEST_PORT}`);
            
            await new Promise((resolve, reject) => {
                client.on('open', resolve);
                client.on('error', reject);
            });
            
            client.close();
            await server.shutdown();
        });
        
        test('MCP server should handle requests without backend services', async () => {
            // Start server
            server = new MCPServer({
                port: TEST_PORT,
                host: 'localhost',
                enableLogging: false
            });
            await server.start();
            
            // Connect client
            const client = new WebSocket(`ws://localhost:${TEST_PORT}`);
            await new Promise((resolve) => {
                client.on('open', resolve);
            });
            
            // Wait for init message
            await new Promise((resolve) => {
                client.once('message', resolve);
            });
            
            // Test basic protocol operations
            const response = await new Promise((resolve) => {
                client.once('message', (data) => {
                    resolve(JSON.parse(data.toString()));
                });
                
                client.send(JSON.stringify({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'tools/list'
                }));
            });
            
            expect(response).toMatchObject({
                jsonrpc: '2.0',
                id: 1,
                result: {
                    tools: expect.any(Array)
                }
            });
            
            client.close();
            await server.shutdown();
        });
    });
    
    describe('Component Isolation', () => {
        let server;
        const TEST_PORT = 3007;
        
        beforeEach(async () => {
            server = new MCPServer({
                port: TEST_PORT,
                host: 'localhost',
                enableLogging: false
            });
            await server.start();
        });
        
        afterEach(async () => {
            await server.shutdown();
        });
        
        test('Tool registry should work independently', () => {
            const tools = server.initializeTools();
            
            expect(tools).toBeDefined();
            expect(Object.keys(tools).length).toBeGreaterThan(0);
            
            // Verify tool structure
            Object.values(tools).forEach(tool => {
                expect(tool).toHaveProperty('name');
                expect(tool).toHaveProperty('description');
                expect(tool).toHaveProperty('inputSchema');
            });
        });
        
        test('Message validation should work independently', () => {
            const schema = {
                type: 'object',
                properties: {
                    name: { type: 'string' },
                    age: { type: 'number' }
                },
                required: ['name']
            };
            
            // Valid input
            const validResult = server.validateArguments(
                { name: 'test', age: 25 },
                schema
            );
            expect(validResult.valid).toBe(true);
            expect(validResult.errors).toHaveLength(0);
            
            // Missing required field
            const missingResult = server.validateArguments(
                { age: 25 },
                schema
            );
            expect(missingResult.valid).toBe(false);
            expect(missingResult.errors).toContain('Missing required field: name');
            
            // Wrong type
            const wrongTypeResult = server.validateArguments(
                { name: 'test', age: 'not-a-number' },
                schema
            );
            expect(wrongTypeResult.valid).toBe(false);
            expect(wrongTypeResult.errors[0]).toContain('Invalid type for age');
        });
        
        test('Client session management should work independently', () => {
            // Simulate connections
            const mockWs1 = { readyState: 1, send: jest.fn(), close: jest.fn() };
            const mockWs2 = { readyState: 1, send: jest.fn(), close: jest.fn() };
            
            server.handleConnection(mockWs1, {});
            server.handleConnection(mockWs2, {});
            
            expect(server.clients.size).toBe(2);
            
            // Get client IDs
            const clientIds = Array.from(server.clients.keys());
            
            // Verify session data
            clientIds.forEach(id => {
                const client = server.clients.get(id);
                expect(client.session).toHaveProperty('id');
                expect(client.session).toHaveProperty('connectedAt');
                expect(client.session).toHaveProperty('lastActivity');
            });
            
            // Test disconnection
            server.handleDisconnection(clientIds[0]);
            expect(server.clients.size).toBe(1);
        });
    });
    
    describe('Protocol Independence', () => {
        let server;
        let client;
        const TEST_PORT = 3008;
        
        beforeEach(async () => {
            server = new MCPServer({
                port: TEST_PORT,
                host: 'localhost',
                enableLogging: false
            });
            await server.start();
            
            client = new WebSocket(`ws://localhost:${TEST_PORT}`);
            await new Promise((resolve) => {
                client.on('open', resolve);
            });
            
            // Skip init message
            await new Promise((resolve) => {
                client.once('message', resolve);
            });
        });
        
        afterEach(async () => {
            client.close();
            await server.shutdown();
        });
        
        test('JSON-RPC handling should work without external dependencies', async () => {
            const testCases = [
                {
                    request: { jsonrpc: '2.0', id: 1, method: 'ping' },
                    expectedResult: { pong: true }
                },
                {
                    request: { jsonrpc: '2.0', id: 2, method: 'tools/list' },
                    expectedResult: expect.objectContaining({ tools: expect.any(Array) })
                }
            ];
            
            for (const testCase of testCases) {
                const response = await new Promise((resolve) => {
                    client.once('message', (data) => {
                        resolve(JSON.parse(data.toString()));
                    });
                    
                    client.send(JSON.stringify(testCase.request));
                });
                
                expect(response).toMatchObject({
                    jsonrpc: '2.0',
                    id: testCase.request.id,
                    result: testCase.expectedResult
                });
            }
        });
        
        test('Error handling should work independently', async () => {
            const errorCases = [
                {
                    request: 'invalid json',
                    expectedError: { code: -32700, message: 'Parse error' }
                },
                {
                    request: { id: 1, method: 'test' }, // Missing jsonrpc
                    expectedError: { code: -32600, message: 'Invalid Request' }
                },
                {
                    request: { jsonrpc: '2.0', id: 2, method: 'unknown' },
                    expectedError: { code: -32601, message: expect.stringContaining('Method not found') }
                }
            ];
            
            for (const errorCase of errorCases) {
                const response = await new Promise((resolve) => {
                    client.once('message', (data) => {
                        resolve(JSON.parse(data.toString()));
                    });
                    
                    if (typeof errorCase.request === 'string') {
                        client.send(errorCase.request);
                    } else {
                        client.send(JSON.stringify(errorCase.request));
                    }
                });
                
                expect(response).toMatchObject({
                    jsonrpc: '2.0',
                    error: errorCase.expectedError
                });
            }
        });
    });
    
    describe('Minimal Configuration', () => {
        test('Server should work with minimal configuration', async () => {
            const minimalServer = new MCPServer();
            
            // Should use defaults
            expect(minimalServer.port).toBe(3003);
            expect(minimalServer.host).toBe('localhost');
            expect(minimalServer.config.enableLogging).toBe(true);
            expect(minimalServer.config.maxConcurrentPipelines).toBe(5);
            
            // Should still be functional
            await minimalServer.start();
            
            const client = new WebSocket(`ws://localhost:3003`);
            await new Promise((resolve, reject) => {
                client.on('open', resolve);
                client.on('error', reject);
            });
            
            client.close();
            await minimalServer.shutdown();
        });
    });
    
    describe('Custom Tool Registration', () => {
        test('Should allow extending with custom tools', async () => {
            // Create extended server
            class ExtendedMCPServer extends MCPServer {
                initializeTools() {
                    const baseTools = super.initializeTools();
                    
                    // Add custom tool
                    return {
                        ...baseTools,
                        'custom/echo': {
                            name: 'custom/echo',
                            description: 'Echo back the input',
                            inputSchema: {
                                type: 'object',
                                properties: {
                                    message: { type: 'string' }
                                },
                                required: ['message']
                            }
                        }
                    };
                }
                
                async executeTool(toolName, args, client) {
                    if (toolName === 'custom/echo') {
                        return { echo: args.message };
                    }
                    return super.executeTool(toolName, args, client);
                }
            }
            
            const extendedServer = new ExtendedMCPServer({
                port: 3009,
                enableLogging: false
            });
            
            await extendedServer.start();
            
            const client = new WebSocket('ws://localhost:3009');
            await new Promise((resolve) => {
                client.on('open', resolve);
            });
            
            // Skip init
            await new Promise((resolve) => {
                client.once('message', resolve);
            });
            
            // Test custom tool
            const response = await new Promise((resolve) => {
                client.once('message', (data) => {
                    resolve(JSON.parse(data.toString()));
                });
                
                client.send(JSON.stringify({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'tools/call',
                    params: {
                        name: 'custom/echo',
                        arguments: { message: 'Hello MCP!' }
                    }
                }));
            });
            
            expect(response).toMatchObject({
                jsonrpc: '2.0',
                id: 1,
                result: { echo: 'Hello MCP!' }
            });
            
            client.close();
            await extendedServer.shutdown();
        });
    });
    
    describe('Memory Efficiency', () => {
        test('Should clean up resources properly', async () => {
            const server = new MCPServer({
                port: 3010,
                enableLogging: false
            });
            
            await server.start();
            
            // Create and disconnect multiple clients
            for (let i = 0; i < 10; i++) {
                const client = new WebSocket('ws://localhost:3010');
                await new Promise((resolve) => {
                    client.on('open', resolve);
                });
                
                // Verify client is tracked
                expect(server.clients.size).toBe(i + 1);
                
                client.close();
                await new Promise(resolve => setTimeout(resolve, 50));
                
                // Verify client is removed
                expect(server.clients.size).toBe(i);
            }
            
            // Create some pipelines
            for (let i = 0; i < 5; i++) {
                server.activePipelines.set(`pipeline-${i}`, {
                    id: `pipeline-${i}`,
                    status: 'completed'
                });
            }
            
            expect(server.activePipelines.size).toBe(5);
            
            await server.shutdown();
            
            // Verify cleanup
            expect(server.clients.size).toBe(0);
        });
    });
});