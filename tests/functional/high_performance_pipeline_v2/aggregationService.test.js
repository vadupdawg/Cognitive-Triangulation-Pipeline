const Redis = require('ioredis');
const QueueManager = require('../../../src/utils/queueManager');
const AggregationService = require('../../../src/services/AggregationService');
const { FILE_ANALYSIS_COMPLETED_QUEUE_NAME, DIRECTORY_SUMMARY_QUEUE_NAME, REDIS_CONFIG } = require('../../../src/config');

describe('AggregationService Functional Tests', () => {
    let queueManager;
    let aggregationService;
    let redisClient;

    beforeAll(async () => {
        queueManager = new QueueManager();
        redisClient = new Redis(REDIS_CONFIG);
    });

    beforeEach(async () => {
        aggregationService = new AggregationService();
        await queueManager.clearAllQueues();
        await redisClient.flushall();
    });

    afterEach(async () => {
        await aggregationService.close();
    });

    afterAll(async () => {
        await queueManager.closeConnections();
        await redisClient.quit();
    });

    // Test Case AS-01 & AS-03 & AS-04
    test('AS-01, AS-03, AS-04: Should correctly update state, publish summary on completion, and clean up state', async () => {
        const directoryPath = '/tmp/test-dir-1';
        const stateKey = `directory-progress:${directoryPath}`;
        const totalFiles = 2;

        const completedQueue = queueManager.getQueue(FILE_ANALYSIS_COMPLETED_QUEUE_NAME);

        // First event
        await completedQueue.add('file-analysis-completed', {
            filePath: `${directoryPath}/file1.txt`,
            directoryPath: directoryPath,
            totalFilesInDir: totalFiles,
            fileId: 'file1'
        });

        // Let the service process the first event
        await new Promise(resolve => setTimeout(resolve, 200));

        // AS-01 Verification (Partial)
        let state = await redisClient.hgetall(stateKey);
        expect(state.processedFiles).toBe('1');
        expect(state.totalFiles).toBe(String(totalFiles));

        const summaryQueue = queueManager.getQueue(DIRECTORY_SUMMARY_QUEUE_NAME);
        let summaryJobs = await summaryQueue.getJobs(['waiting']);
        expect(summaryJobs).toHaveLength(0);

        // Second event to complete the directory
        await completedQueue.add('file-analysis-completed', {
            filePath: `${directoryPath}/file2.txt`,
            directoryPath: directoryPath,
            totalFilesInDir: totalFiles,
            fileId: 'file2'
        });

        // Let the service process the second event
        await new Promise(resolve => setTimeout(resolve, 200));

        // AS-03 Verification
        summaryJobs = await summaryQueue.getJobs(['waiting', 'completed']);
        expect(summaryJobs).toHaveLength(1);
        const summaryJob = summaryJobs[0];
        expect(summaryJob.data.directoryPath).toBe(directoryPath);
        expect(summaryJob.data).toHaveProperty('summaryPrompt');

        // AS-04 Verification
        const finalState = await redisClient.exists(stateKey);
        expect(finalState).toBe(0);
    });

    // Test Case AS-02
    test('AS-02: Should handle idempotent event handling gracefully', async () => {
        const directoryPath = '/tmp/test-dir-2';
        const stateKey = `directory-progress:${directoryPath}`;
        const totalFiles = 2;

        const eventPayload = {
            filePath: `${directoryPath}/file1.txt`,
            directoryPath: directoryPath,
            totalFilesInDir: totalFiles,
            fileId: 'file1-duplicate'
        };

        const completedQueue = queueManager.getQueue(FILE_ANALYSIS_COMPLETED_QUEUE_NAME);

        // Publish the same event twice
        await completedQueue.add('file-analysis-completed', eventPayload);
        await new Promise(resolve => setTimeout(resolve, 100));
        await completedQueue.add('file-analysis-completed', eventPayload);
        await new Promise(resolve => setTimeout(resolve, 100));

        const state = await redisClient.hgetall(stateKey);
        expect(state.processedFiles).toBe('1');
    });
});