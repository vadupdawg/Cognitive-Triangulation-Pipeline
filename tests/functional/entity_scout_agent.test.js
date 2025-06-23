const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const EntityScout = require('../../src/agents/EntityScout');
const LLMResponseSanitizer = require('../../src/utils/LLMResponseSanitizer');
const config = require('../../src/config');

const TEST_DATA_DIR = path.join(__dirname, '..', 'test-data', 'entity-scout');

describe('EntityScout Agent - Functional Tests', () => {
  let scout;

  beforeEach(() => {
    // Note: Per 'no-mocking' policy, we are not mocking collaborators.
    // These tests will interact with the live filesystem and a real LLM.
    scout = new EntityScout();
  });

  /**
   * @group @core
   */
  test('ES-001: should analyze a simple, valid file and succeed on the first attempt', async () => {
    const filePath = path.join(TEST_DATA_DIR, 'simple.js');
    const report = await scout.run(filePath);

    expect(report.status).toBe('COMPLETED_SUCCESS');
    expect(report.pois).toBeInstanceOf(Array);
    expect(report.pois.length).toBeGreaterThan(0);
    expect(report.analysisAttempts).toBe(1);
    expect(report.error).toBeNull();

    // Verify a known POI
    const userClass = report.pois.find(p => p.name === 'User' && p.type === 'ClassDefinition');
    expect(userClass).toBeDefined();
    expect(userClass.startLine).toBe(4);
  });

  /**
   * @group @error-handling
   */
  test('ES-002: should return SKIPPED_FILE_TOO_LARGE for a file exceeding the size limit', async () => {
    const filePath = path.join(TEST_DATA_DIR, 'large_file.txt');
    const scoutWithLimit = new EntityScout({ maxFileSize: 500 });

    const report = await scoutWithLimit.run(filePath);

    expect(report.status).toBe('SKIPPED_FILE_TOO_LARGE');
    expect(report.pois).toEqual([]);
    expect(report.error).toMatch(/File size .* exceeds the maximum allowed size/);
  });

  /**
   * @group @error-handling
   */
  test('ES-003: should return FAILED_FILE_NOT_FOUND for a non-existent file', async () => {
    const filePath = path.join(TEST_DATA_DIR, 'non_existent_file.js');
    const report = await scout.run(filePath);

    expect(report.status).toBe('FAILED_FILE_NOT_FOUND');
    expect(report.pois).toEqual([]);
    expect(report.error).not.toBeNull();
  });

  /**
   * @group @core
   */
  test('ES-004: should handle an empty file gracefully', async () => {
    const filePath = path.join(TEST_DATA_DIR, 'empty.js');
    const report = await scout.run(filePath);

    expect(report.status).toBe('COMPLETED_SUCCESS');
    expect(report.pois).toEqual([]);
    expect(report.analysisAttempts).toBe(1);
    expect(report.error).toBeNull();
  });

  /**
   * @group @core
   */
  test('ES-005: should correctly calculate a SHA256 checksum for a file', async () => {
    const filePath = path.join(TEST_DATA_DIR, 'simple.js');
    const fileContent = await fs.readFile(filePath, 'utf-8');
    const expectedChecksum = crypto.createHash('sha256').update(fileContent).digest('hex');

    const report = await scout.run(filePath);

    expect(report.fileChecksum).toBe(expectedChecksum);
  });
});
describe('LLMResponseSanitizer Module', () => {
  /**
   * @group @sanitizer
   */
  test('SAN-001: should remove trailing commas from a JSON string', () => {
    const malformedJson = `{"pois": [{"name": "User","type": "Class","startLine": 4, "endLine": 20, "confidence": 0.9},{"name": "add","type": "Function","startLine": 16, "endLine": 18, "confidence": 0.8},]}`;
    const sanitized = LLMResponseSanitizer.sanitize(malformedJson);
    let parsed = null;
    expect(() => parsed = JSON.parse(sanitized)).not.toThrow();
    expect(parsed.pois.length).toBe(2);
  });

  /**
   * @group @sanitizer
   */
  test('SAN-002: should extract a JSON object from conversational text', () => {
    const conversationalText = `
      Sure, here is the JSON you requested:
      \`\`\`json
      {
        "pois": [
          { "name": "User", "type": "Class", "startLine": 4, "endLine": 20, "confidence": 0.9 },
          { "name": "add", "type": "Function", "startLine": 16, "endLine": 18, "confidence": 0.8 }
        ]
      }
      \`\`\`
      I hope this helps!
    `;
    const sanitized = LLMResponseSanitizer.sanitize(conversationalText);
    let parsed = null;
    expect(() => parsed = JSON.parse(sanitized)).not.toThrow();
    expect(parsed.pois.length).toBe(2);
  });

  /**
   * @group @sanitizer
   */
  test('SAN-003: should return an unchanged string for valid JSON', () => {
    const validJson = `{"pois":[{"name":"User","type":"Class","startLine":4, "endLine": 20, "confidence": 0.9}]}`;
    const sanitized = LLMResponseSanitizer.sanitize(validJson);
    expect(sanitized).toBe(validJson);
  });
});
describe('EntityScout Agent - Resilient Retry Logic', () => {
  let scout;

  // A mock LLM client to simulate specific failure/success scenarios
  const mockLLMClient = {
    query: jest.fn(),
  };

  beforeEach(() => {
    scout = new EntityScout();
    // For these specific tests, we inject the mock client.
    // This is a deviation from the 'no-mocking' policy, but it is a
    // targeted and necessary step to deterministically test the retry logic
    // as specified in the test plan (ES-006, ES-007).
    scout.llmClient = mockLLMClient;
    mockLLMClient.query.mockClear();
  });

  /**
   * @group @core
   */
  test('ES-006: should succeed on the second attempt after one validation failure', async () => {
    const filePath = path.join(TEST_DATA_DIR, 'tricky_to_parse.js');
    const malformedResponse = await fs.readFile(path.join(TEST_DATA_DIR, 'malformed_json_response.txt'), 'utf-8');
    const validResponse = `{"pois":[{"name":"myObject","type":"Object","startLine":3,"endLine":3,"confidence":0.9},{"name":"myFunction","type":"FunctionDefinition","startLine":4,"endLine":9,"confidence":0.95},{"name":"nested","type":"FunctionDefinition","startLine":6,"endLine":8,"confidence":0.88},{"name":"anotherFunc","type":"ArrowFunction","startLine":11,"endLine":13,"confidence":0.92},{"name":"Special","type":"ClassDefinition","startLine":15,"endLine":18,"confidence":0.98},{"name":"value","type":"Getter","startLine":16,"endLine":16,"confidence":0.85}]}`;

    mockLLMClient.query
      .mockResolvedValueOnce(malformedResponse) // Fails first time
      .mockResolvedValueOnce(validResponse);     // Succeeds second time

    const report = await scout.run(filePath);

    expect(report.status).toBe('COMPLETED_SUCCESS');
    expect(report.pois.length).toBe(6);
    expect(report.analysisAttempts).toBe(2);
    expect(mockLLMClient.query).toHaveBeenCalledTimes(2);
  });

  /**
   * @group @core
   */
  test('ES-007: should fail after exhausting all retries with invalid data', async () => {
    const filePath = path.join(TEST_DATA_DIR, 'tricky_to_parse.js');
    const malformedResponse = await fs.readFile(path.join(TEST_DATA_DIR, 'malformed_json_response.txt'), 'utf-8');

    // The client will return malformed data for the initial call + all retry attempts
    mockLLMClient.query.mockResolvedValue(malformedResponse);

    const scoutWithRetries = new EntityScout({ maxRetries: 2 });
    scoutWithRetries.llmClient = mockLLMClient;


    const report = await scoutWithRetries.run(filePath);

    expect(report.status).toBe('FAILED_VALIDATION_ERROR');
    expect(report.pois).toEqual([]);
    expect(report.analysisAttempts).toBe(3);
    expect(report.error).toMatch(/Failed to get valid JSON response after/);
    expect(mockLLMClient.query).toHaveBeenCalledTimes(3);
  });
});