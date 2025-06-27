const MockLLMApi = require('../../../mocks/mockLLMApi');
const PipelineController = require('../../../src/controllers/pipelineController');
const { getInMemoryDb, getInMemoryQueueManager } = require('../../../src/utils/testUtils');

describe('Acceptance Test-- AT-01-- LLM Client High-Concurrency Throughput', () => {
    let mockLLMApi;
    let pipelineController;
    let db, queueManager;

    const CONCURRENCY_LIMIT = 4;

    beforeAll(() => {
        // Start the mock LLM API server
        mockLLMApi = new MockLLMApi({
            port: 8088,
            concurrencyLimit: CONCURRENCY_LIMIT,
            responseDelay: 50 // ms
        });
        mockLLMApi.start();
    });

    afterAll(() => {
        mockLLMApi.stop();
    });

    beforeEach(async () => {
        db = getInMemoryDb();
        queueManager = getInMemoryQueueManager();
        // Point the pipeline to the mock LLM API
        const config = { llmApiUrl: 'http://localhost:8088' };
        pipelineController = new PipelineController(config, db, queueManager);
        
        mockLLMApi.resetCounters();
    });

    test('The system must process multiple requests concurrently without exceeding the configured limit', async () => {
        // --- ARRANGE ---
        const numberOfRequests = 10;
        const filePaths = Array.from({ length: numberOfRequests }, (_, i) => `src/file${i + 1}.js`);

        // --- ACT ---
        // Trigger all analysis requests in parallel
        const analysisPromises = filePaths.map(path => pipelineController.startAnalysis(path));
        await Promise.all(analysisPromises);

        // --- ASSERT ---
        
        // AI-Verifiable Completion Criterion 1-- Peak concurrency at the mock API never exceeded the limit.
        const peakConcurrency = mockLLMApi.getPeakConcurrency();
        console.log(`Measured Peak Concurrency-- ${peakConcurrency}`);
        expect(peakConcurrency).toBeLessThanOrEqual(CONCURRENCY_LIMIT);
        expect(peakConcurrency).toBeGreaterThan(1); // Ensure it actually ran in parallel

        // AI-Verifiable Completion Criterion 2-- All 10 requests were successfully and completely processed.
        const processedCount = await db.getCompletedAnalysisCount();
        expect(processedCount).toBe(numberOfRequests);
    });
});