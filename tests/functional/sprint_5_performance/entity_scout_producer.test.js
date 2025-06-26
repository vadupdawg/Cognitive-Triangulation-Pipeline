const fs = require('fs').promises;
const EntityScout = require('../../../src/agents/EntityScout');
const QueueManager = require('../../../src/utils/queueManager');

// Mock dependencies
jest.mock('fs', () => ({
  promises: {
    readdir: jest.fn(),
    stat: jest.fn(),
  },
}));

jest.mock('../../../src/utils/queueManager');

describe('EntityScout as a Job Producer', () => {
  let entityScout;
  let mockQueueManager;
  let mockAnalysisQueue;
  let mockDirectoryQueue;
  let mockGlobalQueue;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock QueueManager and the queues it returns
    mockAnalysisQueue = { add: jest.fn(), addBulk: jest.fn() };
    mockDirectoryQueue = { add: jest.fn() };
    mockGlobalQueue = { add: jest.fn() };

    mockQueueManager = {
      getQueue: jest.fn((queueName) => {
        if (queueName === 'file-analysis-queue') return mockAnalysisQueue;
        if (queueName === 'directory-resolution-queue') return mockDirectoryQueue;
        if (queueName === 'global-resolution-queue') return mockGlobalQueue;
        return null;
      }),
    };

    // Instantiate EntityScout with the mocked QueueManager
    entityScout = new EntityScout(mockQueueManager);
    
    // Mock the internal file discovery to control test scenarios
    entityScout._discoverFiles = jest.fn();
  });

  // Test Case ESP-01
  test('run() should create a single `resolve-global` parent job', async () => {
    entityScout._discoverFiles.mockResolvedValue({}); // No files found
    mockGlobalQueue.add.mockResolvedValue({ id: 'global-job-id' });

    await entityScout.run();

    expect(mockGlobalQueue.add).toHaveBeenCalledWith(
      'resolve-global',
      expect.any(Object),
      expect.any(Object)
    );
    expect(mockGlobalQueue.add).toHaveBeenCalledTimes(1);
  });

  // Test Case ESP-02
  test('run() should create one `resolve-directory` parent job for each discovered directory', async () => {
    const fileMap = {
      '/project/dir1': ['file1.js'],
      '/project/dir2': ['file2.js'],
    };
    entityScout._discoverFiles.mockResolvedValue(fileMap);
    
    // Mock the parent job to spy on dependency adding
    const mockParentJob = { id: 'global-job-id', addDependencies: jest.fn() };
    mockGlobalQueue.add.mockResolvedValue(mockParentJob);
    mockDirectoryQueue.add.mockResolvedValue({ id: 'dir-job-id', addDependencies: jest.fn() });
    mockAnalysisQueue.addBulk.mockResolvedValue([{ id: 'file-job-id' }]);


    await entityScout.run();

    expect(mockDirectoryQueue.add).toHaveBeenCalledTimes(2);
    expect(mockDirectoryQueue.add).toHaveBeenCalledWith(
      'resolve-directory',
      { directoryPath: '/project/dir1', runId: expect.any(String) },
      expect.any(Object)
    );
    expect(mockDirectoryQueue.add).toHaveBeenCalledWith(
      'resolve-directory',
      { directoryPath: '/project/dir2', runId: expect.any(String) },
      expect.any(Object)
    );
  });

  // Test Case ESP-03
  test('run() should create `analyze-file` jobs for all files using `addBulk`', async () => {
    const fileMap = {
      '/project/dir1': ['/project/dir1/file1.js', '/project/dir1/file2.js'],
      '/project/dir2': ['/project/dir2/file3.js'],
    };
    entityScout._discoverFiles.mockResolvedValue(fileMap);

    // Mock parent jobs
    const mockGlobalParent = { id: 'global-job-id', addDependencies: jest.fn() };
    const mockDirParent = { id: 'dir-job-id', addDependencies: jest.fn() };
    mockGlobalQueue.add.mockResolvedValue(mockGlobalParent);
    mockDirectoryQueue.add.mockResolvedValue(mockDirParent);
    mockAnalysisQueue.addBulk.mockResolvedValue([{ id: 'file-job-id-1' }, { id: 'file-job-id-2' }, { id: 'file-job-id-3' }]);

    await entityScout.run();

    expect(mockAnalysisQueue.addBulk).toHaveBeenCalledTimes(2); // Once for each directory
    expect(mockAnalysisQueue.addBulk).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'analyze-file',
          data: expect.objectContaining({ filePath: '/project/dir1/file1.js' }),
        }),
        expect.objectContaining({
          name: 'analyze-file',
          data: expect.objectContaining({ filePath: '/project/dir1/file2.js' }),
        }),
      ])
    );
    expect(mockAnalysisQueue.addBulk).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'analyze-file',
          data: expect.objectContaining({ filePath: '/project/dir2/file3.js' }),
        }),
      ])
    );
  });
  
  // Test Cases ESP-04 & ESP-05
  test('run() should correctly link jobs in a hierarchy', async () => {
    const fileMap = {
      '/project/dir1': ['/project/dir1/file1.js'],
    };
    entityScout._discoverFiles.mockResolvedValue(fileMap);

    const mockGlobalJob = { id: 'global-job-id', addDependencies: jest.fn().mockResolvedValue() };
    const mockDirJob = { id: 'dir-job-id', addDependencies: jest.fn().mockResolvedValue() };
    const mockFileJobs = [{ id: 'file-job-id-1' }];

    mockGlobalQueue.add.mockResolvedValue(mockGlobalJob);
    mockDirectoryQueue.add.mockResolvedValue(mockDirJob);
    mockAnalysisQueue.addBulk.mockResolvedValue(mockFileJobs);

    await entityScout.run();

    // ESP-04: Verify file jobs are linked to directory job
    expect(mockDirectoryQueue.add).toHaveBeenCalledWith(
      'resolve-directory',
      expect.any(Object),
      expect.objectContaining({
        dependencies: expect.arrayContaining([
          expect.objectContaining({ jobId: 'file-job-id-1' }),
        ]),
      })
    );

    // ESP-05: Verify directory job is linked to global job
    expect(mockGlobalQueue.add).toHaveBeenCalledWith(
      'resolve-global',
      expect.any(Object),
      expect.objectContaining({
        dependencies: expect.arrayContaining([
          expect.objectContaining({ jobId: 'dir-job-id' }),
        ]),
      })
    );
  });
});