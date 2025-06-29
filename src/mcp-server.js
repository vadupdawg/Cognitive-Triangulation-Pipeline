import { Server } from '@modelcontextprotocol/server';
import { StdioTransport } from '@modelcontextprotocol/server/stdio';
import { EntityScout } from './agents/EntityScout.js';
import { GraphBuilder } from './agents/GraphBuilder.js';
import { RelationshipResolver } from './agents/RelationshipResolver.js';
import { SelfCleaningAgent } from './agents/SelfCleaningAgent.js';
import { getDb } from './utils/sqliteDb.js';
import { driver as neo4jDriver } from './utils/neo4jDriver.js';
import { queueManager } from './utils/queueManager.js';
import logger from './utils/logger.js';
import config from './config.js';

/**
 * Cognitive Triangulation MCP Server
 * Provides code analysis and knowledge graph building capabilities
 */
class CognitiveTriangulationMCP {
  constructor() {
    this.server = new Server({
      name: 'cognitive-triangulation',
      version: '1.0.0',
      description: 'Automated code analysis and knowledge graph construction'
    });

    this.setupTools();
    this.activeAnalyses = new Map();
  }

  setupTools() {
    // Tool: analyzeCodebase
    this.server.addTool({
      name: 'analyzeCodebase',
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
      handler: async (input) => {
        return this.analyzeCodebase(input.projectPath, input.options || {});
      }
    });

    // Tool: buildKnowledgeGraph
    this.server.addTool({
      name: 'buildKnowledgeGraph',
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
      handler: async (input) => {
        return this.buildKnowledgeGraph(input.projectId, input.options || {});
      }
    });

    // Tool: queryRelationships
    this.server.addTool({
      name: 'queryRelationships',
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
      handler: async (input) => {
        return this.queryRelationships(input.query);
      }
    });

    // Tool: extractPOIs
    this.server.addTool({
      name: 'extractPOIs',
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
      handler: async (input) => {
        return this.extractPOIs(input.filePaths, input.options || {});
      }
    });

    // Tool: cleanupGraph
    this.server.addTool({
      name: 'cleanupGraph',
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
      handler: async (input) => {
        return this.cleanupGraph(input.projectId, input.options || {});
      }
    });
  }

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

      // Process files through the pipeline
      // The workers will handle the rest automatically through the queue system

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
    const transport = new StdioTransport();
    await this.server.start(transport);
    logger.info('Cognitive Triangulation MCP Server started');
  }

  async stop() {
    // Clean up resources
    await queueManager.closeConnections();
    await neo4jDriver.close();
    logger.info('Cognitive Triangulation MCP Server stopped');
  }
}

// Start the server
const mcpServer = new CognitiveTriangulationMCP();

// Handle shutdown gracefully
process.on('SIGINT', async () => {
  await mcpServer.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await mcpServer.stop();
  process.exit(0);
});

// Start the server
mcpServer.start().catch(error => {
  logger.error('Failed to start MCP server:', error);
  process.exit(1);
});