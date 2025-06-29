import { createRequire } from 'module';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import * as readline from 'readline';

const require = createRequire(import.meta.url);

// Import CommonJS modules
const { EntityScout } = require('./agents/EntityScout.js');
const { GraphBuilder } = require('./agents/GraphBuilder.js');
const { RelationshipResolver } = require('./agents/RelationshipResolver.js');
const { SelfCleaningAgent } = require('./agents/SelfCleaningAgent.js');
const { getDb, initializeDb } = require('./utils/sqliteDb.js');
const { driver: neo4jDriver } = require('./utils/neo4jDriver.js');
const { queueManager } = require('./utils/queueManager.js');
const logger = require('./utils/logger.js');
const config = require('./config/index.js');

/**
 * MCP Server for Cognitive Triangulation Pipeline
 * Implements JSON-RPC 2.0 protocol over stdio
 */
class MCPServer {
  constructor() {
    this.tools = new Map();
    this.activeAnalyses = new Map();
    this.setupTools();
  }

  setupTools() {
    // Register all available tools
    this.tools.set('analyzeCodebase', {
      description: 'Analyze an entire codebase and build a knowledge graph',
      inputSchema: {
        type: 'object',
        properties: {
          projectPath: {
            type: 'string',
            description: 'Path to the project directory'
          },
          options: {
            type: 'object',
            properties: {
              includePatterns: {
                type: 'array',
                items: { type: 'string' },
                description: 'File patterns to include'
              },
              excludePatterns: {
                type: 'array',
                items: { type: 'string' },
                description: 'File patterns to exclude'
              },
              maxConcurrency: {
                type: 'number',
                description: 'Maximum concurrent workers'
              }
            }
          }
        },
        required: ['projectPath']
      },
      handler: (input) => this.analyzeCodebase(input.projectPath, input.options || {})
    });

    this.tools.set('buildKnowledgeGraph', {
      description: 'Build or update the knowledge graph from analyzed data',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: {
            type: 'string',
            description: 'Unique project identifier'
          },
          options: {
            type: 'object',
            properties: {
              forceRebuild: {
                type: 'boolean',
                description: 'Force complete rebuild of graph'
              }
            }
          }
        },
        required: ['projectId']
      },
      handler: (input) => this.buildKnowledgeGraph(input.projectId, input.options || {})
    });

    this.tools.set('queryRelationships', {
      description: 'Query relationships in the knowledge graph',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'object',
            properties: {
              sourceType: {
                type: 'string',
                description: 'Type of source POI'
              },
              targetType: {
                type: 'string',
                description: 'Type of target POI'
              },
              relationshipType: {
                type: 'string',
                description: 'Type of relationship'
              },
              minConfidence: {
                type: 'number',
                description: 'Minimum confidence score'
              },
              filePath: {
                type: 'string',
                description: 'Filter by file path'
              }
            }
          }
        },
        required: ['query']
      },
      handler: (input) => this.queryRelationships(input.query)
    });

    this.tools.set('extractPOIs', {
      description: 'Extract Points of Interest from specific files',
      inputSchema: {
        type: 'object',
        properties: {
          filePaths: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of file paths to analyze'
          },
          options: {
            type: 'object',
            properties: {
              includeContext: {
                type: 'boolean',
                description: 'Include surrounding context'
              }
            }
          }
        },
        required: ['filePaths']
      },
      handler: (input) => this.extractPOIs(input.filePaths, input.options || {})
    });

    this.tools.set('cleanupGraph', {
      description: 'Clean up orphaned nodes and relationships in the graph',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: {
            type: 'string',
            description: 'Project identifier'
          },
          options: {
            type: 'object',
            properties: {
              dryRun: {
                type: 'boolean',
                description: 'Preview changes without applying'
              }
            }
          }
        },
        required: ['projectId']
      },
      handler: (input) => this.cleanupGraph(input.projectId, input.options || {})
    });
  }

  async handleRequest(request) {
    // JSON-RPC 2.0 request handling
    if (!request.jsonrpc || request.jsonrpc !== '2.0') {
      return this.createError(request.id, -32700, 'Parse error');
    }

    if (!request.method || typeof request.method !== 'string') {
      return this.createError(request.id, -32600, 'Invalid request');
    }

    switch (request.method) {
      case 'initialize':
        return this.handleInitialize(request);
      case 'tools/list':
        return this.handleToolsList(request);
      case 'tools/call':
        return this.handleToolCall(request);
      default:
        return this.createError(request.id, -32601, 'Method not found');
    }
  }

  async handleInitialize(request) {
    return {
      jsonrpc: '2.0',
      id: request.id,
      result: {
        protocolVersion: '1.0',
        capabilities: {
          tools: {
            enabled: true
          }
        },
        serverInfo: {
          name: 'cognitive-triangulation-mcp',
          version: '1.0.0'
        }
      }
    };
  }

  async handleToolsList(request) {
    const tools = [];
    for (const [name, tool] of this.tools) {
      tools.push({
        name,
        description: tool.description,
        inputSchema: tool.inputSchema
      });
    }

    return {
      jsonrpc: '2.0',
      id: request.id,
      result: { tools }
    };
  }

  async handleToolCall(request) {
    const { name, arguments: args } = request.params || {};
    
    if (!name || !this.tools.has(name)) {
      return this.createError(request.id, -32602, 'Invalid params: unknown tool');
    }

    try {
      const tool = this.tools.get(name);
      const result = await tool.handler(args);
      
      return {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        }
      };
    } catch (error) {
      logger.error(`Error executing tool ${name}:`, error);
      return this.createError(request.id, -32603, `Internal error: ${error.message}`);
    }
  }

  createError(id, code, message) {
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code,
        message
      }
    };
  }

  // Tool implementations
  async analyzeCodebase(projectPath, options) {
    try {
      const analysisId = `analysis-${Date.now()}`;
      logger.info(`Starting codebase analysis: ${analysisId}`, { projectPath, options });

      // Initialize database
      const db = await getDb();
      
      // Store analysis metadata
      this.activeAnalyses.set(analysisId, {
        projectPath,
        startTime: new Date(),
        status: 'running',
        options
      });

      // Run EntityScout to discover files
      const entityScout = new EntityScout({ projectPath });
      const discoveredFiles = await entityScout.run();

      // Update analysis status
      const analysis = this.activeAnalyses.get(analysisId);
      analysis.filesDiscovered = discoveredFiles.length;
      analysis.status = 'analyzing';

      return {
        analysisId,
        projectPath,
        filesDiscovered: discoveredFiles.length,
        status: 'processing',
        message: 'Analysis started. Use analysisId to track progress.'
      };
    } catch (error) {
      logger.error('Error starting codebase analysis:', error);
      throw error;
    }
  }

  async buildKnowledgeGraph(projectId, options) {
    try {
      logger.info(`Building knowledge graph for project: ${projectId}`, options);

      const graphBuilder = new GraphBuilder();
      const result = await graphBuilder.run();

      return {
        projectId,
        nodesCreated: result.nodesCreated || 0,
        relationshipsCreated: result.relationshipsCreated || 0,
        status: 'completed',
        message: 'Knowledge graph built successfully'
      };
    } catch (error) {
      logger.error('Error building knowledge graph:', error);
      throw error;
    }
  }

  async queryRelationships(query) {
    try {
      logger.info('Querying relationships:', query);

      const session = neo4jDriver.session();
      try {
        // Build dynamic Cypher query
        let cypher = 'MATCH (source:POI)-[r:RELATIONSHIP]->(target:POI) WHERE 1=1';
        const params = {};

        if (query.sourceType) {
          cypher += ' AND source.type = $sourceType';
          params.sourceType = query.sourceType;
        }

        if (query.targetType) {
          cypher += ' AND target.type = $targetType';
          params.targetType = query.targetType;
        }

        if (query.relationshipType) {
          cypher += ' AND r.type = $relationshipType';
          params.relationshipType = query.relationshipType;
        }

        if (query.minConfidence) {
          cypher += ' AND r.confidence >= $minConfidence';
          params.minConfidence = query.minConfidence;
        }

        if (query.filePath) {
          cypher += ' AND (source.filePath CONTAINS $filePath OR target.filePath CONTAINS $filePath)';
          params.filePath = query.filePath;
        }

        cypher += ' RETURN source, r, target LIMIT 1000';

        const result = await session.run(cypher, params);
        
        const relationships = result.records.map(record => ({
          source: record.get('source').properties,
          relationship: {
            type: record.get('r').properties.type,
            confidence: record.get('r').properties.confidence
          },
          target: record.get('target').properties
        }));

        return {
          count: relationships.length,
          relationships,
          query
        };
      } finally {
        await session.close();
      }
    } catch (error) {
      logger.error('Error querying relationships:', error);
      throw error;
    }
  }

  async extractPOIs(filePaths, options) {
    try {
      logger.info(`Extracting POIs from ${filePaths.length} files`, options);

      const db = await getDb();
      const pois = [];

      for (const filePath of filePaths) {
        const filePois = db.prepare(`
          SELECT * FROM pois 
          WHERE filePath = ?
        `).all(filePath);

        pois.push({
          filePath,
          pois: filePois
        });
      }

      return {
        filesProcessed: filePaths.length,
        totalPOIs: pois.reduce((sum, file) => sum + file.pois.length, 0),
        results: pois
      };
    } catch (error) {
      logger.error('Error extracting POIs:', error);
      throw error;
    }
  }

  async cleanupGraph(projectId, options) {
    try {
      logger.info(`Cleaning up graph for project: ${projectId}`, options);

      const cleaner = new SelfCleaningAgent();
      const result = await cleaner.run();

      return {
        projectId,
        nodesRemoved: result.deletedNodes || 0,
        relationshipsRemoved: result.deletedRelationships || 0,
        dryRun: options.dryRun || false,
        status: 'completed'
      };
    } catch (error) {
      logger.error('Error cleaning up graph:', error);
      throw error;
    }
  }

  async start() {
    logger.info('Starting MCP Server...');
    
    // Initialize database if needed
    try {
      await initializeDb();
      logger.info('Database initialized');
    } catch (error) {
      logger.error('Failed to initialize database:', error);
      // Continue anyway - database might already be initialized
    }
    
    // Read from stdin line by line
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false
    });

    rl.on('line', async (line) => {
      try {
        const request = JSON.parse(line);
        const response = await this.handleRequest(request);
        console.log(JSON.stringify(response));
      } catch (error) {
        const errorResponse = {
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32700,
            message: 'Parse error'
          }
        };
        console.log(JSON.stringify(errorResponse));
      }
    });

    logger.info('MCP Server started and listening on stdio');
  }

  async stop() {
    // Clean up resources
    await queueManager.closeConnections();
    await neo4jDriver.close();
    logger.info('MCP Server stopped');
  }
}

// Create and start the server
const server = new MCPServer();

// Handle shutdown gracefully
process.on('SIGINT', async () => {
  await server.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await server.stop();
  process.exit(0);
});

// Start the server
server.start().catch(error => {
  logger.error('Failed to start MCP server:', error);
  process.exit(1);
});