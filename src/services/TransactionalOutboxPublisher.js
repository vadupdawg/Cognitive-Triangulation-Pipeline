const { DatabaseManager } = require('../utils/sqliteDb');
const QueueManager = require('../utils/queueManager');

class TransactionalOutboxPublisher {
    constructor(dbPath, queueManager) {
        this.dbManager = new DatabaseManager(dbPath);
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
                const queue = this.queueManager.getQueue(event.queue_name);
                const payload = JSON.parse(event.payload);
                await queue.add(payload.type, payload);

                db.prepare("UPDATE outbox SET status = 'PUBLISHED' WHERE id = ?").run(event.id);
                console.log(`[TransactionalOutboxPublisher] Published event ${event.id} to queue ${event.queue_name}`);
            } catch (error) {
                console.error(`[TransactionalOutboxPublisher] Failed to publish event ${event.id}:`, error);
                db.prepare("UPDATE outbox SET status = 'FAILED' WHERE id = ?").run(event.id);
            }
        }

        this.isPolling = false;
    }
}

module.exports = TransactionalOutboxPublisher;