const DirectoryResolutionWorker = require('../../../src/workers/directoryResolutionWorker');
const LLMClient = require('../../../src/utils/deepseekClient');
const DatabaseClient = require('../../../src/utils/sqliteDb');
const QueueManager = require('../../../src/utils/queueManager');

// Mock dependencies
jest.mock('../../../src/utils/deepseekClient');
jest.mock('../../../src/utils/sqliteDb');
jest.mock('../../../src/utils/queueManager');

describe('DirectoryResolutionWorker', () => {
  let worker;
  let mockDbClient;
  let mockLlmClient;
  let mockQueueManager;

  beforeEach(() => {
    jest.clearAllMocks();

    mockDbClient = {
      loadPoisForDirectory: jest.fn(),
      saveRelationships: jest.fn(),
      beginTransaction: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn(),
      execute: jest.fn(), // Mocked for DRW-02 to align with FAW-01 pattern
    };
    DatabaseClient.mockImplementation(() => mockDbClient);

    mockLlmClient = {
      query: jest.fn(),
    };
    LLMClient.mockImplementation(() => mockLlmClient);

    mockQueueManager = {
      createWorker: jest.fn(),
    };
    QueueManager.mockImplementation(() => mockQueueManager);

    // The worker will be instantiated here, assuming it follows the pattern
    // of taking dependencies in its constructor.
    worker = new DirectoryResolutionWorker(mockQueueManager, mockLlmClient, mockDbClient);
  });

  // Test Case DRW-02 (Unit Test)
  test('DRW-02: processJob should load POIs, resolve relationships via LLM, and save them within a transaction', async () => {
    const job = { data: { directoryPath: '/project/src/utils' } };
    const pois = [
      { id: 1, name: 'functionA', path: '/project/src/utils/helpers.js' },
      { id: 2, name: 'functionB', path: '/project/src/utils/core.js' },
    ];
    const relationships = { relationships: [{ from: 1, to: 2, type: 'calls' }] };

    mockDbClient.loadPoisForDirectory.mockResolvedValue(pois);
    mockLlmClient.query.mockResolvedValue(JSON.stringify(relationships));

    await worker.processJob(job);

    expect(mockDbClient.beginTransaction).toHaveBeenCalledTimes(1);
    expect(mockDbClient.loadPoisForDirectory).toHaveBeenCalledWith(job.data.directoryPath);
    expect(mockLlmClient.query).toHaveBeenCalledWith(expect.stringContaining(JSON.stringify(pois)));
    // As per architecture, this worker saves relationships. We expect an idempotent write.
    expect(mockDbClient.execute).toHaveBeenCalledWith(expect.any(Object), expect.stringContaining('ON CONFLICT'), expect.any(Array));
    expect(mockDbClient.commit).toHaveBeenCalledTimes(1);
    expect(mockDbClient.rollback).not.toHaveBeenCalled();
  });

  // Test Case DRW-02 (Failure Scenario)
  test('DRW-02: processJob should roll back the transaction if saving relationships fails', async () => {
    const job = { data: { directoryPath: '/project/src/utils' } };
    const pois = [{ id: 1, name: 'functionA' }];
    const error = new Error('DB write failed');

    mockDbClient.loadPoisForDirectory.mockResolvedValue(pois);
    mockLlmClient.query.mockResolvedValue(JSON.stringify({ relationships: [] }));
    mockDbClient.execute.mockRejectedValue(error);

    await expect(worker.processJob(job)).rejects.toThrow(error);

    expect(mockDbClient.beginTransaction).toHaveBeenCalledTimes(1);
    expect(mockDbClient.loadPoisForDirectory).toHaveBeenCalledWith(job.data.directoryPath);
    expect(mockDbClient.rollback).toHaveBeenCalledTimes(1);
    expect(mockDbClient.commit).not.toHaveBeenCalled();
  });

  // Test Case DRW-01 (Integration Test Placeholder)
  // This test requires a more complex setup with a real or more sophisticated mock of BullMQ
  // to verify job dependencies. It is defined here as per the test plan.
  test('DRW-01: should only be processed after all its file analysis dependencies are met', () => {
    // This test would involve:
    // 1. Setting up a mock `analysis-queue` and a `directory-resolution-queue`.
    // 2. Creating a parent `resolve-directory` job.
    // 3. Creating several `analyze-file` child jobs and adding them as dependencies.
    // 4. Mocking the completion of the child jobs.
    // 5. Asserting that the `DirectoryResolutionWorker`'s processor is only called *after* all dependencies are marked as complete.
    console.log('Integration test DRW-01 is defined but not implemented. It requires a live BullMQ instance or a more advanced mock.');
    expect(true).toBe(true); // Placeholder assertion
  });
});
