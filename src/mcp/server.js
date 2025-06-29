/**
 * MCP (Model Context Protocol) Server Implementation
 * Exposes the Cognitive Triangulation Pipeline as MCP tools
 * Compatible with Claude Code/Flow and standalone usage
 */

const { Server } = require('ws');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs').promises;

// Import core pipeline components
const EntityScout = require('../agents/EntityScout');
const GraphBuilder = require('../agents/GraphBuilder');
const RelationshipResolver = require('../agents/RelationshipResolver');
const sqliteDb = require('../utils/sqliteDb');
const logger = require('../utils/logger');

class MCPServer {
    constructor(options = {}) {
        this.port = options.port || 3003;
        this.host = options.host || 'localhost';
        this.server = null;
        this.clients = new Map(); // clientId -> { ws, session }
        this.activePipelines = new Map(); // pipelineId -> pipeline state
        
        // Configuration
        this.config = {
            maxConcurrentPipelines: options.maxConcurrentPipelines || 5,
            enableLogging: options.enableLogging !== false,
            authToken: options.authToken || null
        };
        
        // MCP protocol version
        this.protocolVersion = '1.0.0';
        
        // Available tools
        this.tools = this.initializeTools();
    }
    
    /**
     * Initialize available MCP tools
     */
    initializeTools() {
        return {
            'cognitive-triangulation/analyze': {
                name: 'cognitive-triangulation/analyze',
                description: 'Analyze a codebase using cognitive triangulation to extract entities and relationships',
                inputSchema: {
                    type: 'object',
                    properties: {
                        targetDirectory: {
                            type: 'string',
                            description: 'The directory path to analyze'
                        },
                        options: {
                            type: 'object',
                            properties: {
                                includeTests: {
                                    type: 'boolean',
                                    description: 'Include test files in analysis',
                                    default: false
                                },
                                maxDepth: {
                                    type: 'integer',
                                    description: 'Maximum directory depth to analyze',
                                    default: 10
                                }
                            }
                        }
                    },
                    required: ['targetDirectory']
                }
            },
            
            'cognitive-triangulation/get-entities': {
                name: 'cognitive-triangulation/get-entities',
                description: 'Retrieve analyzed entities from a previous analysis',
                inputSchema: {
                    type: 'object',
                    properties: {
                        pipelineId: {
                            type: 'string',
                            description: 'The pipeline ID from a previous analysis'
                        },
                        filters: {
                            type: 'object',
                            properties: {
                                type: {
                                    type: 'string',
                                    description: 'Filter by entity type (class, function, etc.)'
                                },
                                confidence: {
                                    type: 'number',
                                    description: 'Minimum confidence score (0-1)',
                                    minimum: 0,
                                    maximum: 1
                                }
                            }
                        }
                    },
                    required: ['pipelineId']
                }
            },
            
            'cognitive-triangulation/get-relationships': {
                name: 'cognitive-triangulation/get-relationships',
                description: 'Retrieve analyzed relationships from a previous analysis',
                inputSchema: {
                    type: 'object',
                    properties: {
                        pipelineId: {
                            type: 'string',
                            description: 'The pipeline ID from a previous analysis'
                        },
                        filters: {
                            type: 'object',
                            properties: {
                                type: {
                                    type: 'string',
                                    description: 'Filter by relationship type (imports, calls, etc.)'
                                },
                                minConfidence: {
                                    type: 'number',
                                    description: 'Minimum confidence score (0-1)',
                                    minimum: 0,
                                    maximum: 1
                                }
                            }
                        }
                    },
                    required: ['pipelineId']
                }
            },
            
            'cognitive-triangulation/export-graph': {
                name: 'cognitive-triangulation/export-graph',
                description: 'Export the analyzed graph in various formats',
                inputSchema: {
                    type: 'object',
                    properties: {
                        pipelineId: {
                            type: 'string',
                            description: 'The pipeline ID from a previous analysis'
                        },
                        format: {
                            type: 'string',
                            enum: ['cypher', 'graphml', 'json', 'dot'],
                            description: 'Export format',
                            default: 'json'
                        }
                    },
                    required: ['pipelineId']
                }
            },
            
            'cognitive-triangulation/status': {
                name: 'cognitive-triangulation/status',
                description: 'Get the status of a running or completed analysis',
                inputSchema: {
                    type: 'object',
                    properties: {
                        pipelineId: {
                            type: 'string',
                            description: 'The pipeline ID to check'
                        }
                    },
                    required: ['pipelineId']
                }
            }
        };
    }
    
