const MockLLMApi = require('../../../mocks/mockLLMApi');
const PipelineController = require('../../../src/controllers/pipelineController');
const { getInMemoryDb, getInMemoryQueueManager } = require('../../../src/utils/testUtils');
const MockFileAnalysisService = require('../../../mocks/mockFileAnalysisService');
const RelationshipResolutionWorker = require('../../../src/workers/relationshipResolutionWorker');

describe('Acceptance Test-- AT-03-- Full Pipeline Integrity Under Load', () => {
    let mockLLMApi;
    let pipelineController;
    let db, queueManager;
    let mockAnalysisService;
    let resolutionWorker;

    const CONCURRENCY_LIMIT = 2;
    const RESOLUTION_QUEUE_NAME = 'relationship-resolution-queue';

    beforeAll(() => {
        mockLLMApi = new MockLLMApi({
            port: 8089,
            concurrencyLimit: CONCURRENCY_LIMIT,
            responseDelay: 50
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
        
        // Mock the relationship resolver to produce predictable relationships
        const mockResolver = {
            resolve: jest.fn(async (poi) => {
                if (poi.name === 'functionA' && poi.calls === 'functionB') {
                    return { source: 'functionA', target: 'functionB', type: 'CALLS' };
                }
                if (poi.name === 'classC' && poi.inherits === 'classD') {
                    return { source: 'classC', target: 'classD', type: 'INHERITS' };
                }
                return null; // Return null for POIs we don't care about in this test
            })
        };
        
        resolutionWorker = new RelationshipResolutionWorker(queueManager, mockResolver, db);
        await resolutionWorker.start();
    });

    afterEach(async () => {
        await resolutionWorker.stop();
    });

    test('The pipeline must create specific, correct relationships rather than just a total count', async () => {
        // --- ARRANGE ---
        const projectFiles = {
            'src/fileA.js': { pois: [{ name: 'functionA', calls: 'functionB' }, { name: 'other', calls: 'another' }] },
            'src/fileB.js': { pois: [{ name: 'classC', inherits: 'classD' }] },
            'src/fileC.js': { pois: [{ name: 'ignored', calls: 'ignored' }] }
        };
        const filePaths = Object.keys(projectFiles);

        mockAnalysisService = new MockFileAnalysisService({
            poisByFile: projectFiles
        });
        
        const config = { llmApiUrl: 'http://localhost:8089' };
        pipelineController = new PipelineController(config, db, queueManager, mockAnalysisService);

        // --- ACT ---
        const analysisPromises = filePaths.map(path => pipelineController.startAnalysis(path));
        await Promise.all(analysisPromises);
        
        // Let the worker process the jobs
        await new Promise(resolve => setTimeout(resolve, 200));

        // --- ASSERT ---
        
        // AI-Verifiable Criterion 1-- The relationship queue received exactly one job per file.
        const queue = queueManager.getQueue(RESOLUTION_QUEUE_NAME);
        const jobCount = await queue.getJobCount();
        expect(jobCount).toBe(filePaths.length); // 3 files -- 3 jobs

        // AI-Verifiable Criterion 2-- The mock LLM API never exceeded its concurrency limit.
        const peakConcurrency = mockLLMApi.getPeakConcurrency();
        expect(peakConcurrency).toBeLessThanOrEqual(CONCURRENCY_LIMIT);

        // AI-Verifiable Criterion 3-- The final database contains specific, known relationships.
        // This is the improved, non-brittle check.
        const callsRelationshipExists = await db.hasRelationship('functionA', 'CALLS', 'functionB');
        expect(callsRelationshipExists).toBe(true);
        
        const inheritsRelationshipExists = await db.hasRelationship('classC', 'INHERITS', 'classD');
        expect(inheritsRelationshipExists).toBe(true);

        // Also check that spurious relationships were not created
        const spuriousRelationshipExists = await db.hasRelationship('ignored', 'CALLS', 'ignored');
        expect(spuriousRelationshipExists).toBe(false);
    });
});