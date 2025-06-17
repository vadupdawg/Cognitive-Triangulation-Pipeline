//
// pipelineApi.js
//
// API service for managing pipeline execution with real-time progress tracking
// Provides endpoints to start pipeline analysis on dynamic directory paths
//

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const http = require('http');
const path = require('path');
const fs = require('fs').promises;
const { spawn } = require('child_process');
const ProductionAgentFactory = require('./productionAgentFactory');

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
                    message: 'Pipeline started successfully',
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

    async runParallelWorkers(pipelineId, targetDirectory, factory, totalTasks) {
        const MAX_WORKERS = 50;
        let tasksProcessed = 0;
        
        // Get all pending tasks first
        const db = await factory.getSqliteConnection();
        const allTasks = await db.all("SELECT * FROM work_queue WHERE status = 'pending' ORDER BY id");
        await db.close();
        
        if (allTasks.length === 0) {
            this.updatePipelineStatus(pipelineId, {
                'progress.workerAgent.status': 'completed'
            }, '✅ Phase 5 Complete: No tasks to process');
            return;
        }
        
        // Create one worker per task (up to MAX_WORKERS)
        const numWorkers = Math.min(MAX_WORKERS, allTasks.length);
        this.updatePipelineStatus(pipelineId, {}, `🚀 Starting ${numWorkers} parallel workers for ${allTasks.length} files...`);
        
        // Create worker function that processes a specific task
        const createWorker = async (workerId, task) => {
            const workerAgent = await factory.createWorkerAgent(targetDirectory);
            
            this.updatePipelineStatus(pipelineId, {
                'progress.workerAgent.currentFile': task.file_path
            }, `🔍 [Worker ${workerId}] Processing: ${task.file_path} (${workerId}/${allTasks.length})`);
            
            try {
                // Claim the specific task
                const claimedTask = await workerAgent.claimSpecificTask(task.id, `worker-${workerId}`);
                if (claimedTask) {
                    await workerAgent.processTask(claimedTask);
                    tasksProcessed++;
                    
                    this.updatePipelineStatus(pipelineId, {
                        'progress.workerAgent.tasksProcessed': tasksProcessed
                    }, `✅ [Worker ${workerId}] Completed: ${path.basename(task.file_path)} (${tasksProcessed}/${allTasks.length})`);
                } else {
                    this.updatePipelineStatus(pipelineId, {}, 
                        `⚠️ [Worker ${workerId}] Task already claimed: ${path.basename(task.file_path)}`);
                }
            } catch (error) {
                this.updatePipelineStatus(pipelineId, {}, 
                    `❌ [Worker ${workerId}] Failed: ${path.basename(task.file_path)} - ${error.message}`);
            }
        };
        
        // Start all workers simultaneously, each with their assigned task
        const workers = [];
        for (let i = 0; i < numWorkers; i++) {
            const task = allTasks[i];
            workers.push(createWorker(i + 1, task));
        }
        
        // If we have more tasks than workers, handle remaining tasks
        if (allTasks.length > numWorkers) {
            this.updatePipelineStatus(pipelineId, {}, 
                `⚠️ Note: ${allTasks.length - numWorkers} tasks will be processed after initial batch completes`);
            
            // Process remaining tasks after first batch
            const remainingTasks = allTasks.slice(numWorkers);
            for (const task of remainingTasks) {
                workers.push(createWorker(workers.length + 1, task));
            }
        }
        
        // Wait for all workers to complete
        await Promise.all(workers);
        
        this.updatePipelineStatus(pipelineId, {
            'progress.workerAgent.status': 'completed',
            'progress.workerAgent.currentFile': null
        }, `✅ Phase 5 Complete: All ${allTasks.length} files processed in parallel`);
    }

    async startPipelineAsync(pipelineId, targetDirectory) {
        const factory = new ProductionAgentFactory();
        
        const pipelineStatus = {
            pipelineId: pipelineId,
            targetDirectory: targetDirectory,
            status: 'starting',
            phase: 'initialization',
            startTime: new Date().toISOString(),
            lastUpdate: new Date().toISOString(),
            progress: {
                scoutAgent: { status: 'pending', filesFound: 0, filesQueued: 0 },
                workerAgent: { status: 'pending', tasksProcessed: 0, tasksTotal: 0, currentFile: null },
                graphIngestor: { status: 'pending', resultsIngested: 0, relationshipsCreated: 0 }
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
            this.updatePipelineStatus(pipelineId, {}, '✅ Databases cleared successfully');
            
            // Phase 2: Test connections
            this.updatePipelineStatus(pipelineId, {
                phase: 'testing_connections'
            }, '🔗 Phase 2: Testing database and API connections...');
            
            const connections = await factory.testConnections();
            if (!connections.sqlite || !connections.deepseek || !connections.neo4j) {
                throw new Error('Required connections failed');
            }
            this.updatePipelineStatus(pipelineId, {}, '✅ All connections verified');
            
            // Phase 3: Initialize database
            this.updatePipelineStatus(pipelineId, {
                phase: 'initializing_database'
            }, '📊 Phase 3: Initializing database schema...');
            
            await factory.initializeDatabase();
            this.updatePipelineStatus(pipelineId, {}, '✅ Database schema initialized');
            
            // Phase 4: Run ScoutAgent
            this.updatePipelineStatus(pipelineId, {
                phase: 'scout_analysis',
                'progress.scoutAgent.status': 'running'
            }, `🔍 Phase 4: Starting repository scan of ${targetDirectory}...`);
            
            const scoutAgent = await factory.createScoutAgent(targetDirectory);
            await scoutAgent.run();
            
            // Get scout results
            const db = await factory.getSqliteConnection();
            const queuedFiles = await db.all("SELECT COUNT(*) as count FROM work_queue WHERE status = 'pending'");
            const totalFiles = await db.all("SELECT COUNT(*) as count FROM file_state");
            await db.close();
            
            this.updatePipelineStatus(pipelineId, {
                'progress.scoutAgent.status': 'completed',
                'progress.scoutAgent.filesFound': totalFiles[0].count,
                'progress.scoutAgent.filesQueued': queuedFiles[0].count,
                'progress.workerAgent.tasksTotal': queuedFiles[0].count
            }, `✅ Phase 4 Complete: Found ${totalFiles[0].count} files, queued ${queuedFiles[0].count} for analysis`);
            
            // Phase 5: Run WorkerAgent(s) in parallel
            this.updatePipelineStatus(pipelineId, {
                phase: 'worker_analysis',
                'progress.workerAgent.status': 'running'
            }, `🤖 Phase 5: Starting parallel file analysis with up to 50 workers...`);
            
            await this.runParallelWorkers(pipelineId, targetDirectory, factory, queuedFiles[0].count);
            
            // Phase 6: Run GraphIngestorAgent
            this.updatePipelineStatus(pipelineId, {
                phase: 'graph_ingestion',
                'progress.graphIngestor.status': 'running'
            }, '🔗 Phase 6: Starting graph database ingestion...');
            
            const db2 = await factory.getSqliteConnection();
            const analysisBatch = await db2.all("SELECT * FROM analysis_results WHERE status = 'pending_ingestion'");
            const refactoringBatch = await db2.all("SELECT * FROM refactoring_tasks WHERE status = 'pending'");
            
            if (analysisBatch.length > 0 || refactoringBatch.length > 0) {
                const { processBatch } = require('../agents/GraphIngestorAgent');
                await processBatch(analysisBatch, refactoringBatch, db2);
                
                this.updatePipelineStatus(pipelineId, {
                    'progress.graphIngestor.status': 'completed',
                    'progress.graphIngestor.resultsIngested': analysisBatch.length
                }, `Graph ingestion completed: ${analysisBatch.length} analysis results ingested`);
            } else {
                this.updatePipelineStatus(pipelineId, {
                    'progress.graphIngestor.status': 'completed'
                }, 'No data to ingest');
            }
            
            await db2.close();
            
            // Pipeline completed
            this.updatePipelineStatus(pipelineId, {
                status: 'completed',
                phase: 'completed',
                endTime: new Date().toISOString()
            }, '🎉 Pipeline completed successfully!');
            
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
            console.log(`🚀 Pipeline API Server running on http://localhost:${this.port}`);
            console.log(`📡 WebSocket server ready for real-time updates`);
            console.log(`\n📋 Available endpoints:`);
            console.log(`   POST /api/pipeline/start - Start pipeline analysis`);
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
        // Close WebSocket connections
        this.clients.forEach(client => {
            if (client.readyState === client.OPEN) {
                client.close();
            }
        });

        // Close HTTP server
        this.server.close(() => {
            console.log('✅ Pipeline API Server shut down complete');
            process.exit(0);
        });
    }
}

module.exports = PipelineApiService;

// Auto-start server if this file is run directly
if (require.main === module) {
    console.log(`
🎯 Pipeline API Service
=======================

Starting API server that will manage:
- Pipeline execution with real-time tracking
- Database clearing and initialization
- Progress monitoring via WebSocket

`);

    const apiService = new PipelineApiService(3002);
    apiService.start();

    console.log(`
📋 Usage Examples:

1. Start pipeline analysis:
   curl -X POST http://localhost:3002/api/pipeline/start \\
        -H "Content-Type: application/json" \\
        -d '{"targetDirectory": "C:/code/myproject"}'

2. Check pipeline status:
   curl http://localhost:3002/api/pipeline/status/PIPELINE_ID

3. List active pipelines:
   curl http://localhost:3002/api/pipeline/active

4. Health check:
   curl http://localhost:3002/health

📡 Real-time updates available via WebSocket at:
   ws://localhost:3002

🛑 To stop: Ctrl+C
`);
} 