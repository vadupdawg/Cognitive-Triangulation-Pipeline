const { DatabaseManager } = require('./utils/sqliteDb');
const neo4jDriver = require('./utils/neo4jDriver');
const QueueManager = require('./utils/queueManager');
const EntityScout = require('./agents/EntityScout');
const FileAnalysisWorker = require('./workers/fileAnalysisWorker');
const DirectoryResolutionWorker = require('./workers/directoryResolutionWorker');
const GlobalResolutionWorker = require('./workers/globalResolutionWorker');
const config = require('./config');
const { v4: uuidv4 } = require('uuid');
const { QueueEvents } = require('bullmq');

class CognitiveTriangulationPipeline {
    constructor(targetDirectory, dbPath = './database.db') {
        this.targetDirectory = targetDirectory;
        this.dbPath = dbPath;
        this.runId = uuidv4();
        this.queueManager = new QueueManager();
        this.dbManager = new DatabaseManager(this.dbPath);
        this.metrics = {
            startTime: null,
            endTime: null,
            totalJobs: 0,
            completedJobs: 0,
            failedJobs: 0,
        };
    }

    async initialize() {
        console.log('🚀 [main.js] Initializing Job-Based Cognitive Triangulation Pipeline...');
        this.dbManager.initializeDb();
        console.log('🚀 [main.js] Database schema initialized.');
        await this.clearDatabases();
        console.log('✅ [main.js] Databases and clients initialized successfully');
    }

    async run() {
        console.log('🚀 [main.js] Pipeline run started.');
        this.metrics.startTime = new Date();
        try {
            await this.initialize();

            console.log('🏁 [main.js] Starting workers...');
            this.startWorkers();

            console.log('🔍 [main.js] Starting EntityScout to produce jobs...');
            const entityScout = new EntityScout(this.queueManager, this.targetDirectory, this.runId);
            const { globalJob, totalJobs } = await entityScout.run();
            this.metrics.totalJobs = totalJobs;
            console.log(`✅ [main.js] EntityScout created ${totalJobs} jobs with global job ${globalJob.id}`);

            console.log('⏳ [main.js] Waiting for global job to complete...');
            await this.waitForCompletion(globalJob);
            console.log('🎉 [main.js] All jobs completed!');

            this.metrics.endTime = new Date();
            await this.printFinalReport();

        } catch (error) {
            console.error('❌ [main.js] Critical error in pipeline execution:', error);
            this.metrics.failedJobs++;
            throw error;
        }
    }

    startWorkers() {
        new FileAnalysisWorker(this.queueManager, null, this.dbManager);
        new DirectoryResolutionWorker(this.queueManager, null, this.dbManager);
        new GlobalResolutionWorker(this.queueManager, null, this.dbManager);
        console.log('✅ All workers are running and listening for jobs.');
    }

    async clearDatabases() {
        const db = this.dbManager.getDb();
        console.log('🗑️ Clearing SQLite database...');
        db.exec('DELETE FROM relationships');
        db.exec('DELETE FROM pois');
        db.exec('DELETE FROM files');
        db.exec('DELETE FROM directory_summaries');

        const driver = neo4jDriver;
        console.log('🗑️ Clearing Neo4j database...');
        const session = driver.session({ database: config.NEO4J_DATABASE });
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
    async waitForCompletion(globalJob) {
        if (!globalJob) {
            console.log('No global job to wait for. Skipping wait.');
            return;
        }

        const queueName = globalJob.queueName;
        const queueEvents = new QueueEvents(queueName, { connection: this.queueManager.connectionOptions });

        try {
            await globalJob.waitUntilFinished(queueEvents);
            console.log(`Global job ${globalJob.id} completed successfully.`);
        } catch (error) {
            console.error(`Error waiting for global job ${globalJob.id} to complete.`, error);
            throw error; // Re-throw the error to be caught by the run method's catch block
        } finally {
            await queueEvents.close();
        }
    }

    async close() {
        console.log('🚀 [main.js] Closing connections...');
        await this.queueManager.closeConnections();
        const driver = neo4jDriver;
        // In test environments, the driver is managed by the test suite.
        if (process.env.NODE_ENV !== 'test' && driver) {
            await driver.close();
        }
        this.dbManager.close();
        console.log('✅ [main.js] Connections closed.');
    }
}

async function main() {
    const args = process.argv.slice(2);
    const dirIndex = args.indexOf('--dir');
    const targetDirectory = dirIndex !== -1 ? args[dirIndex + 1] : process.cwd();

    try {
        const pipeline = new CognitiveTriangulationPipeline(targetDirectory);
        
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