//
// GraphIngestorAgent.test.js
//
// This file contains the granular unit and integration tests for the GraphIngestorAgent.
// It follows the London School of TDD, focusing on mocking collaborators (SQLite, Neo4j)
// and verifying the interactions (commands sent) with them.
//
// Test Plan-- docs/test-plans/GraphIngestorAgent_test_plan.md
//

// Mock collaborators before any imports
const mockNeo4jTransaction = {
  run: jest.fn(),
  commit: jest.fn(),
  rollback: jest.fn(),
};

const mockNeo4jSession = {
  beginTransaction: jest.fn(() => mockNeo4jTransaction),
  close: jest.fn(),
};

const mockNeo4jDriver = {
  session: jest.fn(() => mockNeo4jSession),
  close: jest.fn(),
};

const mockSqliteDb = {
  execute: jest.fn(),
};

// Mock the modules themselves
jest.mock('../../src/utils/neo4jDriver', () => mockNeo4jDriver);
jest.mock('../../src/utils/sqliteDb', () => mockSqliteDb);

const {
  processBatch,
  prepareGraphData,
  handleRefactoring,
  createNodes,
  createRelationships
} = require('../../src/agents/GraphIngestorAgent');


describe('GraphIngestorAgent', () => {

  beforeEach(() => {
    // Clear mock history before each test
    jest.clearAllMocks();
    // Spy on console.error and console.warn to suppress logs in tests
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore console mocks
    console.error.mockRestore();
    console.warn.mockRestore();
  });


  // Test Case Group 5.1-- Refactoring Logic (handleRefactoring)
  describe('5.1. Refactoring Logic (handleRefactoring)', () => {
    // Test Case 1.1
    test("1.1: A 'DELETE' task generates the correct Cypher query.", async () => {
      const batch = [{
        type: 'DELETE',
        old_path: 'src/old/file.js'
      }];
      await handleRefactoring(mockNeo4jTransaction, batch);
      expect(mockNeo4jTransaction.run).toHaveBeenCalledWith(
        'MATCH (n {filePath: $filePath}) DETACH DELETE n', {
          filePath: 'src/old/file.js'
        }
      );
    });

    // Test Case 1.2
    test("1.2: A 'RENAME' task generates the correct Cypher query.", async () => {
      const batch = [{
        type: 'RENAME',
        old_path: 'src/old/file.js',
        new_path: 'src/new/file.js'
      }];
      await handleRefactoring(mockNeo4jTransaction, batch);
      expect(mockNeo4jTransaction.run).toHaveBeenCalledWith(
        expect.stringContaining('MATCH (n {filePath: $old_path})'), {
          old_path: 'src/old/file.js',
          new_path: 'src/new/file.js'
        }
      );
    });
  });

  // Test Case Group 5.2-- Data Preparation and Validation (prepareGraphData)
  describe('5.2. Data Preparation and Validation (prepareGraphData)', () => {
    const validAnalysisResult = {
      id: 1,
      llm_output: JSON.stringify({
        filePath: "src/app.js",
        entities: [{
          type: 'File',
          name: 'app.js',
          qualifiedName: 'src/app.js'
        }, {
          type: 'Function',
          name: 'myFunc',
          qualifiedName: 'src/app.js--myFunc'
        }, ],
        relationships: [{
          source_qualifiedName: 'src/app.js',
          target_qualifiedName: 'src/app.js--myFunc',
          type: 'CONTAINS'
        }, ],
      }),
    };

    // Test Case 2.1
    test('2.1: Correctly parses valid data into nodes and relationships.', () => {
      const {
        nodesByLabel,
        relsByType
      } = prepareGraphData([validAnalysisResult]);
      expect(nodesByLabel.has('File')).toBe(true);
      expect(nodesByLabel.get('File').length).toBe(1);
      expect(nodesByLabel.has('Function')).toBe(true);
      expect(relsByType.has('CONTAINS')).toBe(true);
      expect(relsByType.get('CONTAINS').length).toBe(1);
    });

    // Test Case 2.2 (New Security Test)
    test('2.2: Skips records with invalid JSON.', () => {
      const invalidJsonResult = {
        id: 2,
        llm_output: '{ "filePath": "bad.js", "entities": [ ... '
      };
      const {
        nodesByLabel,
        relsByType
      } = prepareGraphData([invalidJsonResult, validAnalysisResult]);
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('invalid JSON'), expect.any(String));
      // Should still process the valid record
      expect(nodesByLabel.get('File').length).toBe(1);
    });

    // Test Case 2.3 (New Security Test)
    test('2.3: Skips records that fail schema validation.', () => {
      const invalidSchemaResult = {
        id: 3,
        llm_output: JSON.stringify({
          filePath: 'missing_entities.js' /* missing entities and relationships */
        }),
      };
      const {
        nodesByLabel,
        relsByType
      } = prepareGraphData([invalidSchemaResult, validAnalysisResult]);
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('schema validation failure'), expect.any(Array));
      // Should still process the valid record
      expect(nodesByLabel.get('File').length).toBe(1);
    });

    // Test Case 2.4 (New Security Test)
    test('2.4: Skips entities and relationships with non-whitelisted types.', () => {
      const nonWhitelistedResult = {
        id: 4,
        llm_output: JSON.stringify({
          filePath: "src/bad.js",
          entities: [{
            type: 'EvilNode',
            name: 'bad',
            qualifiedName: 'src/bad.js--bad'
          }],
          relationships: [{
            source_qualifiedName: 'a',
            target_qualifiedName: 'b',
            type: 'INJECTS_CYPHER'
          }],
        }),
      };
      const {
        nodesByLabel,
        relsByType
      } = prepareGraphData([nonWhitelistedResult]);
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("invalid label 'EvilNode'"));
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("invalid type 'INJECTS_CYPHER'"));
      expect(nodesByLabel.size).toBe(0);
      expect(relsByType.size).toBe(0);
    });
  });


  // Test Case Group 5.3-- Batch Processing Orchestration (processBatch)
  describe('5.3. Batch Processing Orchestration (processBatch)', () => {
    // Test Case 3.1
    test("3.1: Full successful workflow.", async () => {
      const analysisBatch = [{
        id: 1,
        llm_output: JSON.stringify({
          filePath: "a.js",
          entities: [{
            type: 'File',
            name: 'a.js',
            qualifiedName: 'a.js'
          }],
          relationships: []
        })
      }];
      const refactoringBatch = [{
        id: 1,
        type: 'DELETE',
        old_path: 'b.js'
      }];

      await processBatch(analysisBatch, refactoringBatch);

      expect(mockNeo4jDriver.session).toHaveBeenCalled();
      expect(mockNeo4jSession.beginTransaction).toHaveBeenCalled();

      // Verify that the correct queries were run, implicitly testing the internal functions
      expect(mockNeo4jTransaction.run).toHaveBeenCalledWith(expect.stringContaining('DETACH DELETE n'), { filePath: 'b.js' });
      expect(mockNeo4jTransaction.run).toHaveBeenCalledWith(expect.stringContaining('MERGE (n:`File`'), expect.any(Object));
      
      expect(mockNeo4jTransaction.commit).toHaveBeenCalled();
      expect(mockNeo4jTransaction.rollback).not.toHaveBeenCalled();
      
      expect(mockSqliteDb.execute).toHaveBeenCalledWith(expect.stringContaining("UPDATE analysis_results SET status = ? WHERE id IN (?)"), ["ingested", 1]);
      expect(mockSqliteDb.execute).toHaveBeenCalledWith(expect.stringContaining("UPDATE refactoring_tasks SET status = ? WHERE id IN (?)"), ["completed", 1]);
    });

    // Test Case 3.2
    test("3.2: Neo4j query failure causes rollback.", async () => {
      mockNeo4jTransaction.run.mockRejectedValue(new Error('Neo4j Error'));
      const analysisBatch = [{
        id: 1,
        llm_output: JSON.stringify({
          filePath: "a.js",
          entities: [{
            type: 'File',
            qualifiedName: 'a.js',
            name: 'a.js'
          }],
          relationships: []
        })
      }];

      await expect(processBatch(analysisBatch, [])).rejects.toThrow('Neo4j Error');

      expect(mockNeo4jTransaction.commit).not.toHaveBeenCalled();
      expect(mockNeo4jTransaction.rollback).toHaveBeenCalled();
      expect(mockSqliteDb.execute).not.toHaveBeenCalled();
    });

    // Test Case 3.3
    test("3.3: An empty batch does nothing.", async () => {
      await processBatch([], []);
      expect(mockNeo4jDriver.session).not.toHaveBeenCalled();
      expect(mockSqliteDb.execute).not.toHaveBeenCalled();
    });
  });
});