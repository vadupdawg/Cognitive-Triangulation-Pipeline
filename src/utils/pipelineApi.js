//
// pipelineApi.js
//
// API service for managing cognitive triangulation pipeline execution with real-time progress tracking
// Provides endpoints to start pipeline analysis on dynamic directory paths using EntityScout, GraphBuilder, and RelationshipResolver
//

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const http = require('http');
const path = require('path');
const fs = require('fs').promises;
const { spawn } = require('child_process');

class PipelineApiService {
    constructor(port = 3002) {
        this.app = express();
        this.server = http.createServer(this.app);
        this.wss = new WebSocketServer({ server: this.server });
        this.port = port;
        
        // Track active pipeline runs
        this.activePipelines = new Map(); // pipelineId -> pipeline status
        this.clients = new Set(); // WebSocket clients for real-time updates
        
        this.setupMiddleware();
        this.setupRoutes();
        this.setupWebSocket();
    }

    setupMiddleware() {
        this.app.use(cors());
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));
        
        // Request logging
        this.app.use((req, res, next) => {
            console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
            next();
        });
    }

    setupRoutes() {
        // Health check
        this.app.get('/health', (req, res) => {
            res.json({ status: 'healthy', timestamp: new Date().toISOString() });
        });

        // Start pipeline analysis
        this.app.post('/api/pipeline/start', async (req, res) => {
            try {
                const { targetDirectory, pipelineId } = req.body;
                
                if (!targetDirectory) {
                    return res.status(400).json({ 
                        error: 'targetDirectory is required',
                        example: { targetDirectory: 'C:/code/myproject', pipelineId: 'optional-custom-id' }
                    });
                }

                // Validate directory exists
                try {
                    const stats = await fs.stat(targetDirectory);
                    if (!stats.isDirectory()) {
                        return res.status(400).json({ 
                            error: 'targetDirectory must be a valid directory path',
                            provided: targetDirectory
                        });
                    }
                } catch (error) {
                    return res.status(400).json({ 
                        error: 'Directory does not exist or is not accessible',
                        provided: targetDirectory,
                        details: error.message
                    });
                }

                const id = pipelineId || this.generatePipelineId();
                
                // Check if pipeline is already running
                if (this.activePipelines.has(id)) {
                    return res.status(409).json({ 
                        error: 'Pipeline with this ID is already running',
                        pipelineId: id,
                        status: this.activePipelines.get(id).status
                    });
                }

                // Start pipeline asynchronously
                this.startPipelineAsync(id, targetDirectory);
                
                res.json({
                    message: 'Cognitive triangulation pipeline started successfully',
                    pipelineId: id,
                    targetDirectory: targetDirectory,
                    status: 'starting',
                    timestamp: new Date().toISOString()
                });

            } catch (error) {
                console.error('Error starting pipeline:', error);
                res.status(500).json({ 
                    error: 'Failed to start pipeline',
                    details: error.message
                });
            }
        });

        // Get pipeline status
        this.app.get('/api/pipeline/status/:pipelineId', (req, res) => {
            const { pipelineId } = req.params;
            const pipeline = this.activePipelines.get(pipelineId);
            
            if (!pipeline) {
                return res.status(404).json({ 
                    error: 'Pipeline not found',
                    pipelineId: pipelineId
                });
            }
            
            res.json(pipeline);
        });

        // Get all active pipelines
        this.app.get('/api/pipeline/active', (req, res) => {
            const activePipelines = Array.from(this.activePipelines.entries()).map(([id, data]) => ({
                pipelineId: id,
                ...data
            }));
            
            res.json({
                count: activePipelines.length,
                pipelines: activePipelines
            });
        });

        // Stop pipeline
        this.app.post('/api/pipeline/stop/:pipelineId', (req, res) => {
            const { pipelineId } = req.params;
            const pipeline = this.activePipelines.get(pipelineId);
            
            if (!pipeline) {
                return res.status(404).json({ 
                    error: 'Pipeline not found',
                    pipelineId: pipelineId
                });
            }
            
            // Mark for stopping (actual implementation would need process management)
            pipeline.status = 'stopping';
            pipeline.lastUpdate = new Date().toISOString();
            
            this.broadcastUpdate(pipelineId, pipeline);
            
            res.json({
                message: 'Pipeline stop requested',
                pipelineId: pipelineId,
                status: 'stopping'
            });
        });

        // Clear pipeline history
        this.app.delete('/api/pipeline/clear/:pipelineId', (req, res) => {
            const { pipelineId } = req.params;
            
            if (this.activePipelines.has(pipelineId)) {
                const pipeline = this.activePipelines.get(pipelineId);
                if (pipeline.status === 'running') {
                    return res.status(400).json({ 
                        error: 'Cannot clear running pipeline. Stop it first.',
                        pipelineId: pipelineId
                    });
                }
                this.activePipelines.delete(pipelineId);
            }
            
            res.json({
                message: 'Pipeline cleared',
                pipelineId: pipelineId
            });
        });
    }

    setupWebSocket() {
        this.wss.on('connection', (ws) => {
            console.log('New WebSocket client connected');
            this.clients.add(ws);
            
            // Send current active pipelines to new client
            ws.send(JSON.stringify({
                type: 'initial_state',
                pipelines: Array.from(this.activePipelines.entries()).map(([id, data]) => ({
                    pipelineId: id,
                    ...data
                }))
            }));
            
            ws.on('close', () => {
                console.log('WebSocket client disconnected');
                this.clients.delete(ws);
            });

            ws.on('error', (error) => {
                console.error('WebSocket error:', error);
                this.clients.delete(ws);
            });
        });
    }

    generatePipelineId() {
        return `pipeline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    async startPipelineAsync(pipelineId, targetDirectory) {
        const ProductionAgentFactory = require('./productionAgentFactory');
        const factory = new ProductionAgentFactory();
        
        const pipelineStatus = {
            pipelineId: pipelineId,
            targetDirectory: targetDirectory,
            status: 'starting',
            phase: 'initialization',
            startTime: new Date().toISOString(),
            lastUpdate: new Date().toISOString(),
            progress: {
                entityScout: { status: 'pending', filesProcessed: 0, entitiesFound: 0 },
                graphBuilder: { status: 'pending', nodesCreated: 0, relationshipsCreated: 0 },
                relationshipResolver: { status: 'pending', relationshipsResolved: 0, confidenceScore: 0 }
            },
            logs: []
        };
        
        this.activePipelines.set(pipelineId, pipelineStatus);
        this.broadcastUpdate(pipelineId, pipelineStatus);
        
        try {
            // Phase 1: Clear databases
            this.updatePipelineStatus(pipelineId, {
                phase: 'clearing_databases',
                status: 'running'
            }, '🗑️  Phase 1: Clearing databases for fresh start...');
            
            await factory.clearAllDatabases();
            this.updatePipelineStatus(pipelineId, {}, '✅ Databases cleared and schema initialized');
            
            // Phase 2: Test connections
            this.updatePipelineStatus(pipelineId, {
                phase: 'testing_connections'
            }, '🔗 Phase 2: Testing database and API connections...');
            
            const connections = await factory.testConnections();
            if (!connections.sqlite || !connections.deepseek || !connections.neo4j) {
                throw new Error('Required connections failed');
            }
            this.updatePipelineStatus(pipelineId, {}, '✅ All connections verified');
            
            // Phase 3: Run EntityScout
            this.updatePipelineStatus(pipelineId, {
                phase: 'entity_scout',
                'progress.entityScout.status': 'running'
            }, `🔍 Phase 3: Starting EntityScout analysis of ${targetDirectory}...`);
            
            const entityScout = await factory.createEntityScout(targetDirectory);
            await entityScout.run();
            
            // Get EntityScout results
            const db = await factory.getSqliteConnection();
            const entityReports = await db.all("SELECT COUNT(*) as count FROM entity_reports");
            const totalFiles = await db.all("SELECT COUNT(*) as count FROM files");
            
            this.updatePipelineStatus(pipelineId, {
                'progress.entityScout.status': 'completed',
                'progress.entityScout.filesProcessed': totalFiles[0].count,
                'progress.entityScout.entitiesFound': entityReports[0].count
            }, `✅ Phase 3 Complete: Processed ${totalFiles[0].count} files, found ${entityReports[0].count} entities`);
            
            // Phase 4: Run GraphBuilder
            this.updatePipelineStatus(pipelineId, {
                phase: 'graph_builder',
                'progress.graphBuilder.status': 'running'
            }, `🏗️ Phase 4: Starting GraphBuilder to create knowledge graph...`);
            
            const graphBuilder = await factory.createGraphBuilder();
            await graphBuilder.run();
            
            // Get GraphBuilder results from Neo4j
            const neo4jDriver = require('./neo4jDriver');
            const session = neo4jDriver.session();
            try {
                const nodeResult = await session.run('MATCH (n) RETURN count(n) as count');
                const relationshipResult = await session.run('MATCH ()-[r]->() RETURN count(r) as count');
                
                const nodeCount = nodeResult.records[0].get('count').toNumber();
                const relationshipCount = relationshipResult.records[0].get('count').toNumber();
                
                this.updatePipelineStatus(pipelineId, {
                    'progress.graphBuilder.status': 'completed',
                    'progress.graphBuilder.nodesCreated': nodeCount,
                    'progress.graphBuilder.relationshipsCreated': relationshipCount
                }, `✅ Phase 4 Complete: Created ${nodeCount} nodes and ${relationshipCount} relationships`);
            } finally {
                await session.close();
            }
            
            // Phase 5: Run RelationshipResolver
            this.updatePipelineStatus(pipelineId, {
                phase: 'relationship_resolver',
                'progress.relationshipResolver.status': 'running'
            }, '🔗 Phase 5: Starting RelationshipResolver for cognitive triangulation...');
            
            const relationshipResolver = await factory.createRelationshipResolver();
            await relationshipResolver.run();
            
            // Get final relationship count
            const session2 = neo4jDriver.session();
            try {
                const finalRelationshipResult = await session2.run('MATCH ()-[r]->() RETURN count(r) as count');
                const finalRelationshipCount = finalRelationshipResult.records[0].get('count').toNumber();
                
                this.updatePipelineStatus(pipelineId, {
                    'progress.relationshipResolver.status': 'completed',
                    'progress.relationshipResolver.relationshipsResolved': finalRelationshipCount,
                    'progress.relationshipResolver.confidenceScore': 95 // Placeholder for actual confidence scoring
                }, `✅ Phase 5 Complete: Resolved ${finalRelationshipCount} total relationships with cognitive triangulation`);
            } finally {
                await session2.close();
            }
            
            // Pipeline completed
            this.updatePipelineStatus(pipelineId, {
                status: 'completed',
                phase: 'completed',
                endTime: new Date().toISOString()
            }, '🎉 Cognitive triangulation pipeline completed successfully!');
            
        } catch (error) {
            console.error(`Pipeline ${pipelineId} failed:`, error);
            this.updatePipelineStatus(pipelineId, {
                status: 'failed',
                phase: 'failed',
                error: error.message,
                endTime: new Date().toISOString()
            }, `❌ Pipeline failed: ${error.message}`);
        } finally {
            await factory.cleanup();
        }
    }

    updatePipelineStatus(pipelineId, updates, logMessage = null) {
        const pipeline = this.activePipelines.get(pipelineId);
        if (!pipeline) return;
        
        // Apply nested updates
        Object.keys(updates).forEach(key => {
            if (key.includes('.')) {
                const parts = key.split('.');
                let target = pipeline;
                for (let i = 0; i < parts.length - 1; i++) {
                    if (!target[parts[i]]) target[parts[i]] = {};
                    target = target[parts[i]];
                }
                target[parts[parts.length - 1]] = updates[key];
            } else {
                pipeline[key] = updates[key];
            }
        });
        
        pipeline.lastUpdate = new Date().toISOString();
        
        if (logMessage) {
            // Log to console for real-time monitoring
            const timestamp = new Date().toISOString();
            console.log(`[${timestamp}] [${pipelineId}] ${logMessage}`);
            
            pipeline.logs.push({
                timestamp: timestamp,
                message: logMessage
            });
            
            // Keep only last 50 log entries
            if (pipeline.logs.length > 50) {
                pipeline.logs = pipeline.logs.slice(-50);
            }
        }
        
        this.broadcastUpdate(pipelineId, pipeline);
    }

    broadcastUpdate(pipelineId, pipelineData) {
        const message = JSON.stringify({
            type: 'pipeline_update',
            pipelineId: pipelineId,
            data: pipelineData
        });
        
        this.clients.forEach(client => {
            if (client.readyState === client.OPEN) {
                client.send(message);
            }
        });
    }

    start() {
        this.server.listen(this.port, () => {
            console.log(`🚀 Cognitive Triangulation Pipeline API Server running on http://localhost:${this.port}`);
            console.log(`📡 WebSocket server ready for real-time updates`);
            console.log(`\n📋 Available endpoints:`);
            console.log(`   POST /api/pipeline/start - Start cognitive triangulation pipeline`);
            console.log(`   GET  /api/pipeline/status/:id - Get pipeline status`);
            console.log(`   GET  /api/pipeline/active - List active pipelines`);
            console.log(`   POST /api/pipeline/stop/:id - Stop pipeline`);
            console.log(`   DELETE /api/pipeline/clear/:id - Clear pipeline history`);
            console.log(`   GET  /health - Health check`);
        });

        // Handle graceful shutdown
        process.on('SIGINT', () => {
            console.log('\n🛑 Shutting down Pipeline API Server...');
            this.shutdown();
        });

        process.on('SIGTERM', () => {
            console.log('\n🛑 Shutting down Pipeline API Server...');
            this.shutdown();
        });
    }

    shutdown() {
        console.log('Closing WebSocket connections...');
        this.clients.forEach(client => {
            client.close();
        });
        this.clients.clear();
        
        console.log('Closing server...');
        this.server.close();
        
        console.log('Pipeline API Server shutdown complete');
        process.exit(0);
    }
}

// Start the service if this file is run directly
if (require.main === module) {
    const service = new PipelineApiService();
    service.start();
}

module.exports = PipelineApiService; 