const { Worker } = require('bullmq');
const ConfidenceScoringService = require('../services/cognitive_triangulation/ConfidenceScoringService');

class ReconciliationWorker {
    constructor(queueManager, dbManager) {
        this.queueManager = queueManager;
        this.dbManager = dbManager;
        this.worker = new Worker('reconciliation-queue', this.process.bind(this), {
            connection: this.queueManager.connection,
            concurrency: 5
        });
    }

    async process(job) {
        const { runId, relationshipHash } = job.data;
        console.log(`[ReconciliationWorker] Reconciling relationship ${relationshipHash}`);

        // 1. Fetch all evidence
        const db = this.dbManager.getDb();
        const evidenceRows = db.prepare(
            'SELECT evidence_payload FROM relationship_evidence WHERE run_id = ? AND relationship_hash = ?'
        ).all(runId, relationshipHash);

        const evidence = evidenceRows.map(row => JSON.parse(row.evidence_payload));

        // 2. Calculate confidence score
        const { finalScore, hasConflict } = ConfidenceScoringService.calculateFinalScore(evidence);

        // 3. Write final relationship
        if (finalScore > 0.5) { // Confidence threshold
            const finalRelationship = evidence[0]; // Assuming the base relationship data is in the first evidence
            db.prepare(
                `INSERT INTO relationships (from_node_id, to_node_id, type, resolution_level)
                 VALUES (?, ?, ?, ?)`
            ).run(
                finalRelationship.from,
                finalRelationship.to,
                finalRelationship.type,
                'file'
            );
            console.log(`[ReconciliationWorker] Validated relationship ${relationshipHash} with score ${finalScore}`);
        } else {
            console.log(`[ReconciliationWorker] Discarded relationship ${relationshipHash} with score ${finalScore}`);
        }
    }
}

module.exports = ReconciliationWorker;