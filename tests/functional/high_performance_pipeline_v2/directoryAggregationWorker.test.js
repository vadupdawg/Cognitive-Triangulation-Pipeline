const { v4: uuidv4 } = require('uuid');
const DirectoryAggregationWorker = require('../../../src/workers/directoryAggregationWorker');
const QueueManager = require('../../../src/utils/queueManager');

jest.mock('../../../src/utils/logger');

describe('DirectoryAggregationWorker Functional Tests', () => {
    let queueManager;
    let directoryAggregationWorker;
    let mockCacheClient;
    let mockPipeline;
    let mockDirectoryResolutionQueue;
    let runId;

    beforeEach(() => {
        runId = uuidv4();
        
        // Mock Redis pipeline
        mockPipeline = {
            sadd: jest.fn().mockReturnThis(),
            scard: jest.fn().mockReturnThis(),
            exec: jest.fn(),
        };

        // Mock CacheClient
        mockCacheClient = {
            pipeline: jest.fn(() => mockPipeline),
        };

        // Mock the directory resolution queue
        mockDirectoryResolutionQueue = {
            add: jest.fn().mockResolvedValue(true),
        };

        // Mock QueueManager
        queueManager = {
            getQueue: jest.fn((queueName) => {
                if (queueName === 'directory-resolution-queue') {
                    return mockDirectoryResolutionQueue;
                }
                return null;
            }),
        };

        directoryAggregationWorker = new DirectoryAggregationWorker(queueManager, mockCacheClient, { processOnly: true });
    });

    afterEach(async () => {
        await directoryAggregationWorker.close();
        jest.clearAllMocks();
    });

    test('AS-01: Should not trigger directory resolution if not all files are processed', async () => {
        const directoryPath = '/tmp/test-dir';
        const fileJobId = uuidv4();

        // Simulate that total files are 2, but only 1 is processed
        mockPipeline.exec.mockResolvedValue([[null, 1], [null, 2], [null, 1]]);

        const job = {
            data: { directoryPath, runId, fileJobId }
        };

        await directoryAggregationWorker.process(job);

        expect(mockCacheClient.pipeline).toHaveBeenCalledTimes(1);
        expect(mockPipeline.sadd).toHaveBeenCalledWith(`run:${runId}:dir:${directoryPath}:processed`, fileJobId);
        expect(mockPipeline.scard).toHaveBeenCalledWith(`run:${runId}:dir:${directoryPath}:files`);
        expect(mockPipeline.scard).toHaveBeenCalledWith(`run:${runId}:dir:${directoryPath}:processed`);
        expect(mockPipeline.exec).toHaveBeenCalledTimes(1);
        expect(mockDirectoryResolutionQueue.add).not.toHaveBeenCalled();
    });

    test('AS-03: Should trigger directory resolution when all files are processed', async () => {
        const directoryPath = '/tmp/test-dir';
        const fileJobId = uuidv4();

        // Simulate that total files are 2, and this is the second file processed
        mockPipeline.exec.mockResolvedValue([[null, 1], [null, 2], [null, 2]]);

        const job = {
            data: { directoryPath, runId, fileJobId }
        };

        await directoryAggregationWorker.process(job);

        expect(mockDirectoryResolutionQueue.add).toHaveBeenCalledTimes(1);
        expect(mockDirectoryResolutionQueue.add).toHaveBeenCalledWith('analyze-directory', {
            directoryPath,
            runId,
        });
    });

    test('DAW-04: Should handle Redis pipeline error gracefully', async () => {
        const directoryPath = '/tmp/test-dir';
        const fileJobId = uuidv4();
        const errorMessage = 'Redis error';

        mockPipeline.exec.mockRejectedValue(new Error(errorMessage));

        const job = {
            data: { directoryPath, runId, fileJobId }
        };

        await expect(directoryAggregationWorker.process(job)).rejects.toThrow(errorMessage);
        expect(mockDirectoryResolutionQueue.add).not.toHaveBeenCalled();
    });
});