    /**
     * Start the MCP server
     */
    async start() {
        return new Promise((resolve, reject) => {
            try {
                this.server = new Server({ 
                    port: this.port,
                    host: this.host,
                    perMessageDeflate: false
                });
                
                this.server.on('connection', (ws, req) => {
                    this.handleConnection(ws, req);
                });
                
                this.server.on('listening', () => {
                    logger.info(`MCP Server listening on ${this.host}:${this.port}`);
                    resolve();
                });
                
                this.server.on('error', (error) => {
                    logger.error('MCP Server error:', error);
                    reject(error);
                });
                
            } catch (error) {
                reject(error);
            }
        });
    }
    
    /**
     * Handle new WebSocket connection
     */
    handleConnection(ws, req) {
        const clientId = crypto.randomUUID();
        const clientInfo = {
            ws,
            session: {
                id: clientId,
                authenticated: !this.config.authToken,
                connectedAt: new Date(),
                lastActivity: new Date()
            }
        };
        
        this.clients.set(clientId, clientInfo);
        
        if (this.config.enableLogging) {
            logger.info(`MCP Client connected: ${clientId}`);
        }
        
        // Send initialization message
        this.sendMessage(ws, {
            jsonrpc: '2.0',
            method: 'initialize',
            params: {
                protocolVersion: this.protocolVersion,
                capabilities: {
                    tools: Object.keys(this.tools),
                    features: ['cognitive-triangulation', 'batch-operations', 'streaming']
                }
            }
        });
        
        ws.on('message', (data) => {
            this.handleMessage(clientId, data);
        });
        
        ws.on('close', () => {
            this.handleDisconnection(clientId);
        });
        
        ws.on('error', (error) => {
            logger.error(`WebSocket error for client ${clientId}:`, error);
        });
    }
    
    /**
     * Handle incoming message from client
     */
    async handleMessage(clientId, data) {
        const client = this.clients.get(clientId);
        if (!client) return;
        
        client.session.lastActivity = new Date();
        
        try {
            const message = JSON.parse(data.toString());
            
            // Validate JSON-RPC structure
            if (!message.jsonrpc || message.jsonrpc !== '2.0') {
                this.sendError(client.ws, null, -32600, 'Invalid Request');
                return;
            }
            
            // Handle authentication if required
            if (this.config.authToken && !client.session.authenticated) {
                if (message.method === 'authenticate') {
                    await this.handleAuthentication(client, message);
                } else {
                    this.sendError(client.ws, message.id, -32001, 'Authentication required');
                }
                return;
            }
            
            // Route to appropriate handler
            if (message.method) {
                await this.handleRequest(client, message);
            } else if (message.result !== undefined || message.error) {
                // Handle responses (if we sent requests to the client)
                await this.handleResponse(client, message);
            }
            
        } catch (error) {
            logger.error(`Error handling message from ${clientId}:`, error);
            this.sendError(client.ws, null, -32700, 'Parse error');
        }
    }
    
    /**
     * Handle method request
     */
    async handleRequest(client, message) {
        const { method, params, id } = message;
        
        try {
            switch (method) {
                case 'tools/list':
                    this.sendResult(client.ws, id, {
                        tools: Object.values(this.tools)
                    });
                    break;
                    
                case 'tools/call':
                    await this.handleToolCall(client, id, params);
                    break;
                    
                case 'ping':
                    this.sendResult(client.ws, id, { pong: true });
                    break;
                    
                case 'shutdown':
                    await this.handleShutdown(client, id);
                    break;
                    
                default:
                    this.sendError(client.ws, id, -32601, `Method not found: ${method}`);
            }
        } catch (error) {
            logger.error(`Error handling request ${method}:`, error);
            this.sendError(client.ws, id, -32603, 'Internal error', { 
                message: error.message 
            });
        }
    }
    
