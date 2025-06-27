const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const EntityScout = require('../../../src/agents/EntityScout');
const QueueManager = require('../../../src/utils/queueManager');
const { FILE_ANALYSIS_QUEUE_NAME } = require('../../../src/config');

describe('EntityScout Functional Tests', () => {
    let testRootDir;
    let queueManager;

    beforeAll(async () => {
        queueManager = new QueueManager();
    });

    beforeEach(async () => {
        const uniqueId = uuidv4();
        testRootDir = path.join(os.tmpdir(), `test-run-${uniqueId}`);
        await fs.ensureDir(testRootDir);
        await queueManager.clearAllQueues();
    });

    afterEach(async () => {
        await fs.remove(testRootDir);
    });

    afterAll(async () => {
        await queueManager.closeConnections();
    });

    // Test Case ES-01 & ES-02 & ES-04
    test('ES-01, ES-02, ES-04: Should create one master flow job and correct number of child jobs, handling empty directories', async () => {
        // Setup from Test Plan
        await fs.ensureDir(path.join(testRootDir, 'dir-A'));
        await fs.writeFile(path.join(testRootDir, 'dir-A', 'file1.txt'), 'content1');
        await fs.writeFile(path.join(testRootDir, 'dir-A', 'file2.txt'), 'content2');
        await fs.ensureDir(path.join(testRootDir, 'dir-B'));
        await fs.writeFile(path.join(testRootDir, 'dir-B', 'file3.txt'), 'content3');
        await fs.ensureDir(path.join(testRootDir, 'dir-C')); // Empty directory

        const mockCacheClient = { set: jest.fn().mockResolvedValue(), pipeline: () => ({ sadd: jest.fn(), exec: jest.fn().mockResolvedValue() }) };
        const entityScout = new EntityScout(queueManager, mockCacheClient, testRootDir, 'test-run-id');
        await entityScout.run();

        const fileAnalysisQueue = queueManager.getQueue(FILE_ANALYSIS_QUEUE_NAME);
        const jobs = await fileAnalysisQueue.getJobs(['waiting', 'active', 'completed']);

        const masterJobs = jobs.filter(job => job.name.startsWith('master-analysis-flow'));
        
        // ES-01 Verification
        expect(masterJobs).toHaveLength(1);
        const masterJob = masterJobs[0];
        expect(masterJob.data).toHaveProperty('children');

        const children = await masterJob.getChildren();
        
        // ES-02 & ES-04 Verification
        expect(children).toHaveLength(3);
        children.forEach(child => {
            expect(child.name).toBe('analyze-file');
        });
    });

    // Test Case ES-03
    test('ES-03: Child jobs should have correct and complete payloads', async () => {
        await fs.ensureDir(path.join(testRootDir, 'dir-A'));
        await fs.writeFile(path.join(testRootDir, 'dir-A', 'file1.txt'), 'content1');
        await fs.writeFile(path.join(testRootDir, 'dir-A', 'file2.txt'), 'content2');
        await fs.ensureDir(path.join(testRootDir, 'dir-B'));
        await fs.writeFile(path.join(testRootDir, 'dir-B', 'file3.txt'), 'content3');

        const mockCacheClient = { set: jest.fn().mockResolvedValue(), pipeline: () => ({ sadd: jest.fn(), exec: jest.fn().mockResolvedValue() }) };
        const entityScout = new EntityScout(queueManager, mockCacheClient, testRootDir, 'test-run-id');
        await entityScout.run();

        const fileAnalysisQueue = queueManager.getQueue(FILE_ANALYSIS_QUEUE_NAME);
        const jobs = await fileAnalysisQueue.getJobs(['waiting', 'active', 'completed']);
        const masterJob = jobs.find(job => job.name.startsWith('master-analysis-flow'));
        const children = await masterJob.getChildren();

        const childPayloads = children.map(child => child.data);

        // Verification for dir-A/file1.txt
        expect(childPayloads).toContainEqual(expect.objectContaining({
            filePath: expect.stringContaining(path.join('dir-A', 'file1.txt')),
            directoryPath: expect.stringContaining('dir-A'),
            totalFilesInDir: 2
        }));

        // Verification for dir-A/file2.txt
        expect(childPayloads).toContainEqual(expect.objectContaining({
            filePath: expect.stringContaining(path.join('dir-A', 'file2.txt')),
            directoryPath: expect.stringContaining('dir-A'),
            totalFilesInDir: 2
        }));

        // Verification for dir-B/file3.txt
        expect(childPayloads).toContainEqual(expect.objectContaining({
            filePath: expect.stringContaining(path.join('dir-B', 'file3.txt')),
            directoryPath: expect.stringContaining('dir-B'),
            totalFilesInDir: 1
        }));
    });

    // Test Case ES-05
    test('ES-05: Should handle I/O errors during file scan gracefully', async () => {
        const unreadableDir = path.join(testRootDir, 'unreadable-dir');
        await fs.ensureDir(unreadableDir, 0o000); // No permissions

        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        try {
            const mockCacheClient = { set: jest.fn().mockResolvedValue(), pipeline: () => ({ sadd: jest.fn(), exec: jest.fn().mockResolvedValue() }) };
            const entityScout = new EntityScout(queueManager, mockCacheClient, testRootDir, 'test-run-id');
            // We expect this to log an error but not crash the test process
            await expect(entityScout.run()).resolves.not.toThrow();

            // Verification
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('EACCES: permission denied'), expect.anything());
        } finally {
            // Cleanup
            await fs.chmod(unreadableDir, 0o755); // Restore permissions for cleanup
            consoleErrorSpy.mockRestore();
        }
    });
});