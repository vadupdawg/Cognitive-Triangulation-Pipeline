const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const QueueManager = require('../../../src/utils/queueManager');
const FileAnalysisWorker = require('../../../src/workers/fileAnalysisWorker');
const { FILE_ANALYSIS_QUEUE_NAME, FILE_ANALYSIS_COMPLETED_QUEUE_NAME } = require('../../../src/config');

describe('FileAnalysisWorker Functional Tests', () => {
    let testRootDir;
    let queueManager;
    let fileAnalysisWorker;

    beforeAll(async () => {
        queueManager = new QueueManager();
    });

    beforeEach(async () => {
        const uniqueId = uuidv4();
        testRootDir = path.join(os.tmpdir(), `test-run-${uniqueId}`);
        await fs.ensureDir(testRootDir);
        await queueManager.clearAllQueues();
        fileAnalysisWorker = new FileAnalysisWorker();
    });

    afterEach(async () => {
        await fs.remove(testRootDir);
        await fileAnalysisWorker.close();
    });

    afterAll(async () => {
        await queueManager.closeConnections();
    });

    // Test Case FAW-01
    test('FAW-01: Should correctly consume a job and publish a completion event', async () => {
        const testFilePath = path.join(testRootDir, 'testfile.txt');
        await fs.writeFile(testFilePath, 'Some content to analyze.');

        const fileAnalysisQueue = queueManager.getQueue(FILE_ANALYSIS_QUEUE_NAME);
        const job = await fileAnalysisQueue.add('analyze-file', {
            filePath: testFilePath,
            directoryPath: testRootDir,
            totalFilesInDir: 1
        });

        await fileAnalysisWorker.processJob(job);

        const completedQueue = queueManager.getQueue(FILE_ANALYSIS_COMPLETED_QUEUE_NAME);
        const completedJobs = await completedQueue.getJobs(['waiting', 'completed']);
        
        expect(completedJobs).toHaveLength(1);
        const completedJobData = completedJobs[0].data;
        expect(completedJobData).toHaveProperty('points_of_interest');
        expect(completedJobData).toHaveProperty('relationships');
        expect(completedJobData).toHaveProperty('confidence_score');
        expect(completedJobData.filePath).toBe(testFilePath);

        const originalJob = await fileAnalysisQueue.getJob(job.id);
        expect(originalJob.isCompleted()).toBeTruthy();
    });

    // Test Case FAW-02
    test('FAW-02: Should handle file not found errors gracefully', async () => {
        const nonExistentFilePath = path.join(testRootDir, 'not-found.txt');
        const fileAnalysisQueue = queueManager.getQueue(FILE_ANALYSIS_QUEUE_NAME);
        const job = await fileAnalysisQueue.add('analyze-file', { filePath: nonExistentFilePath });

        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        await fileAnalysisWorker.processJob(job);

        const completedQueue = queueManager.getQueue(FILE_ANALYSIS_COMPLETED_QUEUE_NAME);
        const completedJobs = await completedQueue.getJobs(['waiting', 'completed']);
        
        expect(completedJobs).toHaveLength(0);
        expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error processing job'), expect.anything());
        
        const originalJob = await fileAnalysisQueue.getJob(job.id);
        expect(originalJob.isFailed()).toBeTruthy();

        consoleErrorSpy.mockRestore();
    });

    // Test Case FAW-03
    test('FAW-03: Should handle malformed job data', async () => {
        const fileAnalysisQueue = queueManager.getQueue(FILE_ANALYSIS_QUEUE_NAME);
        const job = await fileAnalysisQueue.add('analyze-file', {
            // Missing filePath
            directoryPath: testRootDir,
            totalFilesInDir: 1
        });

        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        await fileAnalysisWorker.processJob(job);

        const completedQueue = queueManager.getQueue(FILE_ANALYSIS_COMPLETED_QUEUE_NAME);
        const completedJobs = await completedQueue.getJobs(['waiting', 'completed']);
        
        expect(completedJobs).toHaveLength(0);
        expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid job data'), expect.anything());

        const originalJob = await fileAnalysisQueue.getJob(job.id);
        expect(originalJob.isFailed()).toBeTruthy();

        consoleErrorSpy.mockRestore();
    });
});