    /**
     * Handle tool call request
     */
    async handleToolCall(client, requestId, params) {
        const { name, arguments: args } = params;
        
        if (!this.tools[name]) {
            this.sendError(client.ws, requestId, -32602, `Unknown tool: ${name}`);
            return;
        }
        
        // Validate arguments against schema
        const tool = this.tools[name];
        const validation = this.validateArguments(args, tool.inputSchema);
        if (!validation.valid) {
            this.sendError(client.ws, requestId, -32602, 'Invalid parameters', {
                validation: validation.errors
            });
            return;
        }
        
        try {
            // Execute the tool
            const result = await this.executeTool(name, args, client);
            this.sendResult(client.ws, requestId, result);
        } catch (error) {
            logger.error(`Error executing tool ${name}:`, error);
            this.sendError(client.ws, requestId, -32603, 'Tool execution failed', {
                tool: name,
                error: error.message
            });
        }
    }
    
    /**
     * Execute a specific tool
     */
    async executeTool(toolName, args, client) {
        switch (toolName) {
            case 'cognitive-triangulation/analyze':
                return await this.analyzeCodebase(args, client);
                
            case 'cognitive-triangulation/get-entities':
                return await this.getEntities(args);
                
            case 'cognitive-triangulation/get-relationships':
                return await this.getRelationships(args);
                
            case 'cognitive-triangulation/export-graph':
                return await this.exportGraph(args);
                
            case 'cognitive-triangulation/status':
                return await this.getPipelineStatus(args);
                
            default:
                throw new Error(`Tool not implemented: ${toolName}`);
        }
    }
    
