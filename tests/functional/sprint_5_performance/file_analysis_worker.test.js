const fs = require('fs').promises;
const path = require('path');
const FileAnalysisWorker = require('../../../src/workers/fileAnalysisWorker');
const { validateAnalysis } = require('../../../src/utils/jsonSchemaValidator');

// Mock dependencies
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
    stat: jest.fn(),
  },
}));

// Mock the validator
jest.mock('../../../src/utils/jsonSchemaValidator', () => ({
  validateAnalysis: jest.fn(),
}));

describe('FileAnalysisWorker', () => {
  let worker;
  let mockQueueManager;
  let mockLlmResponseSanitizer;
  let mockSqliteDb;
  let mockDeepseekClient;

  const validLLMResponse = {
    pois: [{
        filePath: 'test.js',
        poiType: 'Function',
        startLine: 1,
        endLine: 3,
        char: 0,
        context: 'function hello() {}',
        description: 'A function'
    }],
    relationships: []
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockQueueManager = {
      createWorker: jest.fn(),
    };

    mockLlmResponseSanitizer = {
      sanitize: jest.fn(),
    };

    mockSqliteDb = {
      beginTransaction: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn(),
      execute: jest.fn(),
    };

    mockDeepseekClient = {
      query: jest.fn(),
    };

    worker = new FileAnalysisWorker(
      mockQueueManager,
      mockLlmResponseSanitizer,
      mockSqliteDb,
      mockDeepseekClient
    );
  });

  // Test Case FAW-01
  test('processJob should successfully analyze a file and commit the transaction', async () => {
    const job = { data: { filePath: 'src/workers/fileAnalysisWorker.js' } };
    const fileContent = 'const x = 1;';
    
    fs.stat.mockResolvedValue({ size: 1024 });
    fs.readFile.mockResolvedValue(fileContent);
    mockDeepseekClient.query.mockResolvedValue('{}');
    mockLlmResponseSanitizer.sanitize.mockReturnValue(validLLMResponse);
    validateAnalysis.mockReturnValue({ valid: true });
    mockSqliteDb.beginTransaction.mockResolvedValue('test-transaction');
    mockSqliteDb.execute.mockResolvedValue();

    await worker.processJob(job);

    expect(mockSqliteDb.beginTransaction).toHaveBeenCalledTimes(1);
    expect(fs.readFile).toHaveBeenCalledWith(expect.any(String), 'utf-8');
    expect(mockDeepseekClient.query).toHaveBeenCalledWith(expect.stringContaining('<file_content>'));
    expect(mockLlmResponseSanitizer.sanitize).toHaveBeenCalled();
    expect(validateAnalysis).toHaveBeenCalledWith(validLLMResponse);
    expect(mockSqliteDb.execute).toHaveBeenCalled();
    expect(mockSqliteDb.commit).toHaveBeenCalledTimes(1);
    expect(mockSqliteDb.rollback).not.toHaveBeenCalled();
  });

  // Test Case FAW-02
  test('processJob should roll back the transaction if saving results fails', async () => {
    const job = { data: { filePath: 'src/workers/fileAnalysisWorker.js' } };
    const fileContent = 'const y = 2;';
    const dbError = new Error('DB write failed');

    fs.stat.mockResolvedValue({ size: 1024 });
    fs.readFile.mockResolvedValue(fileContent);
    mockDeepseekClient.query.mockResolvedValue('{}');
    mockLlmResponseSanitizer.sanitize.mockReturnValue(validLLMResponse);
    validateAnalysis.mockReturnValue({ valid: true });
    mockSqliteDb.beginTransaction.mockResolvedValue('test-transaction');
    mockSqliteDb.execute.mockRejectedValue(dbError);

    await expect(worker.processJob(job)).rejects.toThrow(dbError);

    expect(mockSqliteDb.beginTransaction).toHaveBeenCalledTimes(1);
    expect(mockSqliteDb.rollback).toHaveBeenCalledTimes(1);
    expect(mockSqliteDb.commit).not.toHaveBeenCalled();
  });

  // VULN-002 Test: Invalid LLM response
  test('processJob should throw an error if LLM response fails schema validation', async () => {
    const job = { data: { filePath: 'src/workers/fileAnalysisWorker.js' } };
    const fileContent = 'const z = 3;';
    const invalidResponse = { pois: [{ startLine: "1" }] }; // startLine should be integer

    fs.stat.mockResolvedValue({ size: 1024 });
    fs.readFile.mockResolvedValue(fileContent);
    mockDeepseekClient.query.mockResolvedValue('{}');
    mockLlmResponseSanitizer.sanitize.mockReturnValue(invalidResponse);
    validateAnalysis.mockReturnValue({ valid: false, errors: [{ instancePath: '/pois/0/startLine', message: 'should be integer' }] });

    await expect(worker.processJob(job)).rejects.toThrow('LLM response validation failed: /pois/0/startLine should be integer');
    expect(mockSqliteDb.beginTransaction).not.toHaveBeenCalled();
  });

  // Security Test: Path Traversal
  test('processJob should throw an error for path traversal attempts', async () => {
    const job = { data: { filePath: '../../../../etc/passwd' } };

    await expect(worker.processJob(job)).rejects.toThrow('Path traversal attempt detected');
  });

  // Security Test: File Size Limit
  test('processJob should throw an error for files exceeding the size limit', async () => {
    const job = { data: { filePath: 'src/workers/fileAnalysisWorker.js' } };
    fs.stat.mockResolvedValue({ size: 20 * 1024 * 1024 }); // 20MB

    await expect(worker.processJob(job)).rejects.toThrow('File exceeds size limit');
  });
});
