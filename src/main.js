const { initializeDb, getDb } = require('./utils/sqliteDb');
const { getNeo4jDriver } = require('./utils/neo4jDriver');
const QueueManager = require('./utils/queueManager');
const queueManager = new QueueManager();
const EntityScout = require('./agents/EntityScout');
const FileAnalysisWorker = require('./workers/fileAnalysisWorker');
const DirectoryResolutionWorker = require('./workers/directoryResolutionWorker');
const GlobalResolutionWorker = require('./workers/globalResolutionWorker');
const config = require('./config');
const { v4: uuidv4 } = require('uuid');

class CognitiveTriangulationPipeline {
    constructor(targetDirectory) {
        this.targetDirectory = targetDirectory;
        this.runId = uuidv4();
        this.queueManager = queueManager;
        this.metrics = {
            startTime: null,
            endTime: null,
            totalJobs: 0,
            completedJobs: 0,
            failedJobs: 0,
        };
    }

    async initialize() {
        console.log('🚀 Initializing Job-Based Cognitive Triangulation Pipeline...');
        await initializeDb();
        await this.clearDatabases();
        console.log('✅ Databases and clients initialized successfully');
    }

    async run() {
        this.metrics.startTime = new Date();
        try {
            await this.initialize();

            console.log('🏁 Starting workers...');
            this.startWorkers();

            console.log('🔍 Starting EntityScout to produce jobs...');
            const entityScout = new EntityScout(this.queueManager, this.targetDirectory);
            const { globalJob, totalJobs } = await entityScout.run();
            this.metrics.totalJobs = totalJobs;
            console.log(`✅ EntityScout created ${totalJobs} jobs with global job ${globalJob.id}`);

            console.log('⏳ Waiting for global job to complete...');
            await globalJob.waitUntilFinished(this.queueManager.events);
            console.log('🎉 Global job completed!');

            this.metrics.endTime = new Date();
            await this.printFinalReport();

        } catch (error) {
            console.error('❌ Critical error in pipeline execution:', error);
            this.metrics.failedJobs++;
            throw error;
        } finally {
            await this.queueManager.closeConnections();
            const neo4jDriver = getNeo4jDriver();
            if (process.env.NODE_ENV !== 'test' && neo4jDriver) {
                await neo4jDriver.close();
            }
        }
    }

    startWorkers() {
        new FileAnalysisWorker(this.queueManager.getQueue('file-analysis-queue'));
        new DirectoryResolutionWorker(this.queueManager.getQueue('directory-resolution-queue'));
        new GlobalResolutionWorker(this.queueManager.getQueue('global-resolution-queue'));
        console.log('✅ All workers are running and listening for jobs.');
    }

    async clearDatabases() {
        const db = await getDb();
        console.log('🗑️ Clearing SQLite database...');
        db.exec('DELETE FROM relationships');
        db.exec('DELETE FROM pois');
        db.exec('DELETE FROM files');
        
        const neo4jDriver = getNeo4jDriver();
        console.log('🗑️ Clearing Neo4j database...');
        const session = neo4jDriver.session({ database: config.NEO4J_DATABASE });
        try {
            await session.run('MATCH (n) DETACH DELETE n');
            console.log('✅ Neo4j database cleared successfully');
        } catch (error) {
            console.error('❌ Error clearing Neo4j database:', error);
            throw error;
        } finally {
            await session.close();
        }
    }

    async printFinalReport() {
        const duration = this.metrics.endTime - this.metrics.startTime;
        const durationSeconds = Math.round(duration / 1000);
        
        console.log(`\n🎯 ====== JOB-BASED PIPELINE REPORT ======`);
        console.log(`⏱️  Total Duration: ${durationSeconds} seconds`);
        console.log(`📈 Total Jobs Created: ${this.metrics.totalJobs}`);
        console.log(`=========================================\n`);
    }
}

async function main() {
    const args = process.argv.slice(2);
    const dirIndex = args.indexOf('--dir');
    const targetDirectory = dirIndex !== -1 ? args[dirIndex + 1] : process.cwd();

    try {
        const pipeline = new CognitiveTriangulationPipeline(targetDirectory, {
            maxParallelAgents: 100,
            enableSelfCleaning: true,
            validateResults: true
        });
        
        await pipeline.run();
        console.log('🎉 Cognitive triangulation pipeline completed successfully!');
        
    } catch (error) {
        console.error('💥 Fatal error in pipeline:', error);
        process.exit(1);
    }
}

// Only run main if this file is executed directly
if (require.main === module) {
    main();
}

module.exports = { CognitiveTriangulationPipeline, main };