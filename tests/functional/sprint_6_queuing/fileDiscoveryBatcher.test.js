/**
 * @jest-environment node
 */
const fs = require('fs');
const fsPromises = require('fs/promises');
const path = require('path');
const { Readable } = require('stream');
const { z } = require('zod');
const QueueManager = require('../../../src/utils/queueManager');
const { discoverFiles, fileDiscoveryBatcherWorker } = require('../../../src/workers/fileDiscoveryBatcher');
const { getTokenizer } = require('../../../src/utils/tokenizer');
const { logger } = require('../../../src/utils/logger');

// Mock dependencies
jest.mock('fs');
jest.mock('fs/promises');
jest.mock('../../../src/utils/queueManager');
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));
jest.mock('../../../src/utils/tokenizer');
jest.mock('zod', () => {
  const mockChain = {
    min: jest.fn().mockReturnThis(),
    int: jest.fn().mockReturnThis(),
    positive: jest.fn().mockReturnThis(),
  };
  const mockObject = {
    safeParse: jest.fn().mockReturnValue({ success: true, data: {} }),
  };
  return {
    z: {
      object: jest.fn(() => mockObject),
      string: () => mockChain,
      number: () => mockChain,
    },
  };
});

describe('FileDiscoveryBatcher', () => {
  let processExitSpy;
  let mockQueue;
  let mockRedis;
  let zMock;

  beforeEach(() => {
    jest.clearAllMocks();
    zMock = require('zod');
    processExitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});

    mockRedis = {
      rpush: jest.fn(),
      incrby: jest.fn(),
      popBatchIfReady: jest.fn().mockResolvedValue(null),
      defineCommand: jest.fn(),
      del: jest.fn(),
      lrange: jest.fn().mockResolvedValue([]),
      get: jest.fn().mockResolvedValue('0'),
    };
    mockQueue = { add: jest.fn(), client: mockRedis };
    const mockQmInstance = { getQueue: jest.fn().mockReturnValue(mockQueue) };
    QueueManager.getInstance = jest.fn().mockReturnValue(mockQmInstance);
    getTokenizer.mockReturnValue(jest.fn((content) => (content ? content.split(' ').length : 0)));
  });

  afterEach(() => {
    processExitSpy.mockRestore();
  });

  describe('Phase 1: Path Producer (discoverFiles)', () => {
    it('FDB-P1-001: should exit if TARGET_DIRECTORY is not configured', async () => {
      zMock.z.object().safeParse.mockReturnValueOnce({ success: false, error: 'Config error' });
      await discoverFiles();
      expect(process.exit).toHaveBeenCalledWith(1);
    });

    describe('when configured', () => {
      beforeEach(() => {
        zMock.z.object().safeParse.mockReturnValue({
          success: true,
          data: { TARGET_DIRECTORY: '/test/target' },
        });
      });

      it('FDB-P1-002 & FDB-P1-003: should scan directory and enqueue a job for each file', async () => {
        const mockFiles = [
          { name: 'file1.txt', isFile: () => true },
          { name: 'file2.js', isFile: () => true },
          { name: 'empty-dir', isFile: () => false },
        ];
        fsPromises.readdir.mockResolvedValue(mockFiles);
        fsPromises.stat.mockResolvedValue({ size: 123 });
        await discoverFiles();
        expect(mockQueue.add).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('Phase 2: Batching Worker (Stateless & Streaming)', () => {
    const mockConfig = {
      MAX_BATCH_TOKENS: 100,
      ANALYSIS_QUEUE: 'analysis-queue',
      MAX_FILE_SIZE_BYTES: 10 * 1024 * 1024,
      TARGET_DIRECTORY: path.resolve(process.cwd(), 'test-data'),
    };

    beforeEach(() => {
      zMock.z.object().safeParse.mockReturnValue({ success: true, data: mockConfig });
      fileDiscoveryBatcherWorker.initialize(mockConfig);
    });

    it('FDB-P2-003 (Refactored): should add file to Redis batch and not trigger enqueue', async () => {
      const job = { data: { filePath: path.resolve(mockConfig.TARGET_DIRECTORY, 'small-file.txt') } };
      fsPromises.stat.mockResolvedValue({ size: 50 });
      const stream = Readable.from(['this file has 5 tokens']);
      fs.createReadStream.mockReturnValue(stream);

      await fileDiscoveryBatcherWorker.processor(job);

      expect(fs.createReadStream).toHaveBeenCalledWith(job.data.filePath, { encoding: 'utf-8' });
      expect(mockRedis.rpush).toHaveBeenCalledWith(expect.any(String), expect.any(String));
      expect(mockRedis.incrby).toHaveBeenCalledWith(expect.any(String), 5);
      expect(mockRedis.popBatchIfReady).toHaveBeenCalledWith(expect.any(String), expect.any(String), mockConfig.MAX_BATCH_TOKENS);
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('FDB-P2-04 (Refactored): should enqueue a batch when Redis script returns a result', async () => {
      const job = { data: { filePath: path.resolve(mockConfig.TARGET_DIRECTORY, 'large-file.txt') } };
      fsPromises.stat.mockResolvedValue({ size: 500 });
      const stream = Readable.from(['this file has a lot of tokens, more than one hundred']);
      fs.createReadStream.mockReturnValue(stream);
      
      const mockBatch = [
        [JSON.stringify({ filePath: 'path/1', tokenCount: 50 }), JSON.stringify({ filePath: 'path/2', tokenCount: 60 })],
        '110'
      ];
      mockRedis.popBatchIfReady.mockResolvedValue(mockBatch);

      await fileDiscoveryBatcherWorker.processor(job);

      expect(mockQueue.add).toHaveBeenCalledTimes(1);
      const batchPayload = mockQueue.add.mock.calls[0][1];
      expect(batchPayload.totalTokens).toBe(110);
      expect(batchPayload.files.length).toBe(2);
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Enqueued batch'));
    });

    it('FDB-P2-005: should not throw and log an error if a file cannot be read', async () => {
      const job = { data: { filePath: path.resolve(mockConfig.TARGET_DIRECTORY, 'non-existent-file.txt') } };
      fsPromises.stat.mockRejectedValue(new Error('File not found'));
      await fileDiscoveryBatcherWorker.processor(job);
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to process file'), expect.any(Error));
    });

    it('FDB-S1-001: [Security] should reject file paths outside the target directory (Path Traversal)', async () => {
      const maliciousFilePath = path.resolve(mockConfig.TARGET_DIRECTORY, `..${path.sep}..${path.sep}etc${path.sep}passwd`);
      const job = { data: { filePath: maliciousFilePath } };
      await fileDiscoveryBatcherWorker.processor(job);
      expect(logger.error).toHaveBeenCalledWith(
        `Path Traversal attempt detected. Path "${maliciousFilePath}" is outside of target directory "${mockConfig.TARGET_DIRECTORY}".`
      );
      expect(fsPromises.stat).not.toHaveBeenCalled();
    });

    it('FDB-S2-001: [Security] should skip files that exceed the maximum size limit', async () => {
      const largeFilePath = path.resolve(mockConfig.TARGET_DIRECTORY, 'large-file.bin');
      const job = { data: { filePath: largeFilePath } };
      fsPromises.stat.mockResolvedValue({ size: 20 * 1024 * 1024 });
      await fileDiscoveryBatcherWorker.processor(job);
      expect(logger.warn).toHaveBeenCalledWith(`File ${largeFilePath} exceeds size limit of ${mockConfig.MAX_FILE_SIZE_BYTES} bytes. Skipping.`);
      expect(fs.createReadStream).not.toHaveBeenCalled();
    });
  });
});