    /**
     * Analyze a codebase using cognitive triangulation
     */
    async analyzeCodebase(args, client) {
        const { targetDirectory, options = {} } = args;
        
        // Check if directory exists
        try {
            const stats = await fs.stat(targetDirectory);
            if (!stats.isDirectory()) {
                throw new Error('Target path is not a directory');
            }
        } catch (error) {
            throw new Error(`Invalid target directory: ${error.message}`);
        }
        
        // Check concurrent pipeline limit
        if (this.activePipelines.size >= this.config.maxConcurrentPipelines) {
            throw new Error('Maximum concurrent pipelines reached');
        }
        
        // Create pipeline ID
        const pipelineId = `mcp_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        
        // Initialize pipeline state
        const pipelineState = {
            id: pipelineId,
            targetDirectory,
            options,
            status: 'initializing',
            startTime: new Date(),
            progress: {
                phase: 'setup',
                entityScout: { status: 'pending', filesProcessed: 0 },
                graphBuilder: { status: 'pending', nodesCreated: 0 },
                relationshipResolver: { status: 'pending', relationshipsResolved: 0 }
            },
            result: null,
            error: null
        };
        
        this.activePipelines.set(pipelineId, pipelineState);
        
        // Start pipeline asynchronously
        this.runPipelineAsync(pipelineId, targetDirectory, options, client);
        
        return {
            pipelineId,
            status: 'started',
            message: 'Cognitive triangulation analysis started'
        };
    }
    
    /**
     * Run the cognitive triangulation pipeline
     */
    async runPipelineAsync(pipelineId, targetDirectory, options, client) {
        const pipelineState = this.activePipelines.get(pipelineId);
        
        try {
            // Update status
            pipelineState.status = 'running';
            pipelineState.progress.phase = 'entity_scout';
            this.notifyProgress(client, pipelineId, pipelineState);
            
            // Phase 1: Entity Scout
            const entityScout = new EntityScout(targetDirectory);
            await entityScout.run();
            
            const db = sqliteDb;
            const entityCount = await db.get("SELECT COUNT(*) as count FROM entity_reports");
            pipelineState.progress.entityScout = {
                status: 'completed',
                filesProcessed: entityCount.count
            };
            this.notifyProgress(client, pipelineId, pipelineState);
            
            // Phase 2: Graph Builder
            pipelineState.progress.phase = 'graph_builder';
            this.notifyProgress(client, pipelineId, pipelineState);
            
            const graphBuilder = new GraphBuilder();
            await graphBuilder.run();
            
            pipelineState.progress.graphBuilder = {
                status: 'completed',
                nodesCreated: await this.getNodeCount()
            };
            this.notifyProgress(client, pipelineId, pipelineState);
            
            // Phase 3: Relationship Resolver
            pipelineState.progress.phase = 'relationship_resolver';
            this.notifyProgress(client, pipelineId, pipelineState);
            
            const relationshipResolver = new RelationshipResolver();
            await relationshipResolver.run();
            
            pipelineState.progress.relationshipResolver = {
                status: 'completed',
                relationshipsResolved: await this.getRelationshipCount()
            };
            
            // Pipeline completed
            pipelineState.status = 'completed';
            pipelineState.endTime = new Date();
            pipelineState.result = {
                entities: pipelineState.progress.entityScout.filesProcessed,
                nodes: pipelineState.progress.graphBuilder.nodesCreated,
                relationships: pipelineState.progress.relationshipResolver.relationshipsResolved
            };
            
            this.notifyCompletion(client, pipelineId, pipelineState);
            
        } catch (error) {
            logger.error(`Pipeline ${pipelineId} failed:`, error);
            pipelineState.status = 'failed';
            pipelineState.error = error.message;
            pipelineState.endTime = new Date();
            
            this.notifyError(client, pipelineId, error);
        }
    }
    
    /**
     * Get entities from a previous analysis
     */
    async getEntities(args) {
        const { pipelineId, filters = {} } = args;
        
        const pipeline = this.activePipelines.get(pipelineId);
        if (!pipeline) {
            throw new Error(`Pipeline not found: ${pipelineId}`);
        }
        
        if (pipeline.status !== 'completed') {
            throw new Error(`Pipeline not completed: ${pipeline.status}`);
        }
        
        const db = sqliteDb;
        let query = "SELECT * FROM entity_reports WHERE 1=1";
        const params = [];
        
        if (filters.type) {
            query += " AND type = ?";
            params.push(filters.type);
        }
        
        if (filters.confidence !== undefined) {
            query += " AND confidence >= ?";
            params.push(filters.confidence);
        }
        
        const entities = await db.all(query, params);
        
        return {
            pipelineId,
            count: entities.length,
            entities: entities.map(e => ({
                id: e.id,
                name: e.name,
                type: e.type,
                description: e.description,
                confidence: e.confidence,
                file: e.file_path
            }))
        };
    }
    
    /**
     * Get relationships from a previous analysis
     */
    async getRelationships(args) {
        const { pipelineId, filters = {} } = args;
        
        const pipeline = this.activePipelines.get(pipelineId);
        if (!pipeline) {
            throw new Error(`Pipeline not found: ${pipelineId}`);
        }
        
        if (pipeline.status !== 'completed') {
            throw new Error(`Pipeline not completed: ${pipeline.status}`);
        }
        
        // Query relationships from SQLite
        const db = sqliteDb;
        let query = "SELECT * FROM relationships WHERE 1=1";
        const params = [];
        
        if (filters.type) {
            query += " AND type = ?";
            params.push(filters.type);
        }
        
        if (filters.minConfidence !== undefined) {
            query += " AND confidence >= ?";
            params.push(filters.minConfidence);
        }
        
        const relationships = await db.all(query, params);
        
        return {
            pipelineId,
            count: relationships.length,
            relationships: relationships.map(r => ({
                id: r.id,
                source: r.source_poi_id,
                target: r.target_poi_id,
                type: r.type,
                confidence: r.confidence,
                metadata: JSON.parse(r.metadata || '{}')
            }))
        };
    }
    
    /**
     * Export the analyzed graph
     */
    async exportGraph(args) {
        const { pipelineId, format = 'json' } = args;
        
        const pipeline = this.activePipelines.get(pipelineId);
        if (!pipeline) {
            throw new Error(`Pipeline not found: ${pipelineId}`);
        }
        
        if (pipeline.status !== 'completed') {
            throw new Error(`Pipeline not completed: ${pipeline.status}`);
        }
        
        switch (format) {
            case 'json':
                return await this.exportAsJSON(pipelineId);
            case 'cypher':
                return await this.exportAsCypher(pipelineId);
            case 'graphml':
                return await this.exportAsGraphML(pipelineId);
            case 'dot':
                return await this.exportAsDot(pipelineId);
            default:
                throw new Error(`Unsupported format: ${format}`);
        }
    }
    
    /**
     * Export graph as JSON
     */
    async exportAsJSON(pipelineId) {
        const entities = await this.getEntities({ pipelineId });
        const relationships = await this.getRelationships({ pipelineId });
        
        return {
            format: 'json',
            data: {
                nodes: entities.entities,
                edges: relationships.relationships,
                metadata: {
                    pipelineId,
                    exportDate: new Date().toISOString()
                }
            }
        };
    }
    
    /**
     * Get pipeline status
     */
    async getPipelineStatus(args) {
        const { pipelineId } = args;
        
        const pipeline = this.activePipelines.get(pipelineId);
        if (!pipeline) {
            throw new Error(`Pipeline not found: ${pipelineId}`);
        }
        
        return {
            id: pipeline.id,
            status: pipeline.status,
            targetDirectory: pipeline.targetDirectory,
            startTime: pipeline.startTime,
            endTime: pipeline.endTime,
            progress: pipeline.progress,
            result: pipeline.result,
            error: pipeline.error
        };
    }
    
    /**
     * Validate arguments against schema
     */
    validateArguments(args, schema) {
        const errors = [];
        
        // Simple validation - in production, use ajv or similar
        if (schema.required) {
            for (const field of schema.required) {
                if (args[field] === undefined) {
                    errors.push(`Missing required field: ${field}`);
                }
            }
        }
        
        if (schema.properties) {
            for (const [field, fieldSchema] of Object.entries(schema.properties)) {
                if (args[field] !== undefined) {
                    // Type validation
                    if (fieldSchema.type && typeof args[field] !== fieldSchema.type) {
                        errors.push(`Invalid type for ${field}: expected ${fieldSchema.type}`);
                    }
                    
                    // Enum validation
                    if (fieldSchema.enum && !fieldSchema.enum.includes(args[field])) {
                        errors.push(`Invalid value for ${field}: must be one of ${fieldSchema.enum.join(', ')}`);
                    }
                }
            }
        }
        
        return {
            valid: errors.length === 0,
            errors
        };
    }
    
    /**
     * Helper methods for messaging
     */
    sendMessage(ws, message) {
        if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify(message));
        }
    }
    
    sendResult(ws, id, result) {
        this.sendMessage(ws, {
            jsonrpc: '2.0',
            id,
            result
        });
    }
    
    sendError(ws, id, code, message, data = null) {
        const error = {
            code,
            message
        };
        if (data) error.data = data;
        
        this.sendMessage(ws, {
            jsonrpc: '2.0',
            id,
            error
        });
    }
    
    notifyProgress(client, pipelineId, state) {
        this.sendMessage(client.ws, {
            jsonrpc: '2.0',
            method: 'progress',
            params: {
                pipelineId,
                progress: state.progress,
                status: state.status
            }
        });
    }
    
    notifyCompletion(client, pipelineId, state) {
        this.sendMessage(client.ws, {
            jsonrpc: '2.0',
            method: 'completed',
            params: {
                pipelineId,
                result: state.result,
                duration: state.endTime - state.startTime
            }
        });
    }
    
    notifyError(client, pipelineId, error) {
        this.sendMessage(client.ws, {
            jsonrpc: '2.0',
            method: 'error',
            params: {
                pipelineId,
                error: error.message,
                stack: error.stack
            }
        });
    }
    
    /**
     * Handle client disconnection
     */
    handleDisconnection(clientId) {
        this.clients.delete(clientId);
        if (this.config.enableLogging) {
            logger.info(`MCP Client disconnected: ${clientId}`);
        }
    }
    
    /**
     * Helper methods for metrics
     */
    async getNodeCount() {
        // This would query Neo4j in production
        const db = sqliteDb;
        const result = await db.get("SELECT COUNT(*) as count FROM pois");
        return result.count;
    }
    
    async getRelationshipCount() {
        const db = sqliteDb;
        const result = await db.get("SELECT COUNT(*) as count FROM relationships");
        return result.count;
    }
    
    /**
     * Shutdown the server
     */
    async shutdown() {
        if (this.server) {
            // Close all client connections
            for (const [clientId, client] of this.clients.entries()) {
                client.ws.close();
            }
            this.clients.clear();
            
            // Close server
            return new Promise((resolve) => {
                this.server.close(() => {
                    logger.info('MCP Server shut down');
                    resolve();
                });
            });
        }
    }
}

module.exports = MCPServer;