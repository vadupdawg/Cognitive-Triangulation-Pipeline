const Redis = require('ioredis');
const QueueManager = require('../../../src/utils/queueManager');
const GlobalResolutionWorker = require('../../../src/workers/globalResolutionWorker');
const { DIRECTORY_SUMMARY_QUEUE_NAME, GLOBAL_RELATIONSHIP_CANDIDATE_QUEUE_NAME, REDIS_CONFIG } = require('../../../src/config');

describe('GlobalResolutionWorker Functional Tests', () => {
    let queueManager;
    let globalResolutionWorker;
    let redisClient;

    beforeAll(async () => {
        queueManager = new QueueManager();
        redisClient = new Redis(REDIS_CONFIG);
    });

    beforeEach(async () => {
        const mockLlmClient = { query: jest.fn().mockResolvedValue(JSON.stringify({ relationships: [{ from: '/dir/A', to: '/dir/B', type: 'USES' }] })) };
        const mockDbClient = { execute: jest.fn().mockResolvedValue(), beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn() };
        globalResolutionWorker = new GlobalResolutionWorker(queueManager, mockLlmClient, mockDbClient);
        await queueManager.clearAllQueues();
        await redisClient.flushall();
    });

    afterEach(async () => {
        await globalResolutionWorker.close();
    });

    afterAll(async () => {
        await queueManager.closeConnections();
        await redisClient.quit();
    });

    // Test Case GRW-01 & GRW-02
    test('GRW-01 & GRW-02: Should cache summaries and publish relationship candidates', async () => {
        const summaryQueue = queueManager.getQueue(DIRECTORY_SUMMARY_QUEUE_NAME);
        const candidateQueue = queueManager.getQueue(GLOBAL_RELATIONSHIP_CANDIDATE_QUEUE_NAME);

        const summaryA = {
            directoryPath: '/dir/A',
            summaryPrompt: '... mentions commonFunc ...',
            files: [{ filePath: '/dir/A/file1.js', entities: ['commonFunc'] }]
        };
        const summaryB = {
            directoryPath: '/dir/B',
            summaryPrompt: '... also mentions commonFunc ...',
            files: [{ filePath: '/dir/B/file2.js', entities: ['commonFunc'] }]
        };

        const jobA = await summaryQueue.add('directory-summary-created', summaryA);
        await globalResolutionWorker.processJob(jobA);

        // GRW-01 Verification
        const cacheContent = await redisClient.get(`summary-cache:${summaryA.directoryPath}`);
        expect(cacheContent).toBe(JSON.stringify(summaryA));

        const jobB = await summaryQueue.add('directory-summary-created', summaryB);
        await globalResolutionWorker.processJob(jobB);

        // GRW-02 Verification
        const candidateJobs = await candidateQueue.getJobs(['waiting', 'completed']);
        expect(candidateJobs).toHaveLength(1);
        const candidateData = candidateJobs[0].data;
        expect(candidateData).toHaveProperty('relationship_id');
        expect(candidateData.linking_element).toBe('commonFunc');
        expect(candidateData.source_node.id).toBe('/dir/A/file1.js');
        expect(candidateData.target_node.id).toBe('/dir/B/file2.js');
    });

    // Test Case GRW-03
    test('GRW-03: Should generate deterministic relationship_ids', async () => {
        const summaryQueue = queueManager.getQueue(DIRECTORY_SUMMARY_QUEUE_NAME);
        const candidateQueue = queueManager.getQueue(GLOBAL_RELATIONSHIP_CANDIDATE_QUEUE_NAME);

        const summaryA = {
            directoryPath: '/dir/A',
            files: [{ filePath: '/dir/A/file1.js', entities: ['commonFunc'] }]
        };
        const summaryB = {
            directoryPath: '/dir/B',
            files: [{ filePath: '/dir/B/file2.js', entities: ['commonFunc'] }]
        };

        // Run 1: A then B
        await summaryQueue.add('directory-summary-created', summaryA);
        await summaryQueue.add('directory-summary-created', summaryB);
        await globalResolutionWorker.process(await summaryQueue.getNextJob());
        await globalResolutionWorker.process(await summaryQueue.getNextJob());
        let candidateJobs1 = await candidateQueue.getJobs(['completed']);
        const relationshipId1 = candidateJobs1[0].data.relationship_id;

        // Reset
        await queueManager.clearAllQueues();
        await redisClient.flushall();
        globalResolutionWorker.stateCache.clear();

        // Run 2: B then A
        await summaryQueue.add('directory-summary-created', summaryB);
        await summaryQueue.add('directory-summary-created', summaryA);
        await globalResolutionWorker.process(await summaryQueue.getNextJob());
        await globalResolutionWorker.process(await summaryQueue.getNextJob());
        let candidateJobs2 = await candidateQueue.getJobs(['completed']);
        const relationshipId2 = candidateJobs2[0].data.relationship_id;

        expect(relationshipId1).toBe(relationshipId2);
    });
});