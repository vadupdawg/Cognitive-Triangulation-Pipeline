const { DatabaseManager } = require('../utils/sqliteDb');
const QueueManager = require('../utils/queueManager');

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
        this.intervalId = setInterval(() => this.pollAndPublish(), this.pollingInterval);
    }

    stop() {
        console.log('🛑 [TransactionalOutboxPublisher] Stopping publisher...');
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
    }

    async pollAndPublish() {
        if (this.isPolling) {
            return;
        }
        this.isPolling = true;

        const db = this.dbManager.getDb();
        const events = db.prepare("SELECT * FROM outbox WHERE status = 'PENDING' LIMIT 10").all();

        if (events.length === 0) {
            this.isPolling = false;
            return;
        }

        console.log(`[TransactionalOutboxPublisher] Found ${events.length} pending events.`);

        for (const event of events) {
            try {
                const queueName = this.getQueueForEvent(event.event_type);
                if (queueName) {
                    const queue = this.queueManager.getQueue(queueName);
                    const payload = JSON.parse(event.payload);
                    await queue.add(payload.type, payload);
                    console.log(`[TransactionalOutboxPublisher] Published event ${event.id} to queue ${queueName}`);
                } else {
                    console.log(`[TransactionalOutboxPublisher] No downstream queue for event type ${event.event_type}, marking as processed.`);
                }

                db.prepare("UPDATE outbox SET status = 'PUBLISHED' WHERE id = ?").run(event.id);
            } catch (error) {
                console.error(`[TransactionalOutboxPublisher] Failed to publish event ${event.id}:`, error);
                db.prepare("UPDATE outbox SET status = 'FAILED' WHERE id = ?").run(event.id);
            }
        }
        this.isPolling = false;
    }

    getQueueForEvent(eventType) {
        switch (eventType) {
            case 'file-analysis-finding':
                return 'relationship-resolution-queue';
            // Directory summaries are used by the GlobalResolutionWorker, which is triggered
            // by the completion of all directory analysis, not a direct queue.
            case 'directory-analysis-finding':
                return null;
            // Relationship findings are consumed by the validation/reconciliation workers,
            // but for now, let's assume they are the end of the line for this test.
            case 'relationship-analysis-finding':
                return null;
            default:
                console.warn(`[TransactionalOutboxPublisher] No queue configured for event type: ${eventType}`);
                return null;
        }
    }
}

module.exports = TransactionalOutboxPublisher;