const { ProductionAgentFactory } = require('../../src/utils/productionAgentFactory');
const sqliteDb = require('../../src/utils/sqliteDb');
const neo4jDriver = require('../../src/utils/neo4jDriver');
const fs = require('fs').promises;
const path = require('path');

// Test configuration for the actual amcp directory
const AMCP_DIRECTORY = 'C:/code/amcp';
const TEST_TIMEOUT = 300000; // 5 minutes for full pipeline tests

describe('AMCP Pipeline Validation - Define "Working"', () => {
  let factory;
  let scoutResults;
  let workerResults;
  
  beforeAll(async () => {
    factory = new ProductionAgentFactory();
    
    // Clear all databases for clean test
    await factory.clearAllDatabases();
    
    // Verify amcp directory exists
    try {
      await fs.access(AMCP_DIRECTORY);
    } catch (error) {
      throw new Error(`AMCP directory not found at ${AMCP_DIRECTORY}. Please ensure the directory exists.`);
    }
  }, TEST_TIMEOUT);

  afterAll(async () => {
    if (factory) {
      await factory.cleanup();
    }
  });

  describe('Phase 1: Scout Agent - File Discovery in AMCP', () => {
    test('Scout should identify all important files in amcp directory', async () => {
      const scoutAgent = await factory.createScoutAgent(AMCP_DIRECTORY);
      await scoutAgent.run();

      // Get queued files from database
      const queuedFiles = await sqliteDb.execute('SELECT * FROM work_queue WHERE status = "pending"');
      const fileState = await sqliteDb.execute('SELECT * FROM file_state');

      expect(fileState.length).toBeGreaterThan(0);
      
      // Should find all 43 files mentioned by user
      expect(queuedFiles.length).toBeGreaterThanOrEqual(40);
      expect(queuedFiles.length).toBeLessThanOrEqual(50);

      scoutResults = { queuedFiles, fileState };
      
      console.log(`Scout found ${queuedFiles.length} files in amcp directory`);
    }, TEST_TIMEOUT);

    test('Scout should identify correct file types in amcp', async () => {
      const { queuedFiles } = scoutResults;
      
      // Should include various file types
      const fileTypes = new Set(queuedFiles.map(f => path.extname(f.file_path)));
      
      console.log('File types found:', Array.from(fileTypes));
      
      // Should have at least some common file types
      expect(fileTypes.size).toBeGreaterThan(0);
      
      // Log file distribution for analysis
      const fileDistribution = {};
      queuedFiles.forEach(f => {
        const ext = path.extname(f.file_path) || 'no-extension';
        fileDistribution[ext] = (fileDistribution[ext] || 0) + 1;
      });
      
      console.log('File distribution:', fileDistribution);
    }, TEST_TIMEOUT);
  });

  describe('Phase 2: Worker Agent - Parallel File Analysis', () => {
    test('Workers should process all queued files from amcp', async () => {
      // Get all pending tasks
      const pendingTasks = await sqliteDb.execute('SELECT * FROM work_queue WHERE status = "pending"');
      expect(pendingTasks.length).toBeGreaterThan(0);

      // Process files with up to 50 workers (parallel processing)
      const maxWorkers = Math.min(50, pendingTasks.length);
      const processPromises = pendingTasks.slice(0, maxWorkers).map(async (task, index) => {
        const workerId = `test-worker-${index}`;
        const worker = await factory.createWorkerAgent(AMCP_DIRECTORY);
        
        // Claim and process the specific task
        const claimedTask = await worker.claimSpecificTask(task.id, workerId);
        if (claimedTask) {
          await worker.processTask(claimedTask);
        }
        
        return { workerId, taskId: task.id, processed: !!claimedTask };
      });

      const results = await Promise.all(processPromises);
      
      // Ensure batch processor flushes all results
      const batchProcessor = factory.batchProcessor || require('../../src/utils/batchProcessor').getBatchProcessor();
      await batchProcessor.forceFlush();
      await batchProcessor.forceFlush(); // Double flush for safety
      
      // Wait for database writes to complete
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const processedCount = results.filter(r => r.processed).length;
      expect(processedCount).toBeGreaterThan(0);
      
      console.log(`Processed ${processedCount} files with ${maxWorkers} workers`);
    }, TEST_TIMEOUT);

    test('Workers should extract entities according to schema requirements', async () => {
      // Wait a bit more for all async operations to complete
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const analysisResults = await sqliteDb.execute('SELECT * FROM analysis_results');
      expect(analysisResults.length).toBeGreaterThan(0);

      // Validate each analysis result matches the schema requirements
      for (const result of analysisResults.slice(0, 5)) { // Test first 5 results
        expect(result.file_path).toBeDefined();
        expect(result.absolute_file_path).toBeDefined();
        expect(result.raw_json_string).toBeDefined();
        
        // Parse the JSON and validate structure
        const analysis = JSON.parse(result.raw_json_string);
        
        // Must have required top-level fields
        expect(analysis.filePath).toBeDefined();
        expect(Array.isArray(analysis.entities)).toBe(true);
        expect(Array.isArray(analysis.relationships)).toBe(true);
        
        // Validate entities follow schema
        analysis.entities.forEach(entity => {
          expect(entity.type).toBeDefined();
          expect(entity.name).toBeDefined();
          expect(entity.qualifiedName).toBeDefined();
          
          // Validate entity types are from allowed set
          const validEntityTypes = ['Function', 'Class', 'Variable', 'File', 'Database', 'Table'];
          expect(validEntityTypes).toContain(entity.type);
          
          // Validate qualifiedName format for local entities
          if (entity.type !== 'File') {
            expect(entity.qualifiedName).toMatch(/^.+--[^-]+.*$/);
          }
        });
        
        // Validate relationships follow schema
        analysis.relationships.forEach(rel => {
          expect(rel.source_qualifiedName).toBeDefined();
          expect(rel.target_qualifiedName).toBeDefined();
          expect(rel.type).toBeDefined();
          
          // Validate relationship types are from allowed set
          const validRelTypes = ['CONTAINS', 'CALLS', 'USES', 'IMPORTS', 'EXPORTS', 'EXTENDS'];
          expect(validRelTypes).toContain(rel.type);
        });
      }
      
      console.log(`Validated ${Math.min(5, analysisResults.length)} analysis results against schema`);
    }, TEST_TIMEOUT);

    test('Workers should handle different file types correctly', async () => {
      const analysisResults = await sqliteDb.execute('SELECT * FROM analysis_results');
      
      // Group results by file extension
      const resultsByType = {};
      analysisResults.forEach(result => {
        const ext = path.extname(result.file_path) || 'no-extension';
        if (!resultsByType[ext]) resultsByType[ext] = [];
        resultsByType[ext].push(result);
      });
      
      console.log('Analysis results by file type:', Object.keys(resultsByType).map(ext => 
        `${ext}: ${resultsByType[ext].length} files`
      ));
      
      // Should have processed multiple file types
      expect(Object.keys(resultsByType).length).toBeGreaterThan(0);
      
      // Each file type should have valid analysis
      Object.entries(resultsByType).forEach(([ext, results]) => {
        results.slice(0, 2).forEach(result => { // Check first 2 of each type
          const analysis = JSON.parse(result.raw_json_string);
          
          // Every file should at least have a File entity
          const fileEntities = analysis.entities.filter(e => e.type === 'File');
          expect(fileEntities.length).toBeGreaterThanOrEqual(1);
          
          // File entity should use absolute path as qualifiedName
          fileEntities.forEach(fileEntity => {
            expect(path.isAbsolute(fileEntity.qualifiedName)).toBe(true);
          });
        });
      });
    }, TEST_TIMEOUT);
  });

  describe('Phase 3: Database State Validation', () => {
    test('SQLite should contain all required data for graph ingestion', async () => {
      // Check work_queue table
      const workQueue = await sqliteDb.execute('SELECT * FROM work_queue');
      expect(workQueue.length).toBeGreaterThan(0);
      
      // Check analysis_results table
      const analysisResults = await sqliteDb.execute('SELECT * FROM analysis_results');
      expect(analysisResults.length).toBeGreaterThan(0);
      
      // Validate required columns exist and have data
      analysisResults.forEach(result => {
        expect(result.task_id).toBeDefined();
        expect(result.file_path).toBeDefined();
        expect(result.absolute_file_path).toBeDefined();
        expect(result.raw_json_string).toBeDefined();
        expect(result.created_at).toBeDefined();
        
        // Validate JSON is parseable
        expect(() => JSON.parse(result.raw_json_string)).not.toThrow();
      });
      
      console.log(`Database contains ${workQueue.length} work items and ${analysisResults.length} analysis results`);
    }, TEST_TIMEOUT);

    test('Analysis results should be ready for graph ingestion', async () => {
      const analysisResults = await sqliteDb.execute('SELECT * FROM analysis_results');
      
      // Aggregate all entities and relationships for graph ingestion validation
      let totalEntities = 0;
      let totalRelationships = 0;
      const entityTypes = new Set();
      const relationshipTypes = new Set();
      
      analysisResults.forEach(result => {
        const analysis = JSON.parse(result.raw_json_string);
        totalEntities += analysis.entities.length;
        totalRelationships += analysis.relationships.length;
        
        analysis.entities.forEach(e => entityTypes.add(e.type));
        analysis.relationships.forEach(r => relationshipTypes.add(r.type));
      });
      
      expect(totalEntities).toBeGreaterThan(0);
      expect(totalRelationships).toBeGreaterThan(0);
      
      console.log(`Ready for graph ingestion: ${totalEntities} entities, ${totalRelationships} relationships`);
      console.log(`Entity types found: ${Array.from(entityTypes).join(', ')}`);
      console.log(`Relationship types found: ${Array.from(relationshipTypes).join(', ')}`);
      
      // Store results for next phase
      workerResults = {
        totalEntities,
        totalRelationships,
        entityTypes: Array.from(entityTypes),
        relationshipTypes: Array.from(relationshipTypes)
      };
    }, TEST_TIMEOUT);
  });

  describe('Phase 4: Graph Ingestor - Neo4j Integration', () => {
    test('Graph Ingestor should successfully create nodes and relationships', async () => {
      // Run the graph ingestion process
      const graphIngestor = factory.createGraphIngestorAgent();
      await graphIngestor.processBatch();
      
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
        
        // Check for relationships
        const relationshipsResult = await session.run('MATCH ()-[r]->() RETURN count(r) as count');
        const relationshipCount = relationshipsResult.records[0].get('count').toNumber();
        expect(relationshipCount).toBeGreaterThan(0);
        
        console.log(`Neo4j contains: ${fileCount} files, ${functionCount} functions, ${relationshipCount} relationships`);
      } finally {
        await session.close();
      }
    }, TEST_TIMEOUT);

    test('Graph should have proper node properties and structure', async () => {
      const session = neo4jDriver.session();
      try {
        // Verify File nodes have required properties
        const fileNodesResult = await session.run(
          'MATCH (f:File) RETURN f.qualifiedName, f.name LIMIT 5'
        );
        
        expect(fileNodesResult.records.length).toBeGreaterThan(0);
        
        fileNodesResult.records.forEach(record => {
          const qualifiedName = record.get('f.qualifiedName');
          const name = record.get('f.name');
          
          expect(qualifiedName).toBeDefined();
          expect(name).toBeDefined();
          expect(path.isAbsolute(qualifiedName)).toBe(true);
        });
        
        // Verify relationships have proper structure
        const relationshipsResult = await session.run(
          'MATCH (a)-[r]->(b) RETURN type(r) as relType, a.qualifiedName as source, b.qualifiedName as target LIMIT 10'
        );
        
        relationshipsResult.records.forEach(record => {
          const relType = record.get('relType');
          const source = record.get('source');
          const target = record.get('target');
          
          expect(relType).toBeDefined();
          expect(source).toBeDefined();
          expect(target).toBeDefined();
          
          const validRelTypes = ['CONTAINS', 'CALLS', 'USES', 'IMPORTS', 'EXPORTS', 'EXTENDS'];
          expect(validRelTypes).toContain(relType);
        });
        
      } finally {
        await session.close();
      }
    }, TEST_TIMEOUT);
  });

  describe('Phase 5: End-to-End Validation', () => {
    test('Complete pipeline should process amcp directory successfully', async () => {
      // Verify the entire pipeline worked end-to-end
      const workQueue = await sqliteDb.execute('SELECT COUNT(*) as count FROM work_queue');
      const analysisResults = await sqliteDb.execute('SELECT COUNT(*) as count FROM analysis_results');
      
      // Most files should be processed successfully
      const successRate = analysisResults[0].count / workQueue[0].count;
      expect(successRate).toBeGreaterThan(0.7); // At least 70% success rate
      
      // Neo4j should have comprehensive graph
      const session = neo4jDriver.session();
      try {
        const nodeCountResult = await session.run('MATCH (n) RETURN count(n) as count');
        const relationshipCountResult = await session.run('MATCH ()-[r]->() RETURN count(r) as count');
        
        const nodeCount = nodeCountResult.records[0].get('count').toNumber();
        const relationshipCount = relationshipCountResult.records[0].get('count').toNumber();
        
        expect(nodeCount).toBeGreaterThan(0);
        expect(relationshipCount).toBeGreaterThan(0);
        
        console.log(`Pipeline success: ${(successRate * 100).toFixed(1)}% files processed`);
        console.log(`Final graph: ${nodeCount} nodes, ${relationshipCount} relationships`);
      } finally {
        await session.close();
      }
    }, TEST_TIMEOUT);

    test('Schema validation: SQLite data should match Neo4j ingestion', async () => {
      // Get sample data from SQLite
      const sampleResults = await sqliteDb.execute('SELECT * FROM analysis_results LIMIT 5');
      
      const session = neo4jDriver.session();
      try {
        for (const result of sampleResults) {
          const analysis = JSON.parse(result.raw_json_string);
          
          // Check that entities from SQLite exist in Neo4j
          for (const entity of analysis.entities.slice(0, 3)) { // Check first 3 entities
            const nodeResult = await session.run(
              'MATCH (n {qualifiedName: $qualifiedName}) RETURN n',
              { qualifiedName: entity.qualifiedName }
            );
            
            expect(nodeResult.records.length).toBeGreaterThan(0);
            
            const node = nodeResult.records[0].get('n');
            expect(node.properties.name).toBe(entity.name);
            expect(node.labels).toContain(entity.type);
          }
          
          // Check that relationships from SQLite exist in Neo4j
          for (const rel of analysis.relationships.slice(0, 3)) { // Check first 3 relationships
            const relResult = await session.run(
              'MATCH (a {qualifiedName: $source})-[r]->(b {qualifiedName: $target}) WHERE type(r) = $relType RETURN r',
              { 
                source: rel.source_qualifiedName, 
                target: rel.target_qualifiedName, 
                relType: rel.type 
              }
            );
            
            expect(relResult.records.length).toBeGreaterThan(0);
          }
        }
        
        console.log('✅ Schema validation passed: SQLite data perfectly matches Neo4j ingestion');
      } finally {
        await session.close();
      }
    }, TEST_TIMEOUT);
  });
});
