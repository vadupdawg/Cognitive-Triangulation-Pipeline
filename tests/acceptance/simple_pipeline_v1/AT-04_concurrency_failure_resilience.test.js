const MockLLMApi = require('../../../mocks/mockLLMApi');
const PipelineController = require('../../../src/controllers/pipelineController');
const { getInMemoryDb, getInMemoryQueueManager } = require('../../../src/utils/testUtils');
const MockFileAnalysisService = require('../../../mocks/mockFileAnalysisService');
const RelationshipResolutionWorker = require('../../../src/workers/relationshipResolutionWorker');

describe('Acceptance Test-- AT-04-- Concurrency Failure Resilience', () => {
    let mockLLMApi;
    let pipelineController;
    let db, queueManager;
    let mockAnalysisService;
    let resolutionWorker;

    const CONCURRENCY_LIMIT = 2;
    const RESOLUTION_QUEUE_NAME = 'relationship-resolution-queue';

    beforeAll(() => {
        // For this test, the mock API will fail the first request it receives.
        mockLLMApi = new MockLLMApi({
            port: 8090,
            concurrencyLimit: CONCURRENCY_LIMIT,
            responseDelay: 50,
            failFirstRequest: true // Special configuration for this test
        });
        mockLLMApi.start();
    });

    afterAll(() => {
        mockLLMApi.stop();
    });

    beforeEach(async () => {
        db = getInMemoryDb();
        queueManager = getInMemoryQueueManager();
        mockLLMApi.resetCounters();

        const mockResolver = {
            resolve: jest.fn(async (poi) => ({ source: poi.name, target: 'resolved', type: 'RESOLVED' }))
        };

        resolutionWorker = new RelationshipResolutionWorker(queueManager, mockResolver, db);
        await resolutionWorker.start();
    });

    afterEach(async () => {
        await resolutionWorker.stop();
    });

    test('The system must not deadlock if an LLM request fails under concurrency', async () => {
        // --- ARRANGE ---
        // We will trigger 3 requests. With a concurrency of 2, the first two will go out.
        // One will fail, one will succeed. The semaphore from the failed one should be released,
        // allowing the third request to be processed.
        const projectFiles = {
            'src/fileA.js': { pois: [{ name: 'poiA' }] }, // This one will fail
            'src/fileB.js': { pois: [{ name: 'poiB' }] }, // This one will succeed
            'src/fileC.js': { pois: [{ name: 'poiC' }] }  // This one should also succeed
        };
        const filePaths = Object.keys(projectFiles);

        mockAnalysisService = new MockFileAnalysisService({
            poisByFile: projectFiles
        });
        
        const config = { llmApiUrl: 'http://localhost:8090' };
        pipelineController = new PipelineController(config, db, queueManager, mockAnalysisService);

        // Suppress console.error for the expected failure
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        // --- ACT ---
        // We don't wait for all promises here, because one is expected to reject.
        const analysisPromises = filePaths.map(path => 
            pipelineController.startAnalysis(path).catch(e => e) // Catch expected error
        );
        await Promise.all(analysisPromises);
        
        // Let the worker process the jobs for the successful analyses
        await new Promise(resolve => setTimeout(resolve, 200));
        
        consoleErrorSpy.mockRestore();

        // --- ASSERT ---

        // AI-Verifiable Criterion 1-- The two successful analyses completed.
        const successfulRelationships = await db.getResolvedRelationshipCount();
        expect(successfulRelationships).toBe(2); // Only poiB and poiC should be resolved.

        // AI-Verifiable Criterion 2-- The mock LLM API was invoked for all 3 requests.
        const totalInvocations = mockLLMApi.getTotalRequests();
        expect(totalInvocations).toBe(3);

        // AI-Verifiable Criterion 3-- The test completes, proving no deadlock.
        // Jest's default timeout will fail the test if it hangs, which is the implicit assertion here.
        // We can also check that the successful jobs were created.
        const queue = queueManager.getQueue(RESOLUTION_QUEUE_NAME);
        const jobCount = await queue.getJobCount();
        expect(jobCount).toBe(2); // Only two jobs for the successful analyses.
    }, 10000); // Set a timeout to catch deadlocks
});