/**
 * Claude Flow Integration Tests
 * Tests the MCP server integration with Claude Code/Flow
 */

const WebSocket = require('ws');
const MCPServer = require('../../../src/mcp/server');
const path = require('path');
const fs = require('fs').promises;
const { spawn } = require('child_process');

// Mock dependencies
jest.mock('../../../src/utils/sqliteDb');
jest.mock('../../../src/utils/logger');
jest.mock('../../../src/agents/EntityScout');
jest.mock('../../../src/agents/GraphBuilder');
jest.mock('../../../src/agents/RelationshipResolver');

describe('Claude Flow Integration Tests', () => {
    let server;
    let client;
    const TEST_PORT = 3005;
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
        
        // Mock database and agents
        const mockDb = require('../../../src/utils/sqliteDb');
        mockDb.get = jest.fn().mockResolvedValue({ count: 10 });
        mockDb.all = jest.fn().mockResolvedValue([
            { id: 1, name: 'TestClass', type: 'class', confidence: 0.95 },
            { id: 2, name: 'testFunction', type: 'function', confidence: 0.88 }
        ]);
        
        const EntityScout = require('../../../src/agents/EntityScout');
        EntityScout.prototype.run = jest.fn().mockResolvedValue();
        
        const GraphBuilder = require('../../../src/agents/GraphBuilder');
        GraphBuilder.prototype.run = jest.fn().mockResolvedValue();
        
        const RelationshipResolver = require('../../../src/agents/RelationshipResolver');
        RelationshipResolver.prototype.run = jest.fn().mockResolvedValue();
    });
    
    afterEach(async () => {
        if (client && client.readyState === WebSocket.OPEN) {
            client.close();
        }
        await server.shutdown();
    });
    
    /**
     * Simulate Claude Flow client behavior
     */
    class ClaudeFlowClient {
        constructor(wsUrl) {
            this.wsUrl = wsUrl;
            this.ws = null;
            this.requestId = 0;
            this.pendingRequests = new Map();
            this.notifications = [];
        }
        
        async connect() {
            return new Promise((resolve, reject) => {
                this.ws = new WebSocket(this.wsUrl);
                
                this.ws.on('open', () => {
                    resolve();
                });
                
                this.ws.on('message', (data) => {
                    const message = JSON.parse(data.toString());
                    
                    if (message.id && this.pendingRequests.has(message.id)) {
                        const { resolve, reject } = this.pendingRequests.get(message.id);
                        this.pendingRequests.delete(message.id);
                        
                        if (message.error) {
                            reject(message.error);
                        } else {
                            resolve(message.result);
                        }
                    } else if (message.method) {
                        this.notifications.push(message);
                    }
                });
                
                this.ws.on('error', reject);
            });
        }
        
        async request(method, params = {}) {
            return new Promise((resolve, reject) => {
                const id = ++this.requestId;
                
                this.pendingRequests.set(id, { resolve, reject });
                
                this.ws.send(JSON.stringify({
                    jsonrpc: '2.0',
                    id,
                    method,
                    params
                }));
                
                // Timeout after 10 seconds
                setTimeout(() => {
                    if (this.pendingRequests.has(id)) {
                        this.pendingRequests.delete(id);
                        reject(new Error('Request timeout'));
                    }
                }, 10000);
            });
        }
        
        getNotifications(method = null) {
            if (method) {
                return this.notifications.filter(n => n.method === method);
            }
            return this.notifications;
        }
        
        clearNotifications() {
            this.notifications = [];
        }
        
        close() {
            if (this.ws) {
                this.ws.close();
            }
        }
    }
    
    describe('Claude Flow Workflow Scenarios', () => {
        let claudeClient;
        let testProject;
        
        beforeEach(async () => {
            // Create Claude Flow client
            claudeClient = new ClaudeFlowClient(`ws://${TEST_HOST}:${TEST_PORT}`);
            await claudeClient.connect();
            
            // Wait for initialization
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Create test project
            testProject = path.join(__dirname, 'claude-flow-test-project');
            await fs.mkdir(testProject, { recursive: true });
            
            // Create sample files
            await fs.writeFile(
                path.join(testProject, 'index.js'),
                `
                const utils = require('./utils');
                
                class Application {
                    constructor() {
                        this.utils = new utils.Helper();
                    }
                    
                    start() {
                        console.log('Starting application');
                        this.utils.log('Application started');
                    }
                }
                
                module.exports = Application;
                `
            );
            
            await fs.writeFile(
                path.join(testProject, 'utils.js'),
                `
                class Helper {
                    log(message) {
                        console.log(\`[Helper] \${message}\`);
                    }
                }
                
                module.exports = { Helper };
                `
            );
        });
        
        afterEach(async () => {
            claudeClient.close();
            await fs.rm(testProject, { recursive: true, force: true });
        });
        
        test('Claude Flow: List available tools', async () => {
            const tools = await claudeClient.request('tools/list');
            
            expect(tools).toBeDefined();
            expect(tools.tools).toBeInstanceOf(Array);
            expect(tools.tools.length).toBeGreaterThan(0);
            
            // Verify cognitive triangulation tools
            const toolNames = tools.tools.map(t => t.name);
            expect(toolNames).toContain('cognitive-triangulation/analyze');
            expect(toolNames).toContain('cognitive-triangulation/get-entities');
        });
        
        test('Claude Flow: Complete analysis workflow', async () => {
            // Step 1: Start analysis
            const analyzeResult = await claudeClient.request('tools/call', {
                name: 'cognitive-triangulation/analyze',
                arguments: {
                    targetDirectory: testProject,
                    options: {
                        includeTests: false,
                        maxDepth: 5
                    }
                }
            });
            
            expect(analyzeResult.pipelineId).toBeDefined();
            expect(analyzeResult.status).toBe('started');
            
            const pipelineId = analyzeResult.pipelineId;
            
            // Step 2: Monitor progress
            await new Promise(resolve => setTimeout(resolve, 200));
            
            const progressNotifications = claudeClient.getNotifications('progress');
            expect(progressNotifications.length).toBeGreaterThan(0);
            
            // Step 3: Check status
            const statusResult = await claudeClient.request('tools/call', {
                name: 'cognitive-triangulation/status',
                arguments: { pipelineId }
            });
            
            expect(statusResult.id).toBe(pipelineId);
            expect(statusResult.status).toBeDefined();
            expect(statusResult.progress).toBeDefined();
            
            // Step 4: Get entities
            const entitiesResult = await claudeClient.request('tools/call', {
                name: 'cognitive-triangulation/get-entities',
                arguments: {
                    pipelineId,
                    filters: { type: 'class' }
                }
            });
            
            expect(entitiesResult.entities).toBeDefined();
            expect(entitiesResult.count).toBeGreaterThanOrEqual(0);
            
            // Step 5: Export graph
            const exportResult = await claudeClient.request('tools/call', {
                name: 'cognitive-triangulation/export-graph',
                arguments: {
                    pipelineId,
                    format: 'json'
                }
            });
            
            expect(exportResult.format).toBe('json');
            expect(exportResult.data).toBeDefined();
            expect(exportResult.data.nodes).toBeInstanceOf(Array);
            expect(exportResult.data.edges).toBeInstanceOf(Array);
        });
        
        test('Claude Flow: Batch operations', async () => {
            // Start multiple analyses in parallel
            const directories = [];
            for (let i = 0; i < 3; i++) {
                const dir = path.join(testProject, `module-${i}`);
                await fs.mkdir(dir, { recursive: true });
                await fs.writeFile(
                    path.join(dir, 'index.js'),
                    `module.exports = { id: ${i} };`
                );
                directories.push(dir);
            }
            
            // Batch analyze
            const promises = directories.map(dir => 
                claudeClient.request('tools/call', {
                    name: 'cognitive-triangulation/analyze',
                    arguments: { targetDirectory: dir }
                })
            );
            
            const results = await Promise.all(promises);
            
            // All should succeed
            results.forEach((result, index) => {
                expect(result.pipelineId).toBeDefined();
                expect(result.status).toBe('started');
            });
            
            // Check all pipeline statuses
            const statusPromises = results.map(r =>
                claudeClient.request('tools/call', {
                    name: 'cognitive-triangulation/status',
                    arguments: { pipelineId: r.pipelineId }
                })
            );
            
            const statuses = await Promise.all(statusPromises);
            statuses.forEach(status => {
                expect(status.status).toBeDefined();
                expect(status.targetDirectory).toBeDefined();
            });
        });
        
        test('Claude Flow: Error handling and recovery', async () => {
            // Test with invalid directory
            try {
                await claudeClient.request('tools/call', {
                    name: 'cognitive-triangulation/analyze',
                    arguments: {
                        targetDirectory: '/invalid/non/existent/path'
                    }
                });
                fail('Should have thrown error');
            } catch (error) {
                expect(error.code).toBe(-32603);
                expect(error.message).toContain('Tool execution failed');
            }
            
            // Test with invalid pipeline ID
            try {
                await claudeClient.request('tools/call', {
                    name: 'cognitive-triangulation/get-entities',
                    arguments: {
                        pipelineId: 'invalid-pipeline-id'
                    }
                });
                fail('Should have thrown error');
            } catch (error) {
                expect(error.code).toBe(-32603);
                expect(error.data.error).toContain('Pipeline not found');
            }
        });
    });
    
    describe('Claude Flow Command Integration', () => {
        let testProject;
        
        beforeEach(async () => {
            testProject = path.join(__dirname, 'claude-flow-cmd-project');
            await fs.mkdir(testProject, { recursive: true });
            
            // Create a simple project structure
            await fs.writeFile(
                path.join(testProject, 'package.json'),
                JSON.stringify({
                    name: 'test-project',
                    version: '1.0.0',
                    main: 'index.js'
                }, null, 2)
            );
            
            await fs.writeFile(
                path.join(testProject, 'index.js'),
                'console.log("Hello from test project");'
            );
        });
        
        afterEach(async () => {
            await fs.rm(testProject, { recursive: true, force: true });
        });
        
        test('Simulate claude-flow command usage', async () => {
            // This test simulates how claude-flow would use the MCP server
            const claudeClient = new ClaudeFlowClient(`ws://${TEST_HOST}:${TEST_PORT}`);
            await claudeClient.connect();
            
            // Wait for init
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Simulate: ./claude-flow sparc "Analyze project structure"
            const analyzeResult = await claudeClient.request('tools/call', {
                name: 'cognitive-triangulation/analyze',
                arguments: {
                    targetDirectory: testProject
                }
            });
            
            expect(analyzeResult.pipelineId).toBeDefined();
            
            // Simulate monitoring output
            await new Promise(resolve => setTimeout(resolve, 300));
            const notifications = claudeClient.getNotifications();
            
            // Would be displayed in claude-flow terminal
            notifications.forEach(notif => {
                if (notif.method === 'progress') {
                    expect(notif.params.pipelineId).toBeDefined();
                    expect(notif.params.progress).toBeDefined();
                }
            });
            
            claudeClient.close();
        });
    });
    
    describe('MCP Protocol Extensions for Claude', () => {
        let claudeClient;
        
        beforeEach(async () => {
            claudeClient = new ClaudeFlowClient(`ws://${TEST_HOST}:${TEST_PORT}`);
            await claudeClient.connect();
            await new Promise(resolve => setTimeout(resolve, 100));
        });
        
        afterEach(() => {
            claudeClient.close();
        });
        
        test('Should support streaming results', async () => {
            // The server advertises streaming capability
            const initNotifications = claudeClient.getNotifications('initialize');
            expect(initNotifications.length).toBe(1);
            
            const capabilities = initNotifications[0].params.capabilities;
            expect(capabilities.features).toContain('streaming');
        });
        
        test('Should support batch operations', async () => {
            const initNotifications = claudeClient.getNotifications('initialize');
            const capabilities = initNotifications[0].params.capabilities;
            expect(capabilities.features).toContain('batch-operations');
        });
        
        test('Should provide detailed error context', async () => {
            try {
                await claudeClient.request('tools/call', {
                    name: 'cognitive-triangulation/analyze',
                    arguments: {} // Missing required field
                });
            } catch (error) {
                expect(error.code).toBe(-32602);
                expect(error.data).toBeDefined();
                expect(error.data.validation).toBeInstanceOf(Array);
                expect(error.data.validation[0]).toContain('targetDirectory');
            }
        });
    });
    
    describe('Performance and Scalability', () => {
        test('Should handle rapid sequential requests', async () => {
            const claudeClient = new ClaudeFlowClient(`ws://${TEST_HOST}:${TEST_PORT}`);
            await claudeClient.connect();
            await new Promise(resolve => setTimeout(resolve, 100));
            
            const startTime = Date.now();
            
            // Send 10 rapid requests
            const promises = [];
            for (let i = 0; i < 10; i++) {
                promises.push(
                    claudeClient.request('tools/list')
                );
            }
            
            const results = await Promise.all(promises);
            const duration = Date.now() - startTime;
            
            // All should succeed
            results.forEach(result => {
                expect(result.tools).toBeDefined();
            });
            
            // Should complete reasonably quickly
            expect(duration).toBeLessThan(1000); // Less than 1 second
            
            claudeClient.close();
        });
        
        test('Should handle large result sets', async () => {
            // Mock large dataset
            const mockDb = require('../../../src/utils/sqliteDb');
            const largeDataset = Array(1000).fill(null).map((_, i) => ({
                id: i,
                name: `Entity${i}`,
                type: i % 2 === 0 ? 'class' : 'function',
                confidence: Math.random()
            }));
            mockDb.all = jest.fn().mockResolvedValue(largeDataset);
            
            const claudeClient = new ClaudeFlowClient(`ws://${TEST_HOST}:${TEST_PORT}`);
            await claudeClient.connect();
            
            // Create mock completed pipeline
            server.activePipelines.set('large-dataset-pipeline', {
                id: 'large-dataset-pipeline',
                status: 'completed',
                targetDirectory: '/test',
                result: { entities: 1000 }
            });
            
            const result = await claudeClient.request('tools/call', {
                name: 'cognitive-triangulation/get-entities',
                arguments: {
                    pipelineId: 'large-dataset-pipeline'
                }
            });
            
            expect(result.count).toBe(1000);
            expect(result.entities).toHaveLength(1000);
            
            claudeClient.close();
        });
    });
});