const { DatabaseManager } = require('../../../src/utils/sqliteDb');
const QueueManager = require('../../../src/utils/queueManager');
const ValidationWorker = require('../../../src/workers/validationWorker');
const { 
    FILE_ANALYSIS_COMPLETED_QUEUE_NAME, 
    GLOBAL_RELATIONSHIP_CANDIDATE_QUEUE_NAME,
    RELATIONSHIP_VALIDATED_QUEUE_NAME,
    SQLITE_DB_PATH
} = require('../../../src/config');

describe('ValidationWorker Functional Tests', () => {
    let queueManager;
    let validationWorker;
    let dbManager;

    beforeAll(async () => {
        queueManager = new QueueManager();
        dbManager = new DatabaseManager(SQLITE_DB_PATH);
    });

    beforeEach(async () => {
        validationWorker = new ValidationWorker();
        dbManager.initializeDb(); // Clears tables
        await queueManager.clearAllQueues();
    });

    afterEach(async () => {
        await validationWorker.close();
    });

    afterAll(async () => {
        await queueManager.closeConnections();
        dbManager.close();
    });

    // Test Cases VW-01, VW-02, VW-03, VW-04
    test('VW-01 to VW-04: Full validation lifecycle', async () => {
        const relationshipId = 'test-relationship-1';
        const candidateQueue = queueManager.getQueue(GLOBAL_RELATIONSHIP_CANDIDATE_QUEUE_NAME);
        const evidenceQueue = queueManager.getQueue(FILE_ANALYSIS_COMPLETED_QUEUE_NAME);
        const validatedQueue = queueManager.getQueue(RELATIONSHIP_VALIDATED_QUEUE_NAME);

        // Publish candidate to set expectations
        await candidateQueue.add('global-relationship-candidate', {
            relationship_id: relationshipId,
            expected_evidence_count: 2
        });
        await validationWorker.process(await candidateQueue.getNextJob());

        // VW-01: Persist first evidence and create state
        const evidence1 = { relationship_id: relationshipId, confidence_score: 0.9, fileId: 'file1' };
        await evidenceQueue.add('file-analysis-completed', evidence1);
        await validationWorker.process(await evidenceQueue.getNextJob());

        let state = await dbManager.getValidationState(relationshipId);
        expect(state.received_evidence_count).toBe(1);
        expect(state.expected_evidence_count).toBe(2);
        let evidences = await dbManager.getEvidences(relationshipId);
        expect(evidences).toHaveLength(1);

        // VW-02: Atomically update state with second evidence
        const evidence2 = { relationship_id: relationshipId, confidence_score: 0.95, fileId: 'file2' };
        await evidenceQueue.add('file-analysis-completed', evidence2);
        await validationWorker.process(await evidenceQueue.getNextJob());
        
        state = await dbManager.getValidationState(relationshipId);
        expect(state.received_evidence_count).toBe(2);

        // VW-03: Publish validated event
        await new Promise(resolve => setTimeout(resolve, 200)); // allow for async validation
        const validatedJobs = await validatedQueue.getJobs(['completed']);
        expect(validatedJobs).toHaveLength(1);
        expect(validatedJobs[0].data.relationship_id).toBe(relationshipId);
        expect(validatedJobs[0].data.final_confidence_score).toBeGreaterThan(0);

        // VW-04: Cleanup
        state = await dbManager.getValidationState(relationshipId);
        expect(state).toBeUndefined();
        evidences = await dbManager.getEvidences(relationshipId);
        expect(evidences).toHaveLength(0);
    });
});