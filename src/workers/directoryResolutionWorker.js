const { Worker } = require('bullmq');
const { v4: uuidv4 } = require('uuid');

class DirectoryResolutionWorker {
    constructor(queueManager, dbManager, cacheClient) {
        this.queueManager = queueManager;
        this.dbManager = dbManager; // This is the *central* DB manager
        this.cacheClient = cacheClient;
        this.worker = new Worker('directory-resolution-queue', this.process.bind(this), {
            connection: this.queueManager.connectionOptions,
            concurrency: 5
        });
    }

    async process(job) {
        const { directoryPath, runId, jobId } = job.data;
        console.log(`[DirectoryResolutionWorker] Received job ${job.id} for directory: ${directoryPath}`);

        const findingPayload = {
            type: 'directory-analysis-finding',
            source: 'DirectoryResolutionWorker',
            jobId: jobId,
            runId: runId,
            directoryPath: directoryPath,
        };

        // Write to the central outbox table.
        const db = this.dbManager.getDb();
        const stmt = db.prepare(
            'INSERT INTO outbox (id, queue_name, payload, status) VALUES (?, ?, ?, ?)'
        );
        stmt.run(uuidv4(), 'analysis-findings-queue', JSON.stringify(findingPayload), 'PENDING');

        console.log(`[DirectoryResolutionWorker] Wrote finding for ${directoryPath} to outbox.`);
    }
}

module.exports = DirectoryResolutionWorker;