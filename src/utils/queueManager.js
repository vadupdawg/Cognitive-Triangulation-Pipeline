const { Queue, Worker } = require('bullmq');
const config = require('../../config');

const FAILED_JOBS_QUEUE_NAME = 'failed-jobs';

const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 1000,
  },
};

const { EventEmitter } = require('events');

class QueueManager {
  constructor() {
    this.activeQueues = new Map();
    this.workers = [];
    this.events = new EventEmitter();
    const redisURL = new URL(config.REDIS_URL);
    this.connectionOptions = {
      host: redisURL.hostname,
      port: redisURL.port,
      maxRetriesPerRequest: null,
    };
    if (config.REDIS_PASSWORD && config.REDIS_PASSWORD.length > 0) {
      this.connectionOptions.password = config.REDIS_PASSWORD;
    }
  }

  getQueue(queueName) {
    if (this.activeQueues.has(queueName)) {
      return this.activeQueues.get(queueName);
    }

    console.log(`Creating new queue instance for: ${queueName}`);

    const queueOptions = {
      connection: this.connectionOptions,
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    };

    const newQueue = new Queue(queueName, queueOptions);

    if (queueName !== FAILED_JOBS_QUEUE_NAME) {
      newQueue.on('failed', async (job, error) => {
        console.log(`Job ${job.id} in queue ${queueName} failed permanently. Error: ${error.message}`);
        const failedJobsQueue = this.getQueue(FAILED_JOBS_QUEUE_NAME);
        await failedJobsQueue.add(job.name, job.data);
      });
    }

    this.activeQueues.set(queueName, newQueue);
    return newQueue;
  }

  createWorker(queueName, processor, options = {}) {
    if (!queueName || typeof queueName !== 'string') {
      throw new Error('A valid queueName (non-empty string) is required.');
    }
    if (!processor || typeof processor !== 'function') {
      throw new Error('A valid processor function is required.');
    }

    const workerConfig = {
      connection: this.connectionOptions,
      stalledInterval: 30000,
      ...options,
    };

    const worker = new Worker(queueName, processor, workerConfig);

    worker.on('completed', (job) => {
      console.log(`Job ${job.id} in queue ${queueName} completed successfully.`);
    });

    worker.on('failed', (job, error) => {
      console.error(`Job ${job.id} in queue ${queueName} failed with error: ${error.message}`);
    });

    this.workers.push(worker);
    this.workers.push(worker);
    return worker;
  }

  async getJobCounts() {
    const allCounts = {
      active: 0,
      waiting: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
    };

    for (const queue of this.activeQueues.values()) {
      const counts = await queue.getJobCounts();
      allCounts.active += counts.active || 0;
      allCounts.waiting += counts.waiting || 0;
      allCounts.completed += counts.completed || 0;
      allCounts.failed += counts.failed || 0;
      allCounts.delayed += counts.delayed || 0;
    }

    return allCounts;
  }

  async closeConnections() {
    console.log('Attempting to close all active connections...');
    const closePromises = [];
    for (const queue of this.activeQueues.values()) {
      console.log(`Closing queue: ${queue.name}`);
      closePromises.push(queue.close());
    }

    for (const worker of this.workers) {
      console.log(`Closing worker for queue: ${worker.name}`);
      closePromises.push(worker.close());
    }

    const results = await Promise.allSettled(closePromises);

    const errorList = results
      .filter(result => result.status === 'rejected')
      .map(result => result.reason);

    if (errorList.length > 0) {
      const aggregateError = new Error('One or more connections failed to close.');
      aggregateError.details = errorList;
      console.error(aggregateError);
      throw aggregateError;
    }

    console.log('All connections closed successfully.');
  }
}

module.exports = QueueManager;