const path = require('path');
const { WorkerAgent, LlmCallFailedError, InvalidJsonResponseError, FileNotFoundError } = require('../../src/agents/WorkerAgent');
const fs = require('fs').promises;

// Mock the entire fs module
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
  },
}));

describe('WorkerAgent', () => {
  let mockDb;
  let mockLlmClient;
  let workerAgent;

  beforeEach(() => {
    mockDb = {
      querySingle: jest.fn(),
      execute: jest.fn(),
    };
    mockLlmClient = {
      call: jest.fn(),
    };
    // Instantiate the agent before each test
    workerAgent = new WorkerAgent(mockDb, fs, mockLlmClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('5.1. Task Claiming (claimTask)', () => {
    test('1.1: Claim a pending task successfully', async () => {
      const task = { id: 1, file_path: 'src/test.js' };
      mockDb.querySingle.mockResolvedValue(task);
      const result = await workerAgent.claimTask('worker-1');
      expect(mockDb.querySingle).toHaveBeenCalledTimes(1);
      expect(result).toEqual(task);
    });

    test('1.2: No pending tasks available', async () => {
      mockDb.querySingle.mockResolvedValue(null);
      const result = await workerAgent.claimTask('worker-1');
      expect(mockDb.querySingle).toHaveBeenCalledTimes(1);
      expect(result).toBeNull();
    });
  });

  describe('5.2. Successful Task Processing (processTask)', () => {
    test('2.1: Full successful workflow for a small file', async () => {
      const task = { id: 1, file_path: 'src/test.js' };
      const fileContent = 'some code content';
      const llmResponse = { body: '{"entities": [], "relationships": []}' };
      fs.readFile.mockResolvedValue(fileContent);
      mockLlmClient.call.mockResolvedValue(llmResponse);

      await workerAgent.processTask(task);

      const expectedPath = path.resolve(task.file_path);
      expect(fs.readFile).toHaveBeenCalledWith(expectedPath, 'utf8');
      expect(mockLlmClient.call).toHaveBeenCalledTimes(1);
      expect(mockDb.execute).toHaveBeenCalledWith('BEGIN TRANSACTION');
      expect(mockDb.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO analysis_results'), expect.any(Array));
      expect(mockDb.execute).toHaveBeenCalledWith(expect.stringContaining('UPDATE work_queue'), expect.any(Array));
      expect(mockDb.execute).toHaveBeenCalledWith('COMMIT');
    });
  });

  describe('5.4. Error Handling and Resilience (via processTask)', () => {
    test('4.1: File not found', async () => {
      const task = { id: 1, file_path: 'src/nonexistent.js' };
      fs.readFile.mockRejectedValue(new Error('File not found'));
      
      await workerAgent.processTask(task);
      
      expect(mockDb.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO failed_work'), [task.id, expect.stringContaining('File not found at path')]);
      expect(mockLlmClient.call).not.toHaveBeenCalled();
    });

    test('4.2: LLM call fails with transient errors but eventually succeeds', async () => {
      const task = { id: 1, file_path: 'src/test.js' };
      fs.readFile.mockResolvedValue('some content');
      mockLlmClient.call
        .mockRejectedValueOnce(new Error('503 Server Error'))
        .mockRejectedValueOnce(new Error('503 Server Error'))
        .mockResolvedValue({ body: '{"entities": [], "relationships": []}' });

      await workerAgent.processTask(task);

      expect(mockLlmClient.call).toHaveBeenCalledTimes(3);
      expect(mockDb.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO analysis_results'), expect.any(Array));
    });

    test('4.3: LLM call fails permanently', async () => {
      const task = { id: 1, file_path: 'src/test.js' };
      fs.readFile.mockResolvedValue('some content');
      mockLlmClient.call.mockRejectedValue(new Error('Permanent Failure'));

      await workerAgent.processTask(task);

      expect(mockDb.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO failed_work'), [task.id, 'LLM call failed after 3 attempts: Permanent Failure']);
    });

    test('4.4: LLM returns invalid JSON permanently', async () => {
      const task = { id: 1, file_path: 'src/test.js' };
      fs.readFile.mockResolvedValue('some content');
      mockLlmClient.call.mockResolvedValue({ body: 'This is not JSON' });

      await workerAgent.processTask(task);

      expect(mockDb.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO failed_work'), [task.id, 'Response is not valid JSON.']);
    });
  });

  describe('5.5. Large File Chunking (via analyzeFileContent)', () => {
    test('5.1: File below size threshold', async () => {
      const filePath = 'src/small.js';
      const fileContent = 'small content';
      mockLlmClient.call.mockResolvedValue({ body: '{"entities": [], "relationships": []}' });

      await workerAgent.analyzeFileContent(filePath, fileContent);
      
      expect(mockLlmClient.call).toHaveBeenCalledTimes(1);
    });

    test('5.2: File above size threshold', async () => {
      const filePath = 'src/large.js';
      const largeFileContent = 'a'.repeat(200 * 1024); // > 128KB
      
      // Mock the private _createChunks method to control its output for the test
      const chunks = ['chunk1', 'chunk2'];
      const createChunksSpy = jest.spyOn(workerAgent, '_createChunks').mockReturnValue(chunks);
      
      mockLlmClient.call.mockResolvedValue({ body: '{"entities": [{"qualifiedName": "e1"}], "relationships": []}' });
      
      const result = await workerAgent.analyzeFileContent(filePath, largeFileContent);

      expect(createChunksSpy).toHaveBeenCalled();
      expect(mockLlmClient.call).toHaveBeenCalledTimes(chunks.length);
      // Verify that results from different chunks are merged
      expect(result.entities.length).toBe(1);
      expect(result.entities[0].qualifiedName).toBe("e1");
      expect(result.is_chunked).toBe(true);
    });
  });
});