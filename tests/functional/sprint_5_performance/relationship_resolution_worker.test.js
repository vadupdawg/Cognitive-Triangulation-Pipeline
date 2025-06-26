const RelationshipResolutionWorker = require('../../../src/workers/relationshipResolutionWorker');
const LLMClient = require('../../../src/utils/deepseekClient');
const { DatabaseManager } = require('../../../src/utils/sqliteDb');
jest.mock('../../../src/utils/sqliteDb');
jest.mock('../../../src/utils/sqliteDb');
const QueueManager = require('../../../src/utils/queueManager');

// Mock dependencies
jest.mock('../../../src/utils/deepseekClient');
jest.mock('../../../src/utils/sqliteDb');
jest.mock('../../../src/utils/queueManager');

describe('RelationshipResolutionWorker', () => {
  let worker;
  let mockDbClient;
  let mockLlmClient;
  let mockQueueManager;
  let mockGraphBuildQueue;

  beforeEach(() => {
    jest.clearAllMocks();

    mockDbClient = {
      loadPoisForDirectory: jest.fn(),
      loadDirectorySummaries: jest.fn(),
      saveRelationships: jest.fn(),
    };
    DatabaseManager.mockImplementation(() => mockDbClient);

    mockLlmClient = {
      query: jest.fn(),
    };
    LLMClient.mockImplementation(() => mockLlmClient);

    mockGraphBuildQueue = {
      add: jest.fn(),
    };
    mockQueueManager = {
      getQueue: jest.fn().mockReturnValue(mockGraphBuildQueue),
    };
    QueueManager.mockImplementation(() => mockQueueManager);

    worker = new RelationshipResolutionWorker();
    worker.db = mockDbClient;
    worker.llmClient = mockLlmClient;
    worker.graphBuildQueue = mockGraphBuildQueue;
  });

  // Test Case DRW-02 (Directory Resolution)
  test('processJob for a directory should load POIs, resolve relationships, and save them', async () => {
    const job = { data: { type: 'directory', path: '/project/dir1' } };
    const pois = [{ id: 1, name: 'poi1' }];
    const relationships = [{ from: 1, to: 2, type: 'calls' }];

    mockDbClient.loadPoisForDirectory.mockResolvedValue(pois);
    mockLlmClient.query.mockResolvedValue({ relationships });

    await worker.processJob(job);

    expect(mockDbClient.loadPoisForDirectory).toHaveBeenCalledWith(job.data.path);
    expect(mockLlmClient.query).toHaveBeenCalledWith(expect.stringContaining(JSON.stringify(pois)));
    expect(mockDbClient.saveRelationships).toHaveBeenCalledWith(relationships);
  });

  // Test Case GRW-02 (Global Resolution)
  test('processJob for global should load summaries, resolve relationships, and save them', async () => {
    const job = { data: { type: 'global' } };
    const summaries = [{ dir: 'dir1', summary: '...' }];
    const relationships = [{ from: 1, to: 2, type: 'uses' }];

    mockDbClient.loadDirectorySummaries.mockResolvedValue(summaries);
    mockLlmClient.query.mockResolvedValue({ relationships });

    await worker.processJob(job);

    expect(mockDbClient.loadDirectorySummaries).toHaveBeenCalled();
    expect(mockLlmClient.query).toHaveBeenCalledWith(expect.stringContaining(JSON.stringify(summaries)));
    expect(mockDbClient.saveRelationships).toHaveBeenCalledWith(relationships);
  });
  
  // Test for triggering partial graph build
  test('processJob should trigger a partial graph build after saving relationships', async () => {
    const job = { data: { type: 'directory', path: '/project/dir1' } };
    const pois = [{ id: 1, name: 'poi1' }];
    const relationships = [{ from: 1, to: 2, type: 'calls' }];

    mockDbClient.loadPoisForDirectory.mockResolvedValue(pois);
    mockLlmClient.query.mockResolvedValue({ relationships });

    await worker.processJob(job);

    expect(mockGraphBuildQueue.add).toHaveBeenCalledWith(
      'build-partial-graph',
      {
        pois,
        relationships,
      }
    );
  });
});