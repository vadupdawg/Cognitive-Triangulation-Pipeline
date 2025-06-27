const { Worker } = require('bullmq');
const { v4: uuidv4 } = require('uuid');

class FileAnalysisWorker {
    constructor(queueManager, dbManager, cacheClient) {
        this.queueManager = queueManager;
        this.dbManager = dbManager; // This is the *central* DB manager
        this.cacheClient = cacheClient;
        this.worker = new Worker('file-analysis-queue', this.process.bind(this), {
            connection: this.queueManager.connectionOptions,
            concurrency: 5
        });
    }

    async process(job) {
        const { filePath, runId, jobId } = job.data;
        console.log(`[FileAnalysisWorker] Received job ${job.id} for file: ${filePath}`);

        // This worker's responsibility is now to write the finding to the outbox.
        // The actual analysis will be done by another worker that consumes the event.
        // This is a key part of the new architecture.

        const findingPayload = {
            type: 'file-analysis-finding',
            source: 'FileAnalysisWorker',
            jobId: jobId,
            runId: runId,
            filePath: filePath,
            // In a real scenario, we might do some pre-processing here.
            // For now, we just pass the file path along.
        };

        // Write to the central outbox table. In a real distributed system, this would
        // be a local outbox. For this simulation, we use the central DB.
        const db = this.dbManager.getDb();
        const stmt = db.prepare(
            'INSERT INTO outbox (id, queue_name, payload, status) VALUES (?, ?, ?, ?)'
        );
        stmt.run(uuidv4(), 'analysis-findings-queue', JSON.stringify(findingPayload), 'PENDING');

        console.log(`[FileAnalysisWorker] Wrote finding for ${filePath} to outbox.`);
    }
}

module.exports = FileAnalysisWorker;