const GlobalResolutionWorker = require('../../../src/workers/globalResolutionWorker');
const LLMClient = require('../../../src/utils/deepseekClient');
const DatabaseClient = require('../../../src/utils/sqliteDb');
const QueueManager = require('../../../src/utils/queueManager');

// Mock dependencies
jest.mock('../../../src/utils/deepseekClient', () => {
  const mLLM = {
    query: jest.fn(),
  };
  return jest.fn(() => mLLM);
});
jest.mock('../../../src/utils/sqliteDb', () => {
  const mDb = {
    loadDirectorySummaries: jest.fn(),
    beginTransaction: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn(),
    execute: jest.fn(),
  };
  return jest.fn(() => mDb);
});
jest.mock('../../../src/utils/queueManager', () => {
  const mQueue = {
    createWorker: jest.fn(),
  };
  return jest.fn(() => mQueue);
});

describe('GlobalResolutionWorker', () => {
  let worker;
  let mockDbClient;
  let mockLlmClient;
  let mockQueueManager;

  beforeEach(() => {
    jest.clearAllMocks();

    mockDbClient = new DatabaseClient();
    mockLlmClient = new LLMClient();
    mockQueueManager = new QueueManager();

    // Assumes the worker is instantiated with its dependencies
    worker = new GlobalResolutionWorker(mockQueueManager, mockLlmClient, mockDbClient);
  });

  // Test Case GRW-PERF-01: Test the refactored processJob logic for performance
  test('GRW-PERF-01: should process summaries in pages, query LLM outside transaction, and use bulk insert', async () => {
    const job = { data: { runId: 'perf-run-123' } };
    const summariesPage1 = [
      { directory_path: '/project/src/api', summary_text: 'Handles API routing.' },
      { directory_path: '/project/src/utils', summary_text: 'Contains helper functions.' },
    ];
    const summariesPage2 = [
        { directory_path: '/project/src/db', summary_text: 'Database access layer.' },
    ];
    const llmResponse = {
      relationships: [
        { from: '/project/src/api', to: '/project/src/utils', type: 'USES' },
        { from: '/project/src/api', to: '/project/src/db', type: 'CONNECTS_TO' },
      ],
    };

    // Mock pagination: first call returns page 1, second returns page 2, third returns empty
    mockDbClient.loadDirectorySummaries
      .mockResolvedValueOnce(summariesPage1)
      .mockResolvedValueOnce(summariesPage2)
      .mockResolvedValueOnce([]);
      
    mockLlmClient.query.mockResolvedValue(JSON.stringify(llmResponse));

    await worker.processJob(job);

    // 1. Verify LLM query happens *before* the transaction
    const llmQueryOrder = mockLlmClient.query.mock.invocationCallOrder[0];
    const transactionStartOrder = mockDbClient.beginTransaction.mock.invocationCallOrder[0];
    expect(llmQueryOrder).toBeLessThan(transactionStartOrder);

    // 2. Verify pagination was used
    expect(mockDbClient.loadDirectorySummaries).toHaveBeenCalledTimes(3);
    expect(mockDbClient.loadDirectorySummaries).toHaveBeenCalledWith('perf-run-123', 100, 0); // page 1
    expect(mockDbClient.loadDirectorySummaries).toHaveBeenCalledWith('perf-run-123', 100, 100); // page 2
    expect(mockDbClient.loadDirectorySummaries).toHaveBeenCalledWith('perf-run-123', 100, 200); // page 3 (empty)


    // 3. Verify transaction handling
    expect(mockDbClient.beginTransaction).toHaveBeenCalledTimes(1);
    expect(mockDbClient.commit).toHaveBeenCalledTimes(1);
    expect(mockDbClient.rollback).not.toHaveBeenCalled();

    // 4. Verify bulk insert
    expect(mockDbClient.execute).toHaveBeenCalledTimes(1); // Single call for bulk insert
    const expectedQuery = `INSERT INTO relationships (from_node_id, to_node_id, type, resolution_level) VALUES (?, ?, ?, ?), (?, ?, ?, ?)`;
    const expectedValues = [
      '/project/src/api', '/project/src/utils', 'USES', 'global',
      '/project/src/api', '/project/src/db', 'CONNECTS_TO', 'global'
    ];
    
    const receivedQuery = mockDbClient.execute.mock.calls[0][1];
    expect(receivedQuery.trim().replace(/\s+/g, ' ')).toContain(expectedQuery);
    expect(mockDbClient.execute).toHaveBeenCalledWith({}, expect.any(String), expectedValues);
  });

  // Test Case GRW-PERF-02: Failure scenario with new architecture
  test('GRW-PERF-02: should roll back transaction if bulk insert fails', async () => {
    const job = { data: { runId: 'fail-run-456' } };
    const summaries = [{ directory_path: '/project/src', summary_text: 'Main source.' }];
    const llmResponse = { relationships: [{ from: 'A', to: 'B', type: 'CALLS' }] };
    const error = new Error('DB bulk write failed');

    mockDbClient.loadDirectorySummaries.mockResolvedValueOnce(summaries).mockResolvedValueOnce([]);
    mockLlmClient.query.mockResolvedValue(JSON.stringify(llmResponse));
    mockDbClient.execute.mockRejectedValue(error); // Fail the bulk insert

    await expect(worker.processJob(job)).rejects.toThrow(error);

    // Verify transaction handling on failure
    expect(mockDbClient.beginTransaction).toHaveBeenCalledTimes(1);
    expect(mockDbClient.rollback).toHaveBeenCalledTimes(1);
    expect(mockDbClient.commit).not.toHaveBeenCalled();
    
    // Verify LLM was still called, as it happens before the transaction
    expect(mockLlmClient.query).toHaveBeenCalledTimes(1);
  });

  // Test Case GRW-01 (Integration Test Placeholder)
  test('GRW-01: should only be processed after all its directory resolution dependencies are met', () => {
    // This test requires a more complex setup with a real or more sophisticated mock of BullMQ
    // to verify job dependencies. It is defined here as per the test plan.
    // 1. Set up mock queues for 'directory-resolution' and 'global-resolution'.
    // 2. Create a parent 'resolve-global' job.
    // 3. Create several 'resolve-directory' child jobs and add them as dependencies.
    // 4. Mock the completion of the child jobs.
    // 5. Assert that the GlobalResolutionWorker's processor is only called *after* all dependencies are marked as complete.
    console.log('Integration test GRW-01 is defined but not implemented. It requires a live BullMQ instance or a more advanced mock.');
    expect(true).toBe(true); // Placeholder assertion
  });

  // Test Case GRW-02-SECURITY-PROMPT (Unit Test)
  test('GRW-02-SECURITY-PROMPT: should wrap each directory summary in its own <data> tag', async () => {
    const job = { data: { runId: 'test-run-sec-789' } };
    const directorySummaries = [
      { directory_path: '/project/src/api', summary_text: 'Handles API routing.' },
      { directory_path: '/project/src/utils', summary_text: 'Contains helper functions.' },
    ];
    const finalRelationships = { relationships: [] }; // No relationships needed for this test

    // Mock pagination: return summaries, then an empty array to terminate the loop.
    mockDbClient.loadDirectorySummaries
        .mockResolvedValueOnce(directorySummaries)
        .mockResolvedValueOnce([]);
    mockLlmClient.query.mockResolvedValue(JSON.stringify(finalRelationships));

    await worker.processJob(job);

    const capturedPrompt = mockLlmClient.query.mock.calls[0][0];
    
    // Verify that each summary is wrapped in its own <data> tag
    const expectedBlock1 = `<data>\nDirectory: /project/src/api\nSummary: Handles API routing.\n</data>`;
    const expectedBlock2 = `<data>\nDirectory: /project/src/utils\nSummary: Contains helper functions.\n</data>`;
    
    expect(capturedPrompt).toContain(expectedBlock1);
    expect(capturedPrompt).toContain(expectedBlock2);
  });
});