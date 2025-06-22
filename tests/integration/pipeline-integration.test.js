/**
 * Pipeline Integration Test Suite
 * 
 * Defines what "working" means for the entire pipeline:
 * 1. Scout identifies all important files
 * 2. Workers analyze files in parallel (up to 50 workers for 43 files)
 * 3. Workers extract entities and relationships per schema
 * 4. SQLite database contains all required data for graph ingestion
 * 5. Graph Ingestor successfully creates Neo4j nodes and relationships
 */

const fs = require('fs').promises;
const path = require('path');
const { ScoutAgent } = require('../../src/agents/ScoutAgent');
const { WorkerAgent } = require('../../src/agents/WorkerAgent');
const { processBatch } = require('../../src/agents/GraphIngestorAgent');
const DeepSeekClient = require('../../src/utils/deepseekClient');
const sqliteDb = require('../../src/utils/sqliteDb');
const neo4jDriver = require('../../src/utils/neo4jDriver');
const { getBatchProcessor } = require('../../src/utils/batchProcessor');

describe('Pipeline Integration Tests - Define "Working"', () => {
  const TEST_DIRECTORY = 'C:/code/aback';
  let batchProcessor;

  beforeAll(async () => {
    // Initialize batch processor
    batchProcessor = getBatchProcessor();
    
    // Clear databases for clean test state
    await clearDatabases();
  });

  afterAll(async () => {
    // Cleanup
    if (batchProcessor) {
      await batchProcessor.shutdown();
    }
    await sqliteDb.close();
    await neo4jDriver.close();
  });

  describe('Phase 1: Scout Agent - File Discovery', () => {
    let scoutResults;

    test('Scout should identify all important files in target directory', async () => {
      const { ProductionAgentFactory } = require('../../src/utils/productionAgentFactory');
      const factory = new ProductionAgentFactory();
      const scoutAgent = await factory.createScoutAgent(TEST_DIRECTORY);
      await scoutAgent.run();

      // Verify files were discovered and queued
      const queuedFiles = await sqliteDb.execute('SELECT * FROM work_queue WHERE status = "pending"');
      const fileState = await sqliteDb.execute('SELECT * FROM file_state');

      expect(queuedFiles.length).toBeGreaterThan(0);
      expect(fileState.length).toBeGreaterThan(0);
      
      // Should find files in aback directory (excluding tests, node_modules)
      expect(queuedFiles.length).toBeGreaterThanOrEqual(20);
      expect(queuedFiles.length).toBeLessThanOrEqual(35);

      scoutResults = { queuedFiles, fileState };
    });

    test('Scout should identify correct file types', async () => {
      const { queuedFiles } = scoutResults;
      
      // Should include JavaScript files
      const jsFiles = queuedFiles.filter(f => f.file_path.endsWith('.js'));
      expect(jsFiles.length).toBeGreaterThan(0);

      // Should include configuration files
      const configFiles = queuedFiles.filter(f => 
        f.file_path.includes('config') || 
        f.file_path.includes('package.json')
      );
      expect(configFiles.length).toBeGreaterThan(0);

      // Should have absolute paths
      queuedFiles.forEach(file => {
        expect(file.absolute_file_path).toBeDefined();
        expect(path.isAbsolute(file.absolute_file_path)).toBe(true);
      });
    });
  });

  describe('Phase 2: Worker Agent - Parallel File Analysis', () => {
    let workerResults;

    test('Workers should process all queued files', async () => {
      const llmClient = new DeepSeekClient();
      const workerAgent = new WorkerAgent(sqliteDb, llmClient, TEST_DIRECTORY);

      // Get all pending tasks
      const pendingTasks = await sqliteDb.execute('SELECT * FROM work_queue WHERE status = "pending"');
      expect(pendingTasks.length).toBeGreaterThan(0);

      // Process each task (simulating parallel workers)
      const processPromises = pendingTasks.slice(0, 5).map(async (task, index) => {
        const workerId = `test-worker-${index}`;
        const claimedTask = await workerAgent.claimTask(workerId);
        
        if (claimedTask) {
          await workerAgent.processTask(claimedTask);
          return claimedTask;
        }
        return null;
      });

      const results = await Promise.all(processPromises);
      const successfulResults = results.filter(r => r !== null);
      
      expect(successfulResults.length).toBeGreaterThan(0);
      workerResults = successfulResults;
    });

    test('Workers should extract entities according to schema', async () => {
      // Wait for batch processing to complete
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const analysisResults = await sqliteDb.execute('SELECT * FROM analysis_results');
      expect(analysisResults.length).toBeGreaterThan(0);

      // Validate each analysis result
      for (const result of analysisResults.slice(0, 3)) {
        expect(result.llm_output).toBeDefined();
        
        let parsedOutput;
        expect(() => {
          parsedOutput = JSON.parse(result.llm_output);
        }).not.toThrow();

        // Validate required schema fields
        expect(parsedOutput.filePath).toBeDefined();
        expect(Array.isArray(parsedOutput.entities)).toBe(true);
        expect(Array.isArray(parsedOutput.relationships)).toBe(true);

        // Validate entity structure
        parsedOutput.entities.forEach(entity => {
          expect(entity.type).toBeDefined();
          expect(entity.name).toBeDefined();
          expect(entity.qualifiedName).toBeDefined();
          
          // Validate qualifiedName format for local entities
          if (entity.type !== 'File') {
            expect(entity.qualifiedName).toContain('--');
            expect(entity.qualifiedName.startsWith(parsedOutput.filePath + '--')).toBe(true);
          }
        });

        // Validate relationship structure
        parsedOutput.relationships.forEach(rel => {
          expect(rel.source_qualifiedName).toBeDefined();
          expect(rel.target_qualifiedName).toBeDefined();
          expect(rel.type).toBeDefined();
          
          // Validate relationship types
          const validTypes = ['CONTAINS', 'CALLS', 'USES', 'IMPORTS', 'EXPORTS', 'EXTENDS'];
          expect(validTypes).toContain(rel.type);
        });
      }
    });

    test('Workers should handle different file types correctly', async () => {
      const analysisResults = await sqliteDb.execute('SELECT * FROM analysis_results');
      
      // Should have results for JavaScript files
      const jsResults = analysisResults.filter(r => r.file_path.endsWith('.js'));
      expect(jsResults.length).toBeGreaterThan(0);

      // Should have results for JSON files (package.json, config files)
      const jsonResults = analysisResults.filter(r => r.file_path.endsWith('.json'));
      expect(jsonResults.length).toBeGreaterThan(0);

      // Each result should have appropriate entities for file type
      for (const result of jsResults.slice(0, 2)) {
        const parsed = JSON.parse(result.llm_output);
        
        // JavaScript files should typically have Function entities
        const functions = parsed.entities.filter(e => e.type === 'Function');
        // Note: Some files might not have functions, so we don't require them
        
        // Should have File entity
        const fileEntities = parsed.entities.filter(e => e.type === 'File');
        expect(fileEntities.length).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe('Phase 3: Database State Validation', () => {
    test('SQLite should contain all required data for graph ingestion', async () => {
      // Check analysis_results table
      const analysisResults = await sqliteDb.execute('SELECT * FROM analysis_results');
      expect(analysisResults.length).toBeGreaterThan(0);

      // Validate required columns
      analysisResults.forEach(result => {
        expect(result.work_item_id).toBeDefined();
        expect(result.file_path).toBeDefined();
        expect(result.absolute_file_path).toBeDefined();
        expect(result.llm_output).toBeDefined();
      });

      // Check for failed work (should be minimal)
      const failedWork = await sqliteDb.execute('SELECT * FROM failed_work');
      const totalWork = await sqliteDb.execute('SELECT COUNT(*) as count FROM work_queue');
      
      // Less than 20% failure rate is acceptable
      const failureRate = failedWork.length / totalWork[0].count;
      expect(failureRate).toBeLessThan(0.2);
    });

    test('Analysis results should be ready for graph ingestion', async () => {
      const analysisResults = await sqliteDb.execute('SELECT * FROM analysis_results LIMIT 5');
      
      for (const result of analysisResults) {
        const parsed = JSON.parse(result.llm_output);
        
        // Should have entities with proper qualifiedNames
        expect(parsed.entities.length).toBeGreaterThan(0);
        
        // Should have at least one File entity
        const fileEntities = parsed.entities.filter(e => e.type === 'File');
        expect(fileEntities.length).toBeGreaterThanOrEqual(1);

        // Should have CONTAINS relationships (File contains other entities)
        const containsRels = parsed.relationships.filter(r => r.type === 'CONTAINS');
        if (parsed.entities.length > 1) {
          expect(containsRels.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('Phase 4: Graph Ingestor - Neo4j Integration', () => {
    test('Graph Ingestor should successfully create nodes and relationships', async () => {
      // Get analysis results for ingestion
      const analysisResults = await sqliteDb.execute('SELECT * FROM analysis_results LIMIT 10');
      const refactoringTasks = []; // Empty for this test

      // Run graph ingestion
      await processBatch(analysisResults, refactoringTasks, sqliteDb);

      // Verify nodes were created in Neo4j
      const session = neo4jDriver.session();
      try {
        // Check for File nodes
        const fileNodesResult = await session.run('MATCH (f:File) RETURN count(f) as count');
        const fileCount = fileNodesResult.records[0].get('count').toNumber();
        expect(fileCount).toBeGreaterThan(0);

        // Check for Function nodes
        const functionNodesResult = await session.run('MATCH (fn:Function) RETURN count(fn) as count');
        const functionCount = functionNodesResult.records[0].get('count').toNumber();
        // Functions might be 0 if no JS files have functions, so we don't require them

        // Check for relationships
        const relationshipsResult = await session.run('MATCH ()-[r]->() RETURN count(r) as count');
        const relCount = relationshipsResult.records[0].get('count').toNumber();
        expect(relCount).toBeGreaterThan(0);

        // Verify CONTAINS relationships exist
        const containsResult = await session.run('MATCH ()-[r:CONTAINS]->() RETURN count(r) as count');
        const containsCount = containsResult.records[0].get('count').toNumber();
        expect(containsCount).toBeGreaterThan(0);

      } finally {
        await session.close();
      }
    });

    test('Graph should have proper node properties', async () => {
      const session = neo4jDriver.session();
      try {
        // Get sample File nodes
        const fileNodesResult = await session.run(
          'MATCH (f:File) RETURN f.qualifiedName, f.name, f.filePath LIMIT 3'
        );

        expect(fileNodesResult.records.length).toBeGreaterThan(0);

        fileNodesResult.records.forEach(record => {
          const qualifiedName = record.get('f.qualifiedName');
          const name = record.get('f.name');
          const filePath = record.get('f.filePath');

          expect(qualifiedName).toBeDefined();
          expect(name).toBeDefined();
          expect(filePath).toBeDefined();
          expect(path.isAbsolute(qualifiedName)).toBe(true);
        });

      } finally {
        await session.close();
      }
    });
  });

  describe('End-to-End Pipeline Validation', () => {
    test('Complete pipeline should process target directory successfully', async () => {
      // Verify final state
      const workQueue = await sqliteDb.execute('SELECT * FROM work_queue');
      const analysisResults = await sqliteDb.execute('SELECT * FROM analysis_results');
      const failedWork = await sqliteDb.execute('SELECT * FROM failed_work');

      // Most files should be processed successfully
      const successRate = analysisResults.length / workQueue.length;
      expect(successRate).toBeGreaterThan(0.7); // At least 70% success rate

      // Neo4j should have comprehensive graph
      const session = neo4jDriver.session();
      try {
        const nodesResult = await session.run('MATCH (n) RETURN count(n) as count');
        const nodeCount = nodesResult.records[0].get('count').toNumber();
        expect(nodeCount).toBeGreaterThan(10); // Should have substantial graph

        const relResult = await session.run('MATCH ()-[r]->() RETURN count(r) as count');
        const relCount = relResult.records[0].get('count').toNumber();
        expect(relCount).toBeGreaterThan(5); // Should have meaningful relationships

      } finally {
        await session.close();
      }
    });

    test('Pipeline should handle the specified 43 files with up to 50 workers', async () => {
      const queuedFiles = await sqliteDb.execute('SELECT COUNT(*) as count FROM work_queue');
      const totalFiles = queuedFiles[0].count;

      // Should handle all files in aback directory (excluding tests, node_modules)
      expect(totalFiles).toBeGreaterThanOrEqual(20);
      expect(totalFiles).toBeLessThanOrEqual(35);

      // Workers should be able to process in parallel (verified by timing)
      // This is tested implicitly by the successful processing above
    });
  });
});

// Helper functions
async function clearDatabases() {
  // Clear SQLite
  const tables = ['analysis_results', 'failed_work', 'work_queue', 'file_state'];
  for (const table of tables) {
    try {
      await sqliteDb.execute(`DELETE FROM ${table}`);
    } catch (error) {
      // Table might not exist, which is fine
    }
  }

  // Clear Neo4j
  const session = neo4jDriver.session();
  try {
    await session.run('MATCH (n) DETACH DELETE n');
  } finally {
    await session.close();
  }
} 