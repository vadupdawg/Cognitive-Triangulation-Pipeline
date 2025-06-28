const fs = require('fs');
const fsPromises = require('fs/promises');
const path = require('path');
const { z } = require('zod');
const QueueManager = require('../utils/queueManager');
const { logger } = require('../utils/logger');
const { getTokenizer } = require('../utils/tokenizer');

// --- Configuration Schemas ---

const discoverFilesConfigSchema = z.object({
  TARGET_DIRECTORY: z.string().min(1),
});

const workerConfigSchema = z.object({
  MAX_BATCH_TOKENS: z.number().int().positive(),
  ANALYSIS_QUEUE: z.string().min(1),
  MAX_FILE_SIZE_BYTES: z.number().int().positive(),
  TARGET_DIRECTORY: z.string().min(1),
});

// --- Phase 1: Path Producer ---

/**
 * Scans a target directory, identifies files, and enqueues them for batching.
 * Scans a target directory, identifies files, and enqueues them for batching.
 * This function is designed to run as a standalone producer process.
 */
const discoverFiles = async () => {
  const config = {
    TARGET_DIRECTORY: process.env.TARGET_DIRECTORY,
  };

  const validationResult = discoverFilesConfigSchema.safeParse(config);
  if (!validationResult.success) {
    logger.error('Invalid configuration for discoverFiles:', validationResult.error);
    process.exit(1);
    return;
  }

  const { TARGET_DIRECTORY } = validationResult.data;
  const queueManager = QueueManager.getInstance();
  const discoveryQueue = queueManager.getQueue('path-discovery-queue');

  try {
    const entries = await fsPromises.readdir(TARGET_DIRECTORY, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile()) {
        const filePath = path.join(TARGET_DIRECTORY, entry.name);
        try {
          const stats = await fsPromises.stat(filePath);
          await discoveryQueue.add('file-path', {
            filePath,
            fileSize: stats.size,
          });
          logger.info(`Enqueued file for batching: ${filePath}`);
        } catch (statError) {
          logger.error(`Could not stat file ${filePath}. Skipping.`, statError);
        }
      }
    }
  } catch (err) {
    logger.error(`Failed to read directory ${TARGET_DIRECTORY}:`, err);
  }
};

// --- Helper for Streaming Tokenization ---
const countTokensFromStream = (filePath, tokenizer) => {
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath, { encoding: 'utf-8' });
    let tokenCount = 0;
    stream.on('data', (chunk) => {
      tokenCount += tokenizer(chunk);
    });
    stream.on('end', () => {
      resolve(tokenCount);
    });
    stream.on('error', (err) => {
      if (err.code === 'ENOENT') {
        logger.error(`File not found during streaming: ${filePath}`);
        resolve(0); // File might have been deleted between stat and read
      } else {
        reject(err);
      }
    });
  });
};

// --- Phase 2: Batching Worker ---

