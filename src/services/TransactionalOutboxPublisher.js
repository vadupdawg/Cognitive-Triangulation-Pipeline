const { DatabaseManager } = require('../utils/sqliteDb');
const QueueManager = require('../utils/queueManager');
const crypto = require('crypto');

class TransactionalOutboxPublisher {
    constructor(dbManager, queueManager) {
        this.dbManager = dbManager;
        this.queueManager = queueManager;
        this.pollingInterval = 1000; // 1 second
        this.intervalId = null;
        this.isPolling = false;
    }

    start() {
        console.log('🚀 [TransactionalOutboxPublisher] Starting publisher...');
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
        this.intervalId = setInterval(() => this.pollAndPublish(), this.pollingInterval);
    }

    async stop() {
        console.log('🛑 [TransactionalOutboxPublisher] Stopping publisher...');
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        // Wait for the current polling cycle to finish if it's running
        while (this.isPolling) {
            await new Promise(resolve => setTimeout(resolve, 50));
        }
    }

    async pollAndPublish() {
        if (this.isPolling) {
            return;
        }
        this.isPolling = true;

        const db = this.dbManager.getDb();
        const events = db.prepare("SELECT * FROM outbox WHERE status = 'PENDING' LIMIT 100").all(); // Increased limit

        if (events.length === 0) {
            this.isPolling = false;
            return;
        }

        console.log(`[TransactionalOutboxPublisher] Found ${events.length} pending events.`);

        const relationshipEvents = events.filter(e => e.event_type === 'relationship-analysis-finding');
        const otherEvents = events.filter(e => e.event_type !== 'relationship-analysis-finding');

        if (relationshipEvents.length > 0) {
            await this._handleBatchedRelationshipFindings(relationshipEvents);
        }

        for (const event of otherEvents) {
            try {
                if (event.event_type === 'file-analysis-finding') {
                    await this._handleFileAnalysisFinding(event);
                } else {
                    const queueName = this.getQueueForEvent(event.event_type);
                    if (queueName) {
                        const queue = this.queueManager.getQueue(queueName);
                        const payload = JSON.parse(event.payload);
                        await queue.add(payload.type, payload);
                        console.log(`[TransactionalOutboxPublisher] Published event ${event.id} to queue ${queueName}`);
                    } else {
                        console.log(`[TransactionalOutboxPublisher] No downstream queue for event type ${event.event_type}, marking as processed.`);
                    }
                }

                db.prepare("UPDATE outbox SET status = 'PUBLISHED' WHERE id = ?").run(event.id);
            } catch (error) {
                console.error(`[TransactionalOutboxPublisher] Failed to publish event ${event.id}:`, error);
                db.prepare("UPDATE outbox SET status = 'FAILED' WHERE id = ?").run(event.id);
            }
        }
        this.isPolling = false;
    }

    async _handleFileAnalysisFinding(event) {
        const payload = JSON.parse(event.payload);
        const { pois, filePath, runId } = payload;
        const queue = this.queueManager.getQueue('relationship-resolution-queue');

        if (pois && pois.length > 0) {
            console.log(`[TransactionalOutboxPublisher] Fanning out ${pois.length} POI jobs for file ${filePath}`);
            for (const primaryPoi of pois) {
                const jobPayload = {
                    type: 'relationship-analysis-poi',
                    source: 'TransactionalOutboxPublisher',
                    jobId: `poi-${primaryPoi.id}`,
                    runId: runId,
                    filePath: filePath,
                    primaryPoi: primaryPoi,
                    contextualPois: pois.filter(p => p.id !== primaryPoi.id)
                };
                await queue.add(jobPayload.type, jobPayload);
            }
        }
    }

    async _handleBatchedRelationshipFindings(events) {
        const db = this.dbManager.getDb();
        const queue = this.queueManager.getQueue('analysis-findings-queue');
        let allRelationships = [];
        let runId = null;

        for (const event of events) {
            const payload = JSON.parse(event.payload);
            if (!runId) runId = payload.runId;
            if (payload.relationships) {
                allRelationships.push(...payload.relationships);
            }
        }

        if (allRelationships.length > 0) {
            console.log(`[TransactionalOutboxPublisher] Creating super-batch of ${allRelationships.length} relationship findings for validation.`);
            
            const batchedPayload = allRelationships.map(relationship => {
                const hash = crypto.createHash('md5');
                hash.update(relationship.from);
                hash.update(relationship.to);
                hash.update(relationship.type);
                const relationshipHash = hash.digest('hex');

                return {
                    relationshipHash: relationshipHash,
                    evidencePayload: relationship,
                };
            });

            const updateStmt = db.prepare("UPDATE outbox SET status = 'PUBLISHED' WHERE id = ?");
            const transaction = db.transaction((eventIds) => {
                for (const id of eventIds) {
                    updateStmt.run(id);
                }
            });

            try {
                await queue.add('validate-relationships-batch', {
                    runId: runId,
                    relationships: batchedPayload
                });

                const eventIds = events.map(e => e.id);
                transaction(eventIds);
                console.log(`[TransactionalOutboxPublisher] Published super-batch and marked ${eventIds.length} events as PUBLISHED.`);

            } catch (error) {
                console.error(`[TransactionalOutboxPublisher] Failed to publish super-batch:`, error);
                const updateFailedStmt = db.prepare("UPDATE outbox SET status = 'FAILED' WHERE id = ?");
                const failedTransaction = db.transaction((eventIds) => {
                    for (const id of eventIds) {
                        updateFailedStmt.run(id);
                    }
                });
                failedTransaction(events.map(e => e.id));
            }
        }
    }

    getQueueForEvent(eventType) {
        switch (eventType) {
            case 'file-analysis-finding':
            case 'relationship-analysis-finding':
            case 'directory-analysis-finding':
                return null;
            default:
                console.warn(`[TransactionalOutboxPublisher] No queue configured for event type: ${eventType}`);
                return null;
        }
    }
}

module.exports = TransactionalOutboxPublisher;