/**
 * MCP Server Protocol Tests
 * Tests the MCP server's compliance with the Model Context Protocol
 */

const WebSocket = require('ws');
const MCPServer = require('../../../src/mcp/server');
const path = require('path');
const fs = require('fs').promises;

// Mock dependencies
jest.mock('../../../src/utils/sqliteDb');
jest.mock('../../../src/utils/logger');
jest.mock('../../../src/agents/EntityScout');
jest.mock('../../../src/agents/GraphBuilder');
jest.mock('../../../src/agents/RelationshipResolver');

describe('MCP Server Protocol Tests', () => {
    let server;
    let client;
    const TEST_PORT = 3004;
    const TEST_HOST = 'localhost';
    
    beforeEach(async () => {
        // Create server instance
        server = new MCPServer({
            port: TEST_PORT,
            host: TEST_HOST,
            enableLogging: false
        });
        
        // Start server
        await server.start();
    });
    
    afterEach(async () => {
        // Close client if exists
        if (client && client.readyState === WebSocket.OPEN) {
            client.close();
        }
        
        // Shutdown server
        await server.shutdown();
    });
    
    /**
     * Helper function to create WebSocket client
     */
    function createClient() {
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(`ws://${TEST_HOST}:${TEST_PORT}`);
            
            ws.on('open', () => {
                resolve(ws);
            });
            
            ws.on('error', reject);
        });
    }
    
    /**
     * Helper function to wait for message
     */
    function waitForMessage(ws, timeout = 5000) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error('Timeout waiting for message'));
            }, timeout);
            
            ws.once('message', (data) => {
                clearTimeout(timer);
                try {
                    const message = JSON.parse(data.toString());
                    resolve(message);
                } catch (error) {
                    reject(error);
                }
            });
        });
    }
    
    /**
     * Helper to send request and wait for response
     */
    async function sendRequest(ws, method, params = {}, id = 1) {
        const request = {
            jsonrpc: '2.0',
            id,
            method,
            params
        };
        
        ws.send(JSON.stringify(request));
        return await waitForMessage(ws);
    }
    
    describe('Connection and Initialization', () => {
        test('should accept WebSocket connections', async () => {
            client = await createClient();
            expect(client.readyState).toBe(WebSocket.OPEN);
        });
        
        test('should send initialization message on connection', async () => {
            client = await createClient();
            const initMessage = await waitForMessage(client);
            
            expect(initMessage).toMatchObject({
                jsonrpc: '2.0',
                method: 'initialize',
                params: {
                    protocolVersion: '1.0.0',
                    capabilities: {
                        tools: expect.arrayContaining([
                            'cognitive-triangulation/analyze',
                            'cognitive-triangulation/get-entities',
                            'cognitive-triangulation/get-relationships',
                            'cognitive-triangulation/export-graph',
                            'cognitive-triangulation/status'
                        ]),
                        features: expect.arrayContaining([
                            'cognitive-triangulation',
                            'batch-operations',
                            'streaming'
                        ])
                    }
                }
            });
        });
        
        test('should handle multiple concurrent connections', async () => {
            const clients = await Promise.all([
                createClient(),
                createClient(),
                createClient()
            ]);
            
            expect(clients).toHaveLength(3);
            clients.forEach(c => {
                expect(c.readyState).toBe(WebSocket.OPEN);
                c.close();
            });
        });
    });
    
    describe('JSON-RPC Protocol Compliance', () => {
        beforeEach(async () => {
            client = await createClient();
            await waitForMessage(client); // Skip init message
        });
        
        test('should reject non-JSON messages', async () => {
            client.send('invalid json');
            const response = await waitForMessage(client);
            
            expect(response).toMatchObject({
                jsonrpc: '2.0',
                id: null,
                error: {
                    code: -32700,
                    message: 'Parse error'
                }
            });
        });
        
        test('should reject messages without jsonrpc field', async () => {
            client.send(JSON.stringify({
                method: 'test',
                params: {}
            }));
            const response = await waitForMessage(client);
            
            expect(response).toMatchObject({
                jsonrpc: '2.0',
                id: null,
                error: {
                    code: -32600,
                    message: 'Invalid Request'
                }
            });
        });
        
        test('should reject invalid jsonrpc version', async () => {
            client.send(JSON.stringify({
                jsonrpc: '1.0',
                method: 'test',
                params: {}
            }));
            const response = await waitForMessage(client);
            
            expect(response).toMatchObject({
                jsonrpc: '2.0',
                id: null,
                error: {
                    code: -32600,
                    message: 'Invalid Request'
                }
            });
        });
        
        test('should handle unknown methods', async () => {
            const response = await sendRequest(client, 'unknown.method');
            
            expect(response).toMatchObject({
                jsonrpc: '2.0',
                id: 1,
                error: {
                    code: -32601,
                    message: expect.stringContaining('Method not found')
                }
            });
        });
    });
    
    describe('Tool Management', () => {
        beforeEach(async () => {
            client = await createClient();
            await waitForMessage(client); // Skip init message
        });
        
        test('should list available tools', async () => {
            const response = await sendRequest(client, 'tools/list');
            
            expect(response).toMatchObject({
                jsonrpc: '2.0',
                id: 1,
                result: {
                    tools: expect.arrayContaining([
                        expect.objectContaining({
                            name: 'cognitive-triangulation/analyze',
                            description: expect.any(String),
                            inputSchema: expect.any(Object)
                        })
                    ])
                }
            });
            
            // Verify all expected tools are present
            const toolNames = response.result.tools.map(t => t.name);
            expect(toolNames).toContain('cognitive-triangulation/analyze');
            expect(toolNames).toContain('cognitive-triangulation/get-entities');
            expect(toolNames).toContain('cognitive-triangulation/get-relationships');
            expect(toolNames).toContain('cognitive-triangulation/export-graph');
            expect(toolNames).toContain('cognitive-triangulation/status');
        });
        
        test('should validate tool call parameters', async () => {
            const response = await sendRequest(client, 'tools/call', {
                name: 'cognitive-triangulation/analyze',
                arguments: {
                    // Missing required 'targetDirectory'
                }
            });
            
            expect(response).toMatchObject({
                jsonrpc: '2.0',
                id: 1,
                error: {
                    code: -32602,
                    message: 'Invalid parameters',
                    data: {
                        validation: expect.arrayContaining([
                            expect.stringContaining('targetDirectory')
                        ])
                    }
                }
            });
        });
        
        test('should reject unknown tools', async () => {
            const response = await sendRequest(client, 'tools/call', {
                name: 'unknown/tool',
                arguments: {}
            });
            
            expect(response).toMatchObject({
                jsonrpc: '2.0',
                id: 1,
                error: {
                    code: -32602,
                    message: expect.stringContaining('Unknown tool')
                }
            });
        });
    });
    
    describe('Cognitive Triangulation Tools', () => {
        let testDir;
        
        beforeEach(async () => {
            client = await createClient();
            await waitForMessage(client); // Skip init message
            
            // Create test directory
            testDir = path.join(__dirname, 'test-project');
            await fs.mkdir(testDir, { recursive: true });
            await fs.writeFile(path.join(testDir, 'test.js'), 'console.log("test");');
            
            // Mock database responses
            const mockDb = require('../../../src/utils/sqliteDb');
            mockDb.get = jest.fn().mockResolvedValue({ count: 5 });
            mockDb.all = jest.fn().mockResolvedValue([
                { id: 1, name: 'TestEntity', type: 'class', confidence: 0.9 }
            ]);
            
            // Mock agent runs
            const EntityScout = require('../../../src/agents/EntityScout');
            EntityScout.prototype.run = jest.fn().mockResolvedValue();
            
            const GraphBuilder = require('../../../src/agents/GraphBuilder');
            GraphBuilder.prototype.run = jest.fn().mockResolvedValue();
            
            const RelationshipResolver = require('../../../src/agents/RelationshipResolver');
            RelationshipResolver.prototype.run = jest.fn().mockResolvedValue();
        });
        
        afterEach(async () => {
            // Clean up test directory
            await fs.rm(testDir, { recursive: true, force: true });
        });
        
        test('should start analysis and return pipeline ID', async () => {
            const response = await sendRequest(client, 'tools/call', {
                name: 'cognitive-triangulation/analyze',
                arguments: {
                    targetDirectory: testDir
                }
            });
            
            expect(response).toMatchObject({
                jsonrpc: '2.0',
                id: 1,
                result: {
                    pipelineId: expect.stringMatching(/^mcp_\d+_[a-f0-9]+$/),
                    status: 'started',
                    message: 'Cognitive triangulation analysis started'
                }
            });
        });
        
        test('should validate target directory exists', async () => {
            const response = await sendRequest(client, 'tools/call', {
                name: 'cognitive-triangulation/analyze',
                arguments: {
                    targetDirectory: '/non/existent/path'
                }
            });
            
            expect(response).toMatchObject({
                jsonrpc: '2.0',
                id: 1,
                error: {
                    code: -32603,
                    message: 'Tool execution failed',
                    data: {
                        tool: 'cognitive-triangulation/analyze',
                        error: expect.stringContaining('Invalid target directory')
                    }
                }
            });
        });
        
        test('should get pipeline status', async () => {
            // Start analysis first
            const startResponse = await sendRequest(client, 'tools/call', {
                name: 'cognitive-triangulation/analyze',
                arguments: {
                    targetDirectory: testDir
                }
            }, 1);
            
            const pipelineId = startResponse.result.pipelineId;
            
            // Get status
            const statusResponse = await sendRequest(client, 'tools/call', {
                name: 'cognitive-triangulation/status',
                arguments: {
                    pipelineId
                }
            }, 2);
            
            expect(statusResponse).toMatchObject({
                jsonrpc: '2.0',
                id: 2,
                result: {
                    id: pipelineId,
                    status: expect.stringMatching(/^(initializing|running|completed|failed)$/),
                    targetDirectory: testDir,
                    startTime: expect.any(String),
                    progress: expect.any(Object)
                }
            });
        });
        
        test('should handle invalid pipeline ID', async () => {
            const response = await sendRequest(client, 'tools/call', {
                name: 'cognitive-triangulation/status',
                arguments: {
                    pipelineId: 'invalid-id'
                }
            });
            
            expect(response).toMatchObject({
                jsonrpc: '2.0',
                id: 1,
                error: {
                    code: -32603,
                    message: 'Tool execution failed',
                    data: {
                        error: expect.stringContaining('Pipeline not found')
                    }
                }
            });
        });
    });
    
    describe('Notifications and Progress', () => {
        let testDir;
        
        beforeEach(async () => {
            client = await createClient();
            await waitForMessage(client); // Skip init message
            
            // Create test directory
            testDir = path.join(__dirname, 'test-project-notifications');
            await fs.mkdir(testDir, { recursive: true });
            
            // Mock for faster execution
            const mockDb = require('../../../src/utils/sqliteDb');
            mockDb.get = jest.fn().mockResolvedValue({ count: 1 });
        });
        
        afterEach(async () => {
            await fs.rm(testDir, { recursive: true, force: true });
        });
        
        test('should send progress notifications during analysis', async () => {
            // Collect messages
            const messages = [];
            client.on('message', (data) => {
                messages.push(JSON.parse(data.toString()));
            });
            
            // Start analysis
            await sendRequest(client, 'tools/call', {
                name: 'cognitive-triangulation/analyze',
                arguments: {
                    targetDirectory: testDir
                }
            });
            
            // Wait for notifications
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Check for progress notifications
            const progressMessages = messages.filter(m => m.method === 'progress');
            expect(progressMessages.length).toBeGreaterThan(0);
            
            progressMessages.forEach(msg => {
                expect(msg).toMatchObject({
                    jsonrpc: '2.0',
                    method: 'progress',
                    params: {
                        pipelineId: expect.any(String),
                        progress: expect.any(Object),
                        status: expect.any(String)
                    }
                });
            });
        });
    });
    
    describe('Authentication', () => {
        test('should require authentication when configured', async () => {
            // Create server with auth
            const authServer = new MCPServer({
                port: TEST_PORT + 1,
                host: TEST_HOST,
                enableLogging: false,
                authToken: 'test-token'
            });
            
            await authServer.start();
            
            try {
                const authClient = await createClient();
                await waitForMessage(authClient); // Skip init
                
                // Try to call without auth
                const response = await sendRequest(authClient, 'tools/list');
                
                expect(response).toMatchObject({
                    jsonrpc: '2.0',
                    id: 1,
                    error: {
                        code: -32001,
                        message: 'Authentication required'
                    }
                });
                
                authClient.close();
            } finally {
                await authServer.shutdown();
            }
        });
    });
    
    describe('Error Handling', () => {
        beforeEach(async () => {
            client = await createClient();
            await waitForMessage(client); // Skip init message
        });
        
        test('should handle internal server errors gracefully', async () => {
            // Mock to throw error
            const EntityScout = require('../../../src/agents/EntityScout');
            EntityScout.mockImplementation(() => {
                throw new Error('Mock error');
            });
            
            const response = await sendRequest(client, 'tools/call', {
                name: 'cognitive-triangulation/analyze',
                arguments: {
                    targetDirectory: '.'
                }
            });
            
            expect(response).toMatchObject({
                jsonrpc: '2.0',
                id: 1,
                error: {
                    code: -32603,
                    message: expect.stringContaining('Tool execution failed')
                }
            });
        });
    });
    
    describe('Concurrent Operations', () => {
        let testDirs = [];
        
        beforeEach(async () => {
            client = await createClient();
            await waitForMessage(client); // Skip init message
            
            // Create multiple test directories
            for (let i = 0; i < 3; i++) {
                const dir = path.join(__dirname, `test-project-${i}`);
                await fs.mkdir(dir, { recursive: true });
                testDirs.push(dir);
            }
        });
        
        afterEach(async () => {
            for (const dir of testDirs) {
                await fs.rm(dir, { recursive: true, force: true });
            }
        });
        
        test('should handle multiple concurrent analyses', async () => {
            const promises = testDirs.map((dir, index) => 
                sendRequest(client, 'tools/call', {
                    name: 'cognitive-triangulation/analyze',
                    arguments: {
                        targetDirectory: dir
                    }
                }, index + 1)
            );
            
            const responses = await Promise.all(promises);
            
            // All should succeed with unique pipeline IDs
            const pipelineIds = new Set();
            responses.forEach(response => {
                expect(response.result).toBeDefined();
                expect(response.result.pipelineId).toBeDefined();
                pipelineIds.add(response.result.pipelineId);
            });
            
            expect(pipelineIds.size).toBe(3);
        });
        
        test('should enforce concurrent pipeline limit', async () => {
            // Create server with low limit
            const limitedServer = new MCPServer({
                port: TEST_PORT + 2,
                host: TEST_HOST,
                enableLogging: false,
                maxConcurrentPipelines: 2
            });
            
            await limitedServer.start();
            
            try {
                const limitedClient = await createClient();
                await waitForMessage(limitedClient); // Skip init
                
                // Start max pipelines
                await sendRequest(limitedClient, 'tools/call', {
                    name: 'cognitive-triangulation/analyze',
                    arguments: { targetDirectory: testDirs[0] }
                }, 1);
                
                await sendRequest(limitedClient, 'tools/call', {
                    name: 'cognitive-triangulation/analyze',
                    arguments: { targetDirectory: testDirs[1] }
                }, 2);
                
                // Third should fail
                const response = await sendRequest(limitedClient, 'tools/call', {
                    name: 'cognitive-triangulation/analyze',
                    arguments: { targetDirectory: testDirs[2] }
                }, 3);
                
                expect(response).toMatchObject({
                    jsonrpc: '2.0',
                    id: 3,
                    error: {
                        code: -32603,
                        message: 'Tool execution failed',
                        data: {
                            error: expect.stringContaining('Maximum concurrent pipelines reached')
                        }
                    }
                });
                
                limitedClient.close();
            } finally {
                await limitedServer.shutdown();
            }
        });
    });
    
    describe('Export Functionality', () => {
        beforeEach(async () => {
            client = await createClient();
            await waitForMessage(client); // Skip init message
            
            // Mock completed pipeline
            const pipelineId = 'test-pipeline-123';
            server.activePipelines.set(pipelineId, {
                id: pipelineId,
                status: 'completed',
                targetDirectory: '/test',
                startTime: new Date(),
                endTime: new Date(),
                result: { entities: 5, nodes: 10, relationships: 15 }
            });
            
            // Mock database
            const mockDb = require('../../../src/utils/sqliteDb');
            mockDb.all = jest.fn().mockResolvedValue([
                { id: 1, name: 'Entity1', type: 'class', confidence: 0.9 },
                { id: 2, name: 'Entity2', type: 'function', confidence: 0.8 }
            ]);
        });
        
        test('should export graph as JSON', async () => {
            const response = await sendRequest(client, 'tools/call', {
                name: 'cognitive-triangulation/export-graph',
                arguments: {
                    pipelineId: 'test-pipeline-123',
                    format: 'json'
                }
            });
            
            expect(response).toMatchObject({
                jsonrpc: '2.0',
                id: 1,
                result: {
                    format: 'json',
                    data: {
                        nodes: expect.any(Array),
                        edges: expect.any(Array),
                        metadata: {
                            pipelineId: 'test-pipeline-123',
                            exportDate: expect.any(String)
                        }
                    }
                }
            });
        });
    });
});