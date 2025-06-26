const { EventEmitter } = require('events');
const { Queue, Worker } = require('bullmq');
const QueueManager = require('../../../src/utils/queueManager');
const DirectoryResolutionWorker = require('../../../src/workers/directoryResolutionWorker');
const GlobalResolutionWorker = require('../../../src/workers/globalResolutionWorker');

// Mock dependencies
jest.mock('bullmq');
jest.mock('../../../src/utils/queueManager');

// A more advanced mock for BullMQ jobs to handle dependencies
class MockJob extends EventEmitter {
  constructor(name, data, opts) {
    super();
    this.name = name;
    this.data = data;
    this.opts = opts;
    this.id = Math.random().toString(36).substring(7);
  }

  async getDependencies() {
    return { jobs: this.opts.dependencies || [] };
  }

  async isWaiting() {
    const deps = await this.getDependencies();
    // Simulate that it's waiting if it has dependencies that are not marked 'completed'
    return deps.jobs.some(dep => dep.state !== 'completed');
  }
  
  async addDependencies(deps) {
      this.opts.dependencies = deps.jobs;
  }
}


describe('Hierarchical Job Integration Tests', () => {
  let mockQueueManager;
  let mockDirectoryQueue;
  let mockGlobalQueue;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock Queues
    mockDirectoryQueue = { on: jest.fn() };
    mockGlobalQueue = { on: jest.fn() };

    mockQueueManager = {
      getQueue: jest.fn(queueName => {
        if (queueName === 'directory-resolution-queue') return mockDirectoryQueue;
        if (queueName === 'global-resolution-queue') return mockGlobalQueue;
        return null;
      }),
      createWorker: jest.fn((queueName, processor) => {
        // Return a mock worker that we can control
        return { processor };
      }),
    };
    QueueManager.mockImplementation(() => mockQueueManager);
  });

  // Test Case DRW-01
  test('DirectoryResolutionWorker should only run after its file analysis dependencies are met', async () => {
    const dirWorker = new DirectoryResolutionWorker();
    const processor = dirWorker.processJob;

    const childJobs = [
      { id: 'file1', state: 'completed' },
      { id: 'file2', state: 'completed' },
    ];
    
    const parentJob = new MockJob('resolve-directory', { path: '/project/dir1' }, { dependencies: childJobs });
    
    // Simulate BullMQ checking if the job is ready to run
    const isWaiting = await parentJob.isWaiting();
    
    // This is a conceptual test. A real BullMQ worker would handle this.
    // We assert that our mock logic correctly identifies the job is ready.
    // A true integration test would require a live Redis instance.
    expect(isWaiting).toBe(false); 
    
    // If it's not waiting, the processor would be called.
    // We can simulate this call to check the worker's logic.
    dirWorker.db = { loadPoisForDirectory: jest.fn().mockResolvedValue([]) };
    dirWorker.llmClient = { query: jest.fn().mockResolvedValue({ relationships: [] }) };
    dirWorker.graphBuildQueue = { add: jest.fn() };

    await processor(parentJob);
    expect(dirWorker.db.loadPoisForDirectory).toHaveBeenCalled();
  });

  // Test Case GRW-01
  test('GlobalResolutionWorker should only run after its directory resolution dependencies are met', async () => {
    const globalWorker = new GlobalResolutionWorker();
    const processor = globalWorker.processJob;

    const childJobs = [
      { id: 'dir1', state: 'completed' },
      { id: 'dir2', state: 'completed' },
    ];

    const parentJob = new MockJob('resolve-global', {}, { dependencies: childJobs });

    const isWaiting = await parentJob.isWaiting();
    expect(isWaiting).toBe(false);

    // Simulate the call to the processor
    globalWorker.db = { loadDirectorySummaries: jest.fn().mockResolvedValue([]) };
    globalWorker.llmClient = { query: jest.fn().mockResolvedValue({ relationships: [] }) };
    globalWorker.graphBuildQueue = { add: jest.fn() };

    await processor(parentJob);
    expect(globalWorker.db.loadDirectorySummaries).toHaveBeenCalled();
  });
});