const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const EntityScout = require('../../src/agents/EntityScout');
const QueueManager = require('../../src/utils/queueManager');
const { getCacheClient, closeCacheClient } = require('../../src/utils/cacheClient');

const TEST_DATA_DIR = path.join(__dirname, '..', 'test-data', 'entity-scout');
const TEST_RUN_ID = `test-run-${uuidv4()}`;

describe('EntityScout Agent - Functional Tests', () => {
  let scout;
  let queueManager;
  let cacheClient;
  let fileAnalysisQueue;

  beforeEach(async () => {
    queueManager = new QueueManager();
    cacheClient = getCacheClient();
    fileAnalysisQueue = queueManager.getQueue('file-analysis-queue');
    await fileAnalysisQueue.obliterate({ force: true });

    scout = new EntityScout(queueManager, cacheClient, TEST_DATA_DIR, TEST_RUN_ID);
  });

  afterEach(async () => {
    await queueManager.closeConnections();
    await closeCacheClient();
  });

  /**
   * @group @core
   */
  test('ES-001: should discover files and enqueue analysis jobs', async () => {
    const { totalJobs } = await scout.run();
    
    // There are 6 files in the test directory that are not ignored
    expect(totalJobs).toBe(6);

    const jobsInQueue = await fileAnalysisQueue.getJobCounts('wait', 'active');
    expect(jobsInQueue.wait + jobsInQueue.active).toBe(6);

    const status = await cacheClient.get(`run:${TEST_RUN_ID}:status`);
    expect(status).toBe('processing');
  });

  /**
   * @group @error-handling
   */
  test('ES-003: should fail gracefully for a non-existent directory', async () => {
    const nonExistentDir = path.join(TEST_DATA_DIR, 'non-existent-dir');
    scout = new EntityScout(queueManager, cacheClient, nonExistentDir, TEST_RUN_ID);
    
    await expect(scout.run()).rejects.toThrow(/ENOENT/);

    const status = await cacheClient.get(`run:${TEST_RUN_ID}:status`);
    expect(status).toBe('failed');
  });

  /**
   * @group @core
   */
  test('ES-004: should handle an empty directory gracefully', async () => {
    const emptyDir = path.join(TEST_DATA_DIR, 'empty-dir');
    await fs.mkdir(emptyDir, { recursive: true });
    
    scout = new EntityScout(queueManager, cacheClient, emptyDir, TEST_RUN_ID);
    const { totalJobs } = await scout.run();
    
    expect(totalJobs).toBe(0);

    const status = await cacheClient.get(`run:${TEST_RUN_ID}:status`);
    expect(status).toBe('completed');
    
    await fs.rmdir(emptyDir);
  });
});