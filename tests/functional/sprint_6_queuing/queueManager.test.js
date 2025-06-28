/**
 * @jest-environment node
 */
const { Queue, Worker } = require('bullmq');
const IORedis = require('ioredis');
const { getInstance, QueueManagerForTest } = require('../../../src/utils/queueManager');
const config = require('../../../src/config');

// Mock the dependencies
jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
    add: jest.fn(),
    obliterate: jest.fn(),
  })),
  Worker: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('ioredis', () => jest.fn().mockImplementation(() => ({
  on: jest.fn(),
  quit: jest.fn().mockResolvedValue('OK'),
  once: jest.fn(),
})));

jest.mock('../../../src/config', () => ({
  REDIS_URL: 'redis://:password@localhost:6379',
  QUEUE_NAMES: ['test-queue', 'another-queue'],
}));

describe('QueueManager', () => {
  let qm;

  beforeEach(() => {
    jest.clearAllMocks();
    // We use the exported class for testing to be able to create new instances
    qm = new QueueManagerForTest();
  });

  describe('QM-002: Singleton Queue Instantiation', () => {
    it('should return the same queue instance for the same name', () => {
      const queueInstance1 = qm.getQueue('test-queue');
      const queueInstance2 = qm.getQueue('test-queue');
      expect(queueInstance1).toBe(queueInstance2);
      expect(Queue).toHaveBeenCalledTimes(1);
    });
  });

  describe('QM-003: Standardized Worker Creation', () => {
    it('should instantiate a BullMQ Worker with the shared connection and correct options', () => {
      qm.createWorker('test-queue', () => {}, {});
      expect(Worker).toHaveBeenCalledWith('test-queue', expect.any(Function), {
        connection: qm.connection,
        stalledInterval: 30000,
        lockDuration: 1800000,
      });
    });
  });

  describe('QM-005: Connection Resilience Config', () => {
    it('should pass the shared connection instance to the Queue constructor', () => {
      qm.getQueue('test-queue');
      expect(Queue).toHaveBeenCalledWith(
        'test-queue',
        expect.objectContaining({
          connection: qm.connection,
        })
      );
    });
  });

  describe('QM-007: Graceful Shutdown', () => {
    it('should close all active queues, workers, and the main redis connection', async () => {
      const queue = qm.getQueue('test-queue');
      const worker = qm.createWorker('test-queue', () => {});
      
      await qm.closeConnections();
      
      expect(queue.close).toHaveBeenCalledTimes(1);
      expect(worker.close).toHaveBeenCalledTimes(1);
      expect(qm.connection.quit).toHaveBeenCalledTimes(1);
    });
  });

  describe('VULN-003: Insecure Redis Configuration Management', () => {
    it('should use the full REDIS_URL for connection', () => {
      // The constructor is called in beforeEach, so we just check the mock
      expect(IORedis).toHaveBeenCalledWith(config.REDIS_URL, {
        maxRetriesPerRequest: null,
        enableReadyCheck: true,
      });
    });
  });

  describe('VULN-004: Lack of Input Sanitization on Queue Name', () => {
    it('should not create a queue if the name is not in the allow-list', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const queue = qm.getQueue('disallowed-queue');
      expect(queue).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith('Disallowed queue name requested: disallowed-queue');
      consoleErrorSpy.mockRestore();
    });

    it('should create a queue if the name is in the allow-list', () => {
      const queue = qm.getQueue('test-queue');
      expect(queue).not.toBeNull();
      expect(Queue).toHaveBeenCalledWith('test-queue', expect.any(Object));
    });
  });
});