const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { WorkerAgent, LlmCallFailedError } = require('../../src/agents/WorkerAgent');
const { JsonSchemaValidator, ValidationError } = require('../../src/utils/jsonSchemaValidator');

// Mock dependencies
jest.mock('fs/promises');
jest.mock('../../src/utils/jsonSchemaValidator');
jest.mock('../../src/utils/batchProcessor');

const fs = require('fs/promises');
const mockLlmClient = {
  call: jest.fn(),
};

const mockValidator = {
  createGuardrailPrompt: jest.fn(),
  validateAndNormalize: jest.fn(),
};

const mockBatchProcessor = {
    queueAnalysisResult: jest.fn(),
    queueFailedWork: jest.fn(),
};

const { getBatchProcessor } = require('../../src/utils/batchProcessor');

describe('WorkerAgent Functional Tests', () => {
  let db;
  let agent;
  const workerId = 'test-worker-1';
  const targetDirectory = '/app/src';

  // ----------------------------------------------------------------
  // Test Setup and Teardown
  // ----------------------------------------------------------------

  beforeAll(async () => {
    // Use an in-memory database for tests
    db = await open({
      filename: ':memory:',
      driver: sqlite3.Database,
    });

    // Create the necessary schema for the tests
    await db.exec(`
      CREATE TABLE work_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_path TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        worker_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await db.exec(`
      CREATE TABLE analysis_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        work_item_id INTEGER NOT NULL,
        file_path TEXT NOT NULL,
        absolute_file_path TEXT NOT NULL,
        llm_output TEXT,
        status TEXT,
        validation_passed BOOLEAN,
        created_at TIMESTAMP,
        FOREIGN KEY (work_item_id) REFERENCES work_queue (id)
      );
    `);
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    // Clean the tables before each test
    await db.exec('DELETE FROM work_queue;');
    await db.exec('DELETE FROM analysis_results;');
    
    // Reset mocks
    jest.clearAllMocks();
    JsonSchemaValidator.mockImplementation(() => mockValidator);
    getBatchProcessor.mockReturnValue(mockBatchProcessor);


    // Initialize agent for each test
    agent = new WorkerAgent(db, mockLlmClient, targetDirectory);
  });

  // ----------------------------------------------------------------
  // Test Cases
  // ----------------------------------------------------------------

  describe('claimTask', () => {
    it('should claim a pending task and update its status to processing (WA-GNF-001)', async () => {
      // Arrange: Insert a pending task
      const insertResult = await db.run(
        "INSERT INTO work_queue (file_path, content_hash, status) VALUES (?, ?, 'pending')",
        ['/app/src/test.js', 'hash123']
      );
      const taskId = insertResult.lastID;

      // Act: Claim the task
      const task = await agent.claimTask(workerId);

      // Assert: Verify the task is claimed and the DB state is correct
      expect(task).not.toBeNull();
      expect(task.id).toBe(taskId);
      expect(task.file_path).toBe('/app/src/test.js');

      const dbState = await db.get('SELECT status, worker_id FROM work_queue WHERE id = ?', taskId);
      expect(dbState.status).toBe('processing');
      expect(dbState.worker_id).toBe(workerId);
    });

    it('should return null when no pending tasks are available (WA-GNF-002)', async () => {
      // Arrange: Ensure no pending tasks exist
      await db.run("INSERT INTO work_queue (file_path, content_hash, status) VALUES (?, ?, 'completed')", ['/app/src/test.js', 'hash123']);

      // Act: Attempt to claim a task
      const task = await agent.claimTask(workerId);

      // Assert: Verify that no task was claimed
      expect(task).toBeNull();
    });
  });

  describe('processTask', () => {
    it('should successfully process a task, creating an analysis result and updating status to completed (WA-PF-001)', async () => {
      // Arrange: Insert a task and set up mocks for a successful run
      const insertResult = await db.run(
        "INSERT INTO work_queue (file_path, content_hash, status, worker_id) VALUES (?, ?, 'processing', ?)",
        ['/app/src/main.js', 'hash456', workerId]
      );
      const task = { id: insertResult.lastID, file_path: '/app/src/main.js', content_hash: 'hash456' };
      const mockFileContent = "const x = 1;";
      const mockLlmResult = { entities: [{ name: 'myFunc' }], relationships: [] };

      fs.readFile.mockResolvedValue(mockFileContent);
      mockValidator.createGuardrailPrompt.mockReturnValue({ systemPrompt: 'sys', userPrompt: 'user' });
      mockLlmClient.call.mockResolvedValue({ body: JSON.stringify(mockLlmResult) });
      mockValidator.validateAndNormalize.mockReturnValue(mockLlmResult);

      // Act: Process the task
      await agent.processTask(task);

      // Assert: Verify the final database state
      expect(mockValidator.createGuardrailPrompt).toHaveBeenCalledWith(mockFileContent);
      const queueState = await db.get('SELECT status FROM work_queue WHERE id = ?', task.id);
      expect(queueState.status).toBe('completed');

      const resultState = await db.get('SELECT * FROM analysis_results WHERE work_item_id = ?', task.id);
      expect(resultState).toBeDefined();
      expect(resultState.status).toBe('completed');
      expect(resultState.validation_passed).toBe(1);
      expect(JSON.parse(resultState.llm_output)).toEqual(mockLlmResult);
    });

    it('should handle LLM failures, updating status to error (WA-PF-003)', async () => {
        // Arrange: Insert a task and set up mocks for a failed LLM call
        const insertResult = await db.run(
          "INSERT INTO work_queue (file_path, content_hash, status, worker_id) VALUES (?, ?, 'processing', ?)",
          ['/app/src/error.js', 'hash789', workerId]
        );
        const task = { id: insertResult.lastID, file_path: '/app/src/error.js', content_hash: 'hash789' };
        const errorMessage = 'LLM call failed';
        const mockFileContent = "const y = 2;";
        
          fs.readFile.mockResolvedValue(mockFileContent);
          mockValidator.createGuardrailPrompt.mockReturnValue({ systemPrompt: 'sys', userPrompt: 'user' });
          mockLlmClient.call.mockRejectedValue(new Error(errorMessage));
        
          // Act: Process the task
        await agent.processTask(task);
      
        // Assert: Verify the failure was queued correctly
        expect(mockBatchProcessor.queueFailedWork).toHaveBeenCalledWith(task.id, expect.stringContaining(errorMessage));
      });
  });
});