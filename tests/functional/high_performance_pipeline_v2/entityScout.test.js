const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const EntityScout = require('../../../src/agents/EntityScout');
const QueueManager = require('../../../src/utils/queueManager');
const { REDIS_CONFIG } = require('../../../src/config');
const { Queue } = require('bullmq');

jest.mock('../../../src/utils/logger');

describe('EntityScout Functional Tests', () => {
    let testRootDir;
    let queueManager;
    let fileAnalysisQueue;
    let mockCacheClient;
    let runId;

    beforeAll(() => {
        queueManager = new QueueManager();
    });

    beforeEach(async () => {
        runId = uuidv4();
        const uniqueId = uuidv4();
        testRootDir = path.join(os.tmpdir(), `test-run-${uniqueId}`);
        await fs.ensureDir(testRootDir);
        
        fileAnalysisQueue = new Queue(global.config.FILE_ANALYSIS_QUEUE_NAME, { connection: REDIS_CONFIG });
        await fileAnalysisQueue.obliterate({ force: true });

        mockCacheClient = {
            set: jest.fn().mockResolvedValue('OK'),
            pipeline: jest.fn(() => ({
                sadd: jest.fn(),
                exec: jest.fn().mockResolvedValue([]),
            })),
        };
    });

    afterEach(async () => {
        await fs.remove(testRootDir);
        await fileAnalysisQueue.close();
    });

    afterAll(async () => {
        await queueManager.closeConnections();
    });

    // Test Cases ES-01, ES-02, ES-04
    test('ES-01, ES-02, ES-04: Should enqueue file analysis jobs for all valid files and ignore empty directories', async () => {
        // Setup: Create a directory structure with files and an empty directory
        await fs.ensureDir(path.join(testRootDir, 'dir-A'));
        await fs.writeFile(path.join(testRootDir, 'dir-A', 'file1.js'), 'const a = 1;');
        await fs.writeFile(path.join(testRootDir, 'dir-A', 'file2.js'), 'const b = 2;');
        await fs.ensureDir(path.join(testRootDir, 'dir-B'));
        await fs.writeFile(path.join(testRootDir, 'dir-B', 'file3.js'), 'const c = 3;');
        await fs.ensureDir(path.join(testRootDir, 'dir-C-empty')); // ES-04

        const entityScout = new EntityScout(queueManager, mockCacheClient, testRootDir, runId);
        await entityScout.run();

        const jobs = await fileAnalysisQueue.getJobs(['waiting', 'completed']);
        
        // ES-01 & ES-02 Verification: Check that the correct number of jobs were created.
        expect(jobs).toHaveLength(3);
        
        const jobNames = jobs.map(j => j.name);
        expect(jobNames.every(name => name === 'analyze-file')).toBe(true);
    });

    // Test Case ES-03
    test('ES-03: Enqueued jobs should have correct and complete payloads', async () => {
        const dirAPath = path.join(testRootDir, 'dir-A');
        const file1Path = path.join(dirAPath, 'file1.js');
        await fs.ensureDir(dirAPath);
        await fs.writeFile(file1Path, 'const a = 1;');

        const entityScout = new EntityScout(queueManager, mockCacheClient, testRootDir, runId);
        await entityScout.run();

        const jobs = await fileAnalysisQueue.getJobs(['waiting', 'completed']);
        expect(jobs).toHaveLength(1);

        const jobData = jobs[0].data;
        expect(jobData).toHaveProperty('runId', runId);
        expect(jobData).toHaveProperty('filePath', file1Path);
        expect(jobData).toHaveProperty('jobId');
    });

    // Test Case ES-05
    test('ES-05: Should throw error and set run status to "failed" on I/O error', async () => {
        const unreadableDir = path.join(testRootDir, 'unreadable-dir');
        await fs.ensureDir(unreadableDir);
        await fs.chmod(unreadableDir, 0o000); // Make directory unreadable

        const entityScout = new EntityScout(queueManager, mockCacheClient, testRootDir, runId);

        // Verification: The run method should reject, and the status in cache should be 'failed'.
        await expect(entityScout.run()).rejects.toThrow(/EACCES: permission denied/);
        expect(mockCacheClient.set).toHaveBeenCalledWith(`run:${runId}:status`, 'failed');

        // Cleanup
        await fs.chmod(unreadableDir, 0o755);
    });
});