const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');
const MessageHandler = require('./MessageHandler');
const ResponseBuilder = require('./ResponseBuilder');
const ProtocolValidator = require('./ProtocolValidator');
const { createTransport } = require('./transport');

/**
 * Main MCP Server implementation for Cognitive Triangulation Pipeline
 * 
 * This server provides project mapping and code analysis capabilities
 * through the Model Context Protocol (MCP).
 */
class MCPServer extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.id = config.name || 'cognitive-triangulation-mcp';
    this.version = config.version || '1.0.0';
    
    // Core components
    this.transport = null;
    this.messageHandler = new MessageHandler(this);
    this.responseBuilder = new ResponseBuilder();
    this.protocolValidator = new ProtocolValidator();
    
    // Tool and resource registries
    this.tools = new Map();
    this.resources = new Map();
    
    // Session management
    this.sessions = new Map();
    
    // Initialize built-in tools
    this._registerBuiltInTools();
  }

  /**
   * Start the MCP server
   */
  async start() {
    console.log(`[MCPServer] Starting ${this.id} v${this.version}...`);
    
    try {
      // Initialize transport
      this.transport = createTransport(this.config.transport);
      this.transport.on('message', this._handleMessage.bind(this));
      this.transport.on('error', this._handleTransportError.bind(this));
      
      // Start transport
      await this.transport.start();
      
      // Initialize pipeline if configured
      if (this.config.pipeline) {
        await this._initializePipeline();
      }
      
      console.log(`[MCPServer] Server started successfully`);
      this.emit('started');
      
      // Send initialization message
      await this._sendInitialization();
      
    } catch (error) {
      console.error('[MCPServer] Failed to start server:', error);
      throw error;
    }
  }

  /**
   * Stop the MCP server
   */
  async stop() {
    console.log('[MCPServer] Stopping server...');
    
    try {
      // Close all active sessions
      for (const session of this.sessions.values()) {
        await this._closeSession(session.id);
      }
      
      // Stop transport
      if (this.transport) {
        await this.transport.stop();
      }
      
      // Cleanup pipeline resources
      if (this.pipeline) {
        await this.pipeline.close();
      }
      
      console.log('[MCPServer] Server stopped successfully');
      this.emit('stopped');
      
    } catch (error) {
      console.error('[MCPServer] Error during shutdown:', error);
      throw error;
    }
  }

  /**
   * Register a tool handler
   */
  registerTool(name, handler) {
    if (this.tools.has(name)) {
      throw new Error(`Tool '${name}' is already registered`);
    }
    
    this.tools.set(name, handler);
    console.log(`[MCPServer] Registered tool: ${name}`);
  }

  /**
   * Register a resource provider
   */
  registerResource(name, provider) {
    if (this.resources.has(name)) {
      throw new Error(`Resource '${name}' is already registered`);
    }
    
    this.resources.set(name, provider);
    console.log(`[MCPServer] Registered resource: ${name}`);
  }

  /**
   * Handle incoming messages
   */
  async _handleMessage(message) {
    try {
      // Validate message format
      const validationResult = this.protocolValidator.validateMessage(message);
      if (!validationResult.valid) {
        await this._sendError(message.id, -32600, 'Invalid Request', validationResult.errors);
        return;
      }
      
      // Process message
      const response = await this.messageHandler.handle(message);
      
      // Send response if needed
      if (response) {
        await this.transport.send(response);
      }
      
    } catch (error) {
      console.error('[MCPServer] Error handling message:', error);
      await this._sendError(message.id, -32603, 'Internal error', error.message);
    }
  }

  /**
   * Handle transport errors
   */
  _handleTransportError(error) {
    console.error('[MCPServer] Transport error:', error);
    this.emit('error', error);
  }

  /**
   * Send initialization message
   */
  async _sendInitialization() {
    const initMessage = this.responseBuilder.buildInitialization({
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {
          listChanged: true
        },
        resources: {
          subscribe: true,
          listChanged: true
        },
        logging: {}
      },
      serverInfo: {
        name: this.id,
        version: this.version
      }
    });
    
    await this.transport.send(initMessage);
  }

  /**
   * Send error response
   */
  async _sendError(id, code, message, data) {
    const errorResponse = this.responseBuilder.buildError(id, code, message, data);
    await this.transport.send(errorResponse);
  }

  /**
   * Initialize the cognitive triangulation pipeline
   */
  async _initializePipeline() {
    const { CognitiveTriangulationPipeline } = require('../../main');
    
    this.pipeline = new CognitiveTriangulationPipeline(
      this.config.pipeline.targetDirectory || process.cwd(),
      this.config.storage?.sqlite?.path
    );
    
    await this.pipeline.initialize();
    console.log('[MCPServer] Pipeline initialized');
  }

  /**
   * Register built-in tools
   */
  _registerBuiltInTools() {
    // Project analysis tool
    this.registerTool('analyze_project', {
      description: 'Analyze a project directory and build entity graph',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Project directory path' },
          options: {
            type: 'object',
            properties: {
              depth: { type: 'number', description: 'Analysis depth' },
              includeTests: { type: 'boolean' },
              languages: { type: 'array', items: { type: 'string' } }
            }
          }
        },
        required: ['path']
      },
      handler: this._handleAnalyzeProject.bind(this)
    });

    // Entity query tool
    this.registerTool('query_entities', {
      description: 'Query entities and their relationships',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: { type: 'string' },
          query: {
            type: 'object',
            properties: {
              entityType: { type: 'string' },
              name: { type: 'string' },
              includeRelationships: { type: 'boolean' }
            }
          }
        },
        required: ['projectId', 'query']
      },
      handler: this._handleQueryEntities.bind(this)
    });

    // Find definition tool
    this.registerTool('find_definition', {
      description: 'Find where an entity is defined',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: { type: 'string' },
          entityName: { type: 'string' },
          entityType: { 
            type: 'string', 
            enum: ['function', 'class', 'variable', 'module'] 
          }
        },
        required: ['projectId', 'entityName']
      },
      handler: this._handleFindDefinition.bind(this)
    });

    // Get project summary tool
    this.registerTool('get_project_summary', {
      description: 'Get a summary of the analyzed project',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: { type: 'string' }
        },
        required: ['projectId']
      },
      handler: this._handleGetProjectSummary.bind(this)
    });
  }

  /**
   * Handle analyze_project tool
   */
  async _handleAnalyzeProject(params) {
    const sessionId = uuidv4();
    const session = {
      id: sessionId,
      type: 'analysis',
      projectPath: params.path,
      options: params.options || {},
      startTime: new Date(),
      status: 'initializing'
    };
    
    this.sessions.set(sessionId, session);
    
    try {
      // Create a new pipeline instance for this analysis
      const { CognitiveTriangulationPipeline } = require('../../main');
      const pipeline = new CognitiveTriangulationPipeline(
        params.path,
        `:memory:` // Use in-memory database for analysis sessions
      );
      
      session.pipeline = pipeline;
      session.status = 'analyzing';
      
      // Run the analysis
      await pipeline.run();
      
      session.status = 'completed';
      session.endTime = new Date();
      
      return {
        sessionId,
        status: 'completed',
        summary: {
          projectPath: params.path,
          duration: session.endTime - session.startTime,
          filesAnalyzed: pipeline.metrics.totalJobs
        }
      };
      
    } catch (error) {
      session.status = 'failed';
      session.error = error.message;
      throw error;
    }
  }

  /**
   * Handle query_entities tool
   */
  async _handleQueryEntities(params) {
    const session = this.sessions.get(params.projectId);
    if (!session) {
      throw new Error(`Project session '${params.projectId}' not found`);
    }
    
    if (session.status !== 'completed') {
      throw new Error(`Project analysis is ${session.status}`);
    }
    
    const db = session.pipeline.dbManager.getDb();
    const query = params.query;
    
    // Build SQL query based on parameters
    let sql = 'SELECT * FROM pois WHERE 1=1';
    const sqlParams = [];
    
    if (query.entityType) {
      sql += ' AND type = ?';
      sqlParams.push(query.entityType);
    }
    
    if (query.name) {
      sql += ' AND name LIKE ?';
      sqlParams.push(`%${query.name}%`);
    }
    
    const entities = db.prepare(sql).all(...sqlParams);
    
    // Include relationships if requested
    if (query.includeRelationships) {
      for (const entity of entities) {
        const relationships = db.prepare(
          'SELECT * FROM relationships WHERE source_poi_id = ? OR target_poi_id = ?'
        ).all(entity.id, entity.id);
        entity.relationships = relationships;
      }
    }
    
    return { entities };
  }

  /**
   * Handle find_definition tool
   */
  async _handleFindDefinition(params) {
    const session = this.sessions.get(params.projectId);
    if (!session) {
      throw new Error(`Project session '${params.projectId}' not found`);
    }
    
    const db = session.pipeline.dbManager.getDb();
    
    // Find the entity
    const entity = db.prepare(
      'SELECT * FROM pois WHERE name = ? AND type = ?'
    ).get(params.entityName, params.entityType || '');
    
    if (!entity) {
      return { found: false };
    }
    
    // Get file information
    const file = db.prepare(
      'SELECT * FROM files WHERE id = ?'
    ).get(entity.file_id);
    
    return {
      found: true,
      definition: {
        entityId: entity.id,
        name: entity.name,
        type: entity.type,
        filePath: file.file_path,
        position: {
          line: entity.start_line,
          column: entity.start_column
        },
        description: entity.description
      }
    };
  }

  /**
   * Handle get_project_summary tool
   */
  async _handleGetProjectSummary(params) {
    const session = this.sessions.get(params.projectId);
    if (!session) {
      throw new Error(`Project session '${params.projectId}' not found`);
    }
    
    const db = session.pipeline.dbManager.getDb();
    
    // Gather summary statistics
    const fileCount = db.prepare('SELECT COUNT(*) as count FROM files').get().count;
    const entityCount = db.prepare('SELECT COUNT(*) as count FROM pois').get().count;
    const relationshipCount = db.prepare('SELECT COUNT(*) as count FROM relationships').get().count;
    
    // Entity type breakdown
    const entityTypes = db.prepare(
      'SELECT type, COUNT(*) as count FROM pois GROUP BY type'
    ).all();
    
    // Language breakdown
    const languages = db.prepare(
      'SELECT language, COUNT(*) as count FROM files GROUP BY language'
    ).all();
    
    return {
      projectPath: session.projectPath,
      summary: {
        totalFiles: fileCount,
        totalEntities: entityCount,
        totalRelationships: relationshipCount,
        entityTypes: entityTypes.reduce((acc, row) => {
          acc[row.type] = row.count;
          return acc;
        }, {}),
        languages: languages.reduce((acc, row) => {
          acc[row.language || 'unknown'] = row.count;
          return acc;
        }, {})
      }
    };
  }

  /**
   * Close a session and cleanup resources
   */
  async _closeSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    
    if (session.pipeline) {
      await session.pipeline.close();
    }
    
    this.sessions.delete(sessionId);
    console.log(`[MCPServer] Closed session: ${sessionId}`);
  }
}

module.exports = MCPServer;