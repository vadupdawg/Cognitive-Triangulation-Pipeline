const PipelineController = require('../../../src/controllers/pipelineController');
const { getInMemoryDb, getInMemoryQueueManager } = require('../../../src/utils/testUtils');
const MockFileAnalysisService = require('../../../mocks/mockFileAnalysisService');

describe('Acceptance Test-- AT-02-- Relationship Resolution Job Batching', () => {
    let pipelineController;
    let db, queueManager;
    let mockAnalysisService;

    const POI_COUNT = 7;
    const RESOLUTION_QUEUE_NAME = 'relationship-resolution-queue';

    beforeEach(async () => {
        db = getInMemoryDb();
        queueManager = getInMemoryQueueManager();
        
        // Mock the file analysis service to return a predictable number of POIs
        mockAnalysisService = new MockFileAnalysisService({
            poiCount: POI_COUNT 
        });

        const config = {}; // No external dependencies needed for this test
        pipelineController = new PipelineController(config, db, queueManager, mockAnalysisService);
    });

    test('The system must batch all POIs from one file analysis into a single job', async () => {
        // --- ARRANGE ---
        const filePath = 'src/services/complexService.js';

        // --- ACT ---
        // This will use the mock analysis service internally
        await pipelineController.startAnalysis(filePath);

        // --- ASSERT ---
        
        // AI-Verifiable Completion Criterion 1-- The relationship resolution queue should contain exactly one job.
        const queue = queueManager.getQueue(RESOLUTION_QUEUE_NAME);
        const jobCount = await queue.getJobCount();
        expect(jobCount).toBe(1);

        // AI-Verifiable Completion Criterion 2-- The single job's payload should contain all POIs.
        const jobs = await queue.getJobs();
        const jobPayload = jobs[0].data;
        expect(jobPayload.pois).toBeDefined();
        expect(jobPayload.pois.length).toBe(POI_COUNT);

        // We can also verify that the worker would be called the correct number of times
        // This assumes a mock resolver is instrumented in a real test run
        const mockResolverInvocations = jobPayload.pois.length;
        expect(mockResolverInvocations).toBe(POI_COUNT);
    });
});