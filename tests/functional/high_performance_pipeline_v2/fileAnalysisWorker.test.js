const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const QueueManager = require('../../../src/utils/queueManager');
const FileAnalysisWorker = require('../../../src/workers/fileAnalysisWorker');

jest.mock('../../../src/utils/logger');
jest.mock('../../../src/utils/LLMResponseSanitizer', () => ({
    sanitize: jest.fn(response => response),
}));

describe('FileAnalysisWorker Functional Tests', () => {
    let queueManager;
    let fileAnalysisWorker;
    let mockLlmClient;
    let mockDbManager;
    let mockDb;
    let runId;
    let testRootDir;
    let directoryAggregationQueue;

    beforeAll(async () => {
        queueManager = new QueueManager();
        // We need a real queue to spy on, but the worker will use a mock
        directoryAggregationQueue = queueManager.getQueue('directory-aggregation-queue');
        await directoryAggregationQueue.obliterate({ force: true });
    });

    beforeEach(async () => {
        runId = uuidv4();
        const uniqueId = uuidv4();
        testRootDir = path.join(os.tmpdir(), `test-run-${uniqueId}`);
        await fs.ensureDir(testRootDir);

        // Mock dependencies
        mockLlmClient = {
            query: jest.fn().mockResolvedValue(JSON.stringify({ pois: [{ name: 'myFunc', type: 'FunctionDefinition' }] }))
        };
        
        const mockStatement = { run: jest.fn() };
        mockDb = { prepare: jest.fn(() => mockStatement) };
        mockDbManager = { getDb: jest.fn(() => mockDb) };

        // Mock the queue manager for the worker to control queue interactions
        const mockQueueManager = {
            getQueue: jest.fn((queueName) => {
                if (queueName === 'directory-aggregation-queue') {
                    // Return a mock queue object that we can spy on
                    return {
                        add: jest.fn().mockResolvedValue(true),
                    };
                }
                return null;
            }),
            connectionOptions: queueManager.connectionOptions, // Use real connection options
        };

        fileAnalysisWorker = new FileAnalysisWorker(mockQueueManager, mockDbManager, null, mockLlmClient, { processOnly: true });
    });

    afterEach(async () => {
        await fs.remove(testRootDir);
        await fileAnalysisWorker.close();
    });

    afterAll(async () => {
        await queueManager.closeConnections();
    });

    test('FAW-01: Should process a file analysis job and trigger directory aggregation', async () => {
        const testFilePath = path.join(testRootDir, 'testfile.js');
        await fs.writeFile(testFilePath, 'function myFunc() {}');
        const jobId = uuidv4();

        const job = {
            id: jobId,
            data: {
                filePath: testFilePath,
                runId: runId,
                jobId: jobId
            }
        };

        await fileAnalysisWorker.process(job);

        // Verification
        expect(mockLlmClient.query).toHaveBeenCalledTimes(1);
        expect(mockDbManager.getDb).toHaveBeenCalledTimes(1);
        expect(mockDb.prepare).toHaveBeenCalledWith('INSERT INTO outbox (event_type, payload, status) VALUES (?, ?, ?)');
        
        const aggregationQueue = fileAnalysisWorker.directoryAggregationQueue;
        expect(aggregationQueue.add).toHaveBeenCalledTimes(1);
        expect(aggregationQueue.add).toHaveBeenCalledWith('aggregate-directory', {
            directoryPath: testRootDir,
            runId: runId,
            fileJobId: jobId,
        });
    });

    test('FAW-02: Should fail gracefully if file does not exist', async () => {
        const nonExistentFilePath = path.join(testRootDir, 'not-found.js');
        const job = {
            id: uuidv4(),
            data: { filePath: nonExistentFilePath, runId }
        };

        await expect(fileAnalysisWorker.process(job)).rejects.toThrow('ENOENT: no such file or directory');
    });

    test('FAW-03: Should fail gracefully for malformed job data (missing filePath)', async () => {
        const job = {
            id: uuidv4(),
            data: { runId } // Missing filePath
        };

        await expect(fileAnalysisWorker.process(job)).rejects.toThrow("Cannot destructure property 'filePath' of 'job.data' as it is undefined.");
    });
});