const { Worker } = require('bullmq');

class ValidationWorker {
    constructor(queueManager, dbManager, cacheClient) {
        this.queueManager = queueManager;
        this.dbManager = dbManager;
        this.cacheClient = cacheClient;
        this.reconciliationQueue = this.queueManager.getQueue('reconciliation-queue');
        this.worker = new Worker('analysis-findings-queue', this.process.bind(this), {
            connection: this.queueManager.connectionOptions,
            concurrency: 5
        });
    }

    async process(job) {
        const { runId, relationshipHash, evidencePayload } = job.data;
        console.log(`[ValidationWorker] Processing finding for relationship ${relationshipHash}`);

        // 1. Persist evidence
        const db = this.dbManager.getDb();
        db.prepare(
            'INSERT INTO relationship_evidence (run_id, relationship_hash, evidence_payload) VALUES (?, ?, ?)'
        ).run(runId, relationshipHash, JSON.stringify(evidencePayload));

        // 2. Atomically increment counter
        const evidenceCountKey = `evidence_count:${runId}:${relationshipHash}`;
        const currentCount = await this.cacheClient.incr(evidenceCountKey);

        // 3. Check if reconciliation is needed
        const expectedCount = await this.cacheClient.hget(`run:${runId}:rel_map`, relationshipHash);

        if (currentCount >= parseInt(expectedCount, 10)) {
            console.log(`[ValidationWorker] Evidence count for ${relationshipHash} reached. Enqueuing for reconciliation.`);
            await this.reconciliationQueue.add('reconcile-relationship', {
                runId,
                relationshipHash,
            });
        }
    }
}

module.exports = ValidationWorker;