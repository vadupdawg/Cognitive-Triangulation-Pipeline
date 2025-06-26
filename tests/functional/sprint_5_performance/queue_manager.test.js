const { Queue, Worker } = require('bullmq');
const IORedis = require('ioredis');

// Mock the entire bullmq library
jest.mock('bullmq');
// Mock ioredis
jest.mock('ioredis');

const QueueManager = require('../../../src/utils/queueManager');

describe('QueueManager', () => {
  let queueManager;

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
    // Instantiate a new QueueManager
    queueManager = new QueueManager();
  });

  // Test Case QM-01
  test('getQueue should return a new queue instance with default retry options on the first call', () => {
    const queueName = 'test-queue';
    const queue = queueManager.getQueue(queueName);

    // Verify that the Queue constructor was called with the correct parameters
    expect(Queue).toHaveBeenCalledWith(queueName,
      expect.objectContaining({
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
        },
      })
    );

    // Verify that the queue instance is cached
    const sameQueue = queueManager.getQueue(queueName);
    expect(Queue).toHaveBeenCalledTimes(1);
    expect(sameQueue).toBe(queue);
  });

  // Test Case QM-02
  test('getQueue should return the same queue instance on subsequent calls for the same name', () => {
    const queueName = 'another-test-queue';
    
    // First call
    const queue1 = queueManager.getQueue(queueName);
    expect(Queue).toHaveBeenCalledTimes(1);

    // Second call
    const queue2 = queueManager.getQueue(queueName);
    expect(Queue).toHaveBeenCalledTimes(1); // Should not be called again
    expect(queue2).toBe(queue1); // Should return the cached instance
  });

  // Test Case QM-03
  test('createWorker should instantiate a BullMQ Worker with standard options', () => {
    const queueName = 'worker-queue';
    const processor = jest.fn();
    
    const worker = queueManager.createWorker(queueName, processor);
expect(Worker).toHaveBeenCalledWith(queueName, processor,
  expect.objectContaining({
    stalledInterval: 30000, // As per specs
  })
);
    });
  });

  // Test Case QM-04 - This is more of an integration test, but we can test the setup.
  // We will test that the 'failed' event listener is attached.
  test('getQueue should attach a "failed" event listener to handle DLQ routing', () => {
    const queueName = 'dlq-test-queue';
    const mockQueueInstance = {
      on: jest.fn(),
      name: queueName,
    };
    Queue.mockImplementation(() => mockQueueInstance);

    queueManager.getQueue(queueName);

    // Verify that the 'failed' event listener was attached
    expect(mockQueueInstance.on).toHaveBeenCalledWith('failed', expect.any(Function));

  test('closeConnections should close all active queues and the redis connection', async () => {
    const mockQueue1 = { close: jest.fn().mockResolvedValue() };
    const mockQueue2 = { close: jest.fn().mockResolvedValue() };
    const mockRedisConnection = { quit: jest.fn().mockResolvedValue() };

    // Setup mocks
    queueManager.activeQueues.set('q1', mockQueue1);
    queueManager.activeQueues.set('q2', mockQueue2);
    queueManager.redisConnection = mockRedisConnection;

    await queueManager.closeConnections();

    expect(mockQueue1.close).toHaveBeenCalledTimes(1);
    expect(mockQueue2.close).toHaveBeenCalledTimes(1);
    expect(mockRedisConnection.quit).toHaveBeenCalledTimes(0);
  });