const fileDiscoveryBatcherWorker = {
  config: null,
  tokenizer: null,
  redis: null,
  BATCH_FILES_KEY: 'file-discovery-batch:files',
  BATCH_TOKENS_KEY: 'file-discovery-batch:tokens',

  /**
   * Initializes the worker with necessary configuration and defines Redis commands.
   */
  initialize(config) {
    const validationResult = workerConfigSchema.safeParse(config);
    if (!validationResult.success) {
      throw new Error('Invalid configuration for FileDiscoveryBatcherWorker');
    }
    this.config = validationResult.data;
    this.tokenizer = getTokenizer();
    this.queueManager = QueueManager.getInstance();
    this.redis = this.queueManager.getQueue(this.config.ANALYSIS_QUEUE).client;

    if (this.redis && !this.redis.popBatchIfReady) {
      this.redis.defineCommand('popBatchIfReady', {
        numberOfKeys: 2,
        lua: `
          local files_key = KEYS[1]
          local tokens_key = KEYS[2]
          local max_tokens = tonumber(ARGV[1])

          local current_tokens = tonumber(redis.call('get', tokens_key) or 0)
          if current_tokens < max_tokens then
            return nil
          end

          local batch_tokens = redis.call('getset', tokens_key, '0')
          if tonumber(batch_tokens) < max_tokens then
            redis.call('incrby', tokens_key, tonumber(batch_tokens))
            return nil
          end

          local files = redis.call('lrange', files_key, 0, -1)
          redis.call('del', files_key)
          
          return {files, batch_tokens}
        `,
      });
    }
  },

  /**
   * Processes a single file path job, tokenizes the file via stream,
   * adds it to a Redis-managed batch, and triggers batch enqueue if full.
   */
  async processor(job) {
    const { filePath } = job.data;
    if (!this.config || !this.redis) {
      throw new Error('Worker not initialized. Call initialize() first.');
    }

    try {
      const targetDirectory = path.resolve(this.config.TARGET_DIRECTORY);
      const resolvedPath = path.resolve(filePath);

      if (!resolvedPath.startsWith(targetDirectory)) {
        logger.error(`Path Traversal attempt detected. Path "${resolvedPath}" is outside of target directory "${targetDirectory}".`);
        return;
      }

      const stats = await fsPromises.stat(resolvedPath);
      if (stats.size > this.config.MAX_FILE_SIZE_BYTES) {
        logger.warn(`File ${resolvedPath} exceeds size limit of ${this.config.MAX_FILE_SIZE_BYTES} bytes. Skipping.`);
        return;
      }

      const tokenCount = await countTokensFromStream(resolvedPath, this.tokenizer);

      const fileData = { filePath: resolvedPath, tokenCount };
      await this.redis.rpush(this.BATCH_FILES_KEY, JSON.stringify(fileData));
      await this.redis.incrby(this.BATCH_TOKENS_KEY, tokenCount);

      const result = await this.redis.popBatchIfReady(
        this.BATCH_FILES_KEY,
        this.BATCH_TOKENS_KEY,
        this.config.MAX_BATCH_TOKENS
      );

      if (result) {
        await this._enqueueBatch(result);
      }
    } catch (error) {
      logger.error(`Failed to process file ${filePath}:`, error);
    }
  },

  /**
   * Enqueues a completed batch to the analysis queue.
   * @private
   */
  async _enqueueBatch(redisResult) {
    const [files, totalTokensStr] = redisResult;
    if (!files || files.length === 0) {
      return;
    }

    const totalTokens = parseInt(totalTokensStr, 10);
    const batchPayload = {
      id: `batch-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      files: files.map(f => JSON.parse(f)),
      totalTokens,
    };

    const analysisQueue = this.queueManager.getQueue(this.config.ANALYSIS_QUEUE);
    await analysisQueue.add('file-batch', batchPayload);
    logger.info(`Enqueued batch ${batchPayload.id} with ${batchPayload.files.length} files and ${totalTokens} tokens.`);
  },

  // --- Methods for Testing ---

  /**
   * Resets the Redis batch keys for testing purposes.
   * @private
   */
  async _resetForTesting() {
    if (this.redis) {
      await this.redis.del(this.BATCH_FILES_KEY, this.BATCH_TOKENS_KEY);
    }
  },

  /**
   * Returns the current state of the batch from Redis for testing.
   * @returns {object} The current batch.
   */
  async getCurrentBatch() {
    if (!this.redis) return { files: [], totalTokens: 0 };
    const files = await this.redis.lrange(this.BATCH_FILES_KEY, 0, -1);
    const totalTokens = parseInt(await this.redis.get(this.BATCH_TOKENS_KEY) || '0', 10);
    return {
      files: files.map(f => JSON.parse(f)),
      totalTokens,
    };
  },
};
module.exports = {
  discoverFiles,
  fileDiscoveryBatcherWorker,
};