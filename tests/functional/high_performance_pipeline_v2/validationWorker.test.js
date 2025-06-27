const { Queue } = require('bullmq');
const { v4: uuidv4 } = require('uuid');
const { DatabaseManager } = require('../../../src/utils/sqliteDb');
const QueueManager = require('../../../src/utils/queueManager');
const ValidationWorker = require('../../../src/workers/validationWorker');
const { SQLITE_DB_PATH, REDIS_CONFIG } = require('../../../src/config');

jest.mock('../../../src/utils/logger');

describe('ValidationWorker Functional Tests', () => {
    let queueManager;
    let validationWorker;
    let dbManager;
    let analysisFindingsQueue;
    let reconciliationQueue;
    let mockCacheClient;
    let runId;

    beforeAll(() => {
        queueManager = new QueueManager();
        dbManager = new DatabaseManager(SQLITE_DB_PATH);
    });

    beforeEach(async () => {
        runId = uuidv4();
        dbManager.initializeDb(); // Clears tables

        analysisFindingsQueue = new Queue(global.config.ANALYSIS_FINDINGS_QUEUE_NAME, { connection: REDIS_CONFIG });
        reconciliationQueue = new Queue(global.config.RECONCILIATION_QUEUE_NAME, { connection: REDIS_CONFIG });
        await analysisFindingsQueue.obliterate({ force: true });
        await reconciliationQueue.obliterate({ force: true });

        mockCacheClient = {
            incr: jest.fn().mockResolvedValue(1),
            hget: jest.fn().mockResolvedValue('2'), // Expected evidence count
        };

        validationWorker = new ValidationWorker(queueManager, dbManager, mockCacheClient);
    });

    afterEach(async () => {
        await validationWorker.worker.close();
        await analysisFindingsQueue.close();
        await reconciliationQueue.close();
    });

    afterAll(() => {
        dbManager.close();
        queueManager.closeConnections();
    });

    // Test Cases VW-01, VW-02, VW-03
    test('VW-01, VW-02, VW-03: Should persist evidence and trigger reconciliation on completion', async () => {
        const relationshipHash = 'hash123';
        const evidencePayload = { file: 'a.js', entity: 'myFunc' };

        // VW-01: Process first evidence
        mockCacheClient.incr.mockResolvedValueOnce(1);
        const job1 = await analysisFindingsQueue.add('finding', { runId, relationshipHash, evidencePayload });
        await expect(job1.waitUntilFinished(queueManager.connectionOptions, 5000)).resolves.not.toThrow();

        // Verify evidence was persisted
        const db = dbManager.getDb();
        let evidences = db.prepare('SELECT * FROM relationship_evidence WHERE relationship_hash = ?').all(relationshipHash);
        expect(evidences).toHaveLength(1);
        expect(JSON.parse(evidences[0].evidence_payload)).toEqual(evidencePayload);

        // Verify reconciliation not yet triggered
        let reconJobs = await reconciliationQueue.getJobs(['waiting', 'completed']);
        expect(reconJobs).toHaveLength(0);

        // VW-02 & VW-03: Process second evidence, triggering reconciliation
        mockCacheClient.incr.mockResolvedValueOnce(2);
        const job2 = await analysisFindingsQueue.add('finding', { runId, relationshipHash, evidencePayload: { ...evidencePayload, file: 'b.js' } });
        await expect(job2.waitUntilFinished(queueManager.connectionOptions, 5000)).resolves.not.toThrow();

        // Verify reconciliation IS triggered
        reconJobs = await reconciliationQueue.getJobs(['waiting', 'completed']);
        expect(reconJobs).toHaveLength(1);
        expect(reconJobs[0].data).toEqual({ runId, relationshipHash });
    });
});