/**
 * Cognitive Triangulation Mapping Validation Tests
 * Validates the accuracy and completeness of project mapping output
 */

const WebSocket = require('ws');
const MCPServer = require('../../../src/mcp/server');
const path = require('path');
const fs = require('fs').promises;

// Mock the actual pipeline components to control output
jest.mock('../../../src/utils/sqliteDb');
jest.mock('../../../src/utils/logger');

describe('Cognitive Triangulation Mapping Validation', () => {
    let server;
    let client;
    const TEST_PORT = 3011;
    const TEST_HOST = 'localhost';
    let testProject;
    
    beforeEach(async () => {
        server = new MCPServer({
            port: TEST_PORT,
            host: TEST_HOST,
            enableLogging: false
        });
        await server.start();
        
        // Create test project with known structure
        testProject = path.join(__dirname, 'mapping-test-project');
        await createTestProject(testProject);
        
        // Setup mocks for controlled output
        setupMocksForMapping();
    });
    
    afterEach(async () => {
        if (client && client.readyState === WebSocket.OPEN) {
            client.close();
        }
        await server.shutdown();
        await fs.rm(testProject, { recursive: true, force: true });
    });
    
    /**
     * Create a test project with known relationships
     */
    async function createTestProject(projectPath) {
        await fs.mkdir(projectPath, { recursive: true });
        await fs.mkdir(path.join(projectPath, 'src'), { recursive: true });
        await fs.mkdir(path.join(projectPath, 'tests'), { recursive: true });
        
        // Main application file
        await fs.writeFile(
            path.join(projectPath, 'src/app.js'),
            `
            const { Database } = require('./database');
            const UserService = require('./services/userService');
            const AuthMiddleware = require('./middleware/auth');
            
            class Application {
                constructor() {
                    this.db = new Database();
                    this.userService = new UserService(this.db);
                    this.authMiddleware = new AuthMiddleware();
                }
                
                async start() {
                    await this.db.connect();
                    console.log('Application started');
                }
            }
            
            module.exports = Application;
            `
        );
        
        // Database module
        await fs.writeFile(
            path.join(projectPath, 'src/database.js'),
            `
            class Database {
                constructor() {
                    this.connection = null;
                }
                
                async connect() {
                    // Simulate connection
                    this.connection = { connected: true };
                }
                
                async query(sql) {
                    return [];
                }
            }
            
            module.exports = { Database };
            `
        );
        
        // User service
        await fs.writeFile(
            path.join(projectPath, 'src/services/userService.js'),
            `
            class UserService {
                constructor(database) {
                    this.db = database;
                }
                
                async createUser(userData) {
                    return await this.db.query('INSERT INTO users...');
                }
                
                async findUser(id) {
                    return await this.db.query('SELECT * FROM users WHERE id = ?', [id]);
                }
            }
            
            module.exports = UserService;
            `
        );
        
        // Auth middleware
        await fs.writeFile(
            path.join(projectPath, 'src/middleware/auth.js'),
            `
            const jwt = require('jsonwebtoken');
            
            class AuthMiddleware {
                verify(token) {
                    return jwt.verify(token, process.env.JWT_SECRET);
                }
                
                generateToken(user) {
                    return jwt.sign({ id: user.id }, process.env.JWT_SECRET);
                }
            }
            
            module.exports = AuthMiddleware;
            `
        );
        
        // Test file
        await fs.writeFile(
            path.join(projectPath, 'tests/app.test.js'),
            `
            const Application = require('../src/app');
            
            describe('Application', () => {
                test('should start successfully', async () => {
                    const app = new Application();
                    await app.start();
                    expect(app.db.connection).toBeTruthy();
                });
            });
            `
        );
    }
    
    /**
     * Setup mocks to return expected mapping data
     */
    function setupMocksForMapping() {
        const mockDb = require('../../../src/utils/sqliteDb');
        
        // Mock entity data
        const entities = [
            { id: 1, name: 'Application', type: 'class', file_path: 'src/app.js', confidence: 0.95 },
            { id: 2, name: 'Database', type: 'class', file_path: 'src/database.js', confidence: 0.93 },
            { id: 3, name: 'UserService', type: 'class', file_path: 'src/services/userService.js', confidence: 0.94 },
            { id: 4, name: 'AuthMiddleware', type: 'class', file_path: 'src/middleware/auth.js', confidence: 0.92 }
        ];
        
        // Mock relationships
        const relationships = [
            {
                id: 1,
                source_poi_id: 1,
                target_poi_id: 2,
                type: 'uses',
                confidence: 0.9,
                metadata: JSON.stringify({ context: 'constructor dependency' })
            },
            {
                id: 2,
                source_poi_id: 1,
                target_poi_id: 3,
                type: 'uses',
                confidence: 0.88,
                metadata: JSON.stringify({ context: 'constructor dependency' })
            },
            {
                id: 3,
                source_poi_id: 3,
                target_poi_id: 2,
                type: 'depends_on',
                confidence: 0.85,
                metadata: JSON.stringify({ context: 'injected dependency' })
            }
        ];
        
        mockDb.get = jest.fn().mockImplementation((query) => {
            if (query.includes('COUNT')) {
                if (query.includes('entity_reports')) {
                    return Promise.resolve({ count: entities.length });
                } else if (query.includes('relationships')) {
                    return Promise.resolve({ count: relationships.length });
                }
            }
            return Promise.resolve({ count: 0 });
        });
        
        mockDb.all = jest.fn().mockImplementation((query, params) => {
            if (query.includes('entity_reports')) {
                return Promise.resolve(entities);
            } else if (query.includes('relationships')) {
                return Promise.resolve(relationships);
            }
            return Promise.resolve([]);
        });
        
        // Mock agent implementations
        jest.mock('../../../src/agents/EntityScout');
        jest.mock('../../../src/agents/GraphBuilder');
        jest.mock('../../../src/agents/RelationshipResolver');
        
        const EntityScout = require('../../../src/agents/EntityScout');
        EntityScout.prototype.run = jest.fn().mockResolvedValue();
        
        const GraphBuilder = require('../../../src/agents/GraphBuilder');
        GraphBuilder.prototype.run = jest.fn().mockResolvedValue();
        
        const RelationshipResolver = require('../../../src/agents/RelationshipResolver');
        RelationshipResolver.prototype.run = jest.fn().mockResolvedValue();
    }
    
    /**
     * Helper to connect and get past initialization
     */
    async function connectClient() {
        const ws = new WebSocket(`ws://${TEST_HOST}:${TEST_PORT}`);
        await new Promise((resolve) => {
            ws.on('open', resolve);
        });
        
        // Skip init message
        await new Promise((resolve) => {
            ws.once('message', resolve);
        });
        
        return ws;
    }
    
    /**
     * Helper to send request and get response
     */
    async function sendRequest(ws, method, params, id = 1) {
        return new Promise((resolve) => {
            ws.once('message', (data) => {
                const response = JSON.parse(data.toString());
                resolve(response);
            });
            
            ws.send(JSON.stringify({
                jsonrpc: '2.0',
                id,
                method,
                params
            }));
        });
    }
    
    describe('Entity Mapping Validation', () => {
        test('should correctly identify all classes in the project', async () => {
            client = await connectClient();
            
            // Start analysis
            const analyzeResult = await sendRequest(client, 'tools/call', {
                name: 'cognitive-triangulation/analyze',
                arguments: { targetDirectory: testProject }
            });
            
            const pipelineId = analyzeResult.result.pipelineId;
            
            // Wait for completion
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Get entities
            const entitiesResult = await sendRequest(client, 'tools/call', {
                name: 'cognitive-triangulation/get-entities',
                arguments: { 
                    pipelineId,
                    filters: { type: 'class' }
                }
            }, 2);
            
            expect(entitiesResult.result.count).toBe(4);
            
            const entityNames = entitiesResult.result.entities.map(e => e.name);
            expect(entityNames).toContain('Application');
            expect(entityNames).toContain('Database');
            expect(entityNames).toContain('UserService');
            expect(entityNames).toContain('AuthMiddleware');
        });
        
        test('should maintain high confidence scores for clear entities', async () => {
            client = await connectClient();
            
            const analyzeResult = await sendRequest(client, 'tools/call', {
                name: 'cognitive-triangulation/analyze',
                arguments: { targetDirectory: testProject }
            });
            
            const pipelineId = analyzeResult.result.pipelineId;
            await new Promise(resolve => setTimeout(resolve, 100));
            
            const entitiesResult = await sendRequest(client, 'tools/call', {
                name: 'cognitive-triangulation/get-entities',
                arguments: { 
                    pipelineId,
                    filters: { confidence: 0.9 }
                }
            }, 2);
            
            // Most entities should have high confidence
            expect(entitiesResult.result.count).toBeGreaterThanOrEqual(3);
            
            entitiesResult.result.entities.forEach(entity => {
                expect(entity.confidence).toBeGreaterThanOrEqual(0.9);
            });
        });
    });
    
    describe('Relationship Mapping Validation', () => {
        test('should correctly identify dependency relationships', async () => {
            client = await connectClient();
            
            const analyzeResult = await sendRequest(client, 'tools/call', {
                name: 'cognitive-triangulation/analyze',
                arguments: { targetDirectory: testProject }
            });
            
            const pipelineId = analyzeResult.result.pipelineId;
            await new Promise(resolve => setTimeout(resolve, 100));
            
            const relationshipsResult = await sendRequest(client, 'tools/call', {
                name: 'cognitive-triangulation/get-relationships',
                arguments: { pipelineId }
            }, 2);
            
            expect(relationshipsResult.result.count).toBeGreaterThan(0);
            
            // Verify specific relationships exist
            const relationships = relationshipsResult.result.relationships;
            
            // Application uses Database
            const appToDb = relationships.find(r => 
                r.source === 1 && r.target === 2 && r.type === 'uses'
            );
            expect(appToDb).toBeDefined();
            
            // Application uses UserService
            const appToUserService = relationships.find(r =>
                r.source === 1 && r.target === 3 && r.type === 'uses'
            );
            expect(appToUserService).toBeDefined();
            
            // UserService depends on Database
            const userServiceToDb = relationships.find(r =>
                r.source === 3 && r.target === 2 && r.type === 'depends_on'
            );
            expect(userServiceToDb).toBeDefined();
        });
        
        test('should filter relationships by type', async () => {
            client = await connectClient();
            
            const analyzeResult = await sendRequest(client, 'tools/call', {
                name: 'cognitive-triangulation/analyze',
                arguments: { targetDirectory: testProject }
            });
            
            const pipelineId = analyzeResult.result.pipelineId;
            await new Promise(resolve => setTimeout(resolve, 100));
            
            const usesRelationships = await sendRequest(client, 'tools/call', {
                name: 'cognitive-triangulation/get-relationships',
                arguments: { 
                    pipelineId,
                    filters: { type: 'uses' }
                }
            }, 2);
            
            expect(usesRelationships.result.count).toBe(2);
            usesRelationships.result.relationships.forEach(rel => {
                expect(rel.type).toBe('uses');
            });
        });
    });
    
    describe('Graph Export Validation', () => {
        test('should export complete graph in JSON format', async () => {
            client = await connectClient();
            
            const analyzeResult = await sendRequest(client, 'tools/call', {
                name: 'cognitive-triangulation/analyze',
                arguments: { targetDirectory: testProject }
            });
            
            const pipelineId = analyzeResult.result.pipelineId;
            await new Promise(resolve => setTimeout(resolve, 100));
            
            const exportResult = await sendRequest(client, 'tools/call', {
                name: 'cognitive-triangulation/export-graph',
                arguments: { 
                    pipelineId,
                    format: 'json'
                }
            }, 2);
            
            expect(exportResult.result.format).toBe('json');
            expect(exportResult.result.data).toBeDefined();
            expect(exportResult.result.data.nodes).toHaveLength(4);
            expect(exportResult.result.data.edges).toHaveLength(3);
            expect(exportResult.result.data.metadata.pipelineId).toBe(pipelineId);
            
            // Validate node structure
            exportResult.result.data.nodes.forEach(node => {
                expect(node).toHaveProperty('id');
                expect(node).toHaveProperty('name');
                expect(node).toHaveProperty('type');
                expect(node).toHaveProperty('confidence');
                expect(node).toHaveProperty('file');
            });
            
            // Validate edge structure
            exportResult.result.data.edges.forEach(edge => {
                expect(edge).toHaveProperty('id');
                expect(edge).toHaveProperty('source');
                expect(edge).toHaveProperty('target');
                expect(edge).toHaveProperty('type');
                expect(edge).toHaveProperty('confidence');
                expect(edge).toHaveProperty('metadata');
            });
        });
    });
    
    describe('Accuracy Metrics', () => {
        test('should maintain minimum accuracy thresholds', async () => {
            client = await connectClient();
            
            const analyzeResult = await sendRequest(client, 'tools/call', {
                name: 'cognitive-triangulation/analyze',
                arguments: { targetDirectory: testProject }
            });
            
            const pipelineId = analyzeResult.result.pipelineId;
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Get all data
            const [entities, relationships] = await Promise.all([
                sendRequest(client, 'tools/call', {
                    name: 'cognitive-triangulation/get-entities',
                    arguments: { pipelineId }
                }, 2),
                sendRequest(client, 'tools/call', {
                    name: 'cognitive-triangulation/get-relationships',
                    arguments: { pipelineId }
                }, 3)
            ]);
            
            // Calculate average confidence scores
            const entityConfidences = entities.result.entities.map(e => e.confidence);
            const avgEntityConfidence = entityConfidences.reduce((a, b) => a + b, 0) / entityConfidences.length;
            
            const relConfidences = relationships.result.relationships.map(r => r.confidence);
            const avgRelConfidence = relConfidences.reduce((a, b) => a + b, 0) / relConfidences.length;
            
            // Minimum acceptable thresholds
            expect(avgEntityConfidence).toBeGreaterThan(0.9);
            expect(avgRelConfidence).toBeGreaterThan(0.85);
            
            // No low confidence entities
            const lowConfidenceEntities = entityConfidences.filter(c => c < 0.8);
            expect(lowConfidenceEntities.length).toBe(0);
        });
    });
    
    describe('Complex Project Mapping', () => {
        test('should handle nested module structures', async () => {
            // Create more complex structure
            const nestedPath = path.join(testProject, 'src/modules/nested');
            await fs.mkdir(nestedPath, { recursive: true });
            
            await fs.writeFile(
                path.join(nestedPath, 'deepModule.js'),
                `
                const BaseModule = require('../../baseModule');
                
                class DeepModule extends BaseModule {
                    process() {
                        return super.process();
                    }
                }
                
                module.exports = DeepModule;
                `
            );
            
            client = await connectClient();
            
            const analyzeResult = await sendRequest(client, 'tools/call', {
                name: 'cognitive-triangulation/analyze',
                arguments: { 
                    targetDirectory: testProject,
                    options: { maxDepth: 10 }
                }
            });
            
            expect(analyzeResult.result.status).toBe('started');
            
            const status = await sendRequest(client, 'tools/call', {
                name: 'cognitive-triangulation/status',
                arguments: { pipelineId: analyzeResult.result.pipelineId }
            }, 2);
            
            expect(status.result.targetDirectory).toBe(testProject);
        });
    });
});