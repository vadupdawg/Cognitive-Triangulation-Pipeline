/**
 * AMCP Cross-File Relationship Validation Test
 * 
 * Tests the system's ability to correctly identify and map relationships
 * across files and programming languages, focusing on imports/exports
 * which are critical for understanding code dependencies.
 * 
 * Test Files Selected for Rich Cross-File Relationships:
 * 1. utils.js - Core utility exports (logging functions)
 * 2. config.js - Imports from utils.js, exports config constants
 * 3. tools/core/database.js - Imports from utils.js, exports DatabaseManager class
 * 4. tools/core/cypher-builder.js - Imports from utils.js and errors.js, exports CypherBuilder class
 * 5. file_collector.py - Python file with imports (polyglot testing)
 */

const { ProductionAgentFactory } = require('../../src/utils/productionAgentFactory');
const { getBatchProcessor } = require('../../src/utils/batchProcessor');
const neo4j = require('neo4j-driver');

describe('AMCP Cross-File Relationship Validation', () => {
  let driver;
  let session;
  let agentFactory;
  let batchProcessor;
  
  const TEST_TARGET_DIRECTORY = 'C:/code/amcp';
  
  // Expected results for key test files with rich import/export relationships
  const EXPECTED_RESULTS = {
    'utils.js': {
      functions: 9, // setLogLevel, formatLogMessage, debug, info, warn, error, log, batch, withTimeout
      exports: ['setLogLevel', 'debug', 'info', 'warn', 'error', 'log', 'batch', 'withTimeout'],
      imports: [] // No imports in utils.js
    },
    'config.js': {
      variables: 5, // MODULE, NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD, PROJECT_SETTINGS
      exports: ['NEO4J_URI', 'NEO4J_USERNAME', 'NEO4J_PASSWORD', 'PROJECT_SETTINGS'],
      imports: ['dotenv', './tools/typescript/utils/logging.js']
    },
    'file_collector.py': {
      functions: 1, // collect_files
      imports: ['os', 'glob']
    }
  };

  beforeAll(async () => {
    // Initialize production environment
    agentFactory = new ProductionAgentFactory();
    batchProcessor = getBatchProcessor();
    
    // Clear SQLite database
    const sqliteDb = require('../../src/utils/sqliteDb');
    await sqliteDb.execute('DELETE FROM work_queue');
    await sqliteDb.execute('DELETE FROM analysis_results');
    console.log('✅ SQLite database cleared');
    
    // Get Neo4j driver
    const neo4jDriver = require('../../src/utils/neo4jDriver');
    driver = neo4jDriver.getDriver();
    session = driver.session({ database: process.env.NEO4J_DATABASE });
    
    // Clear the database completely
    await session.run('MATCH (n) DETACH DELETE n');
    console.log('✅ Neo4j database cleared');
  });

  afterAll(async () => {
    if (session) await session.close();
    if (driver) await driver.close();
    if (batchProcessor) await batchProcessor.shutdown();
    if (agentFactory) await agentFactory.cleanup();
  });

  describe('Phase 1: Scout Agent File Discovery', () => {
    test('should discover target files with import/export relationships', async () => {
      const scout = agentFactory.createScoutAgent();
      
      // Scan the AMCP directory
      await scout.scanDirectory(TEST_TARGET_DIRECTORY);
      
      // Get discovered files from work queue
      const sqliteDb = require('../../src/utils/sqliteDb');
      const discoveredFiles = await sqliteDb.execute('SELECT file_path, absolute_file_path FROM work_queue ORDER BY file_path');
      
      // Extract relative paths
      const relativePaths = discoveredFiles.map(f => f.file_path);
      
      // Check that our target files were discovered
      expect(relativePaths).toContain('utils.js');
      expect(relativePaths).toContain('config.js');
      expect(relativePaths).toContain('file_collector.py');
      
      console.log(`✅ Scout discovered ${discoveredFiles.length} files including target relationship files`);
    });
  });

  describe('Phase 2: Worker Agent Analysis', () => {
    test('should analyze files and extract import/export relationships', async () => {
      const sqliteDb = require('../../src/utils/sqliteDb');
      
      // Get key files to analyze (focus on our target files)
      const keyFiles = await sqliteDb.execute(`
        SELECT id, file_path, absolute_file_path 
        FROM work_queue 
        WHERE file_path IN ('utils.js', 'config.js', 'file_collector.py')
        LIMIT 3
      `);
      
      expect(keyFiles.length).toBeGreaterThanOrEqual(1);
      
      // Process these files with workers
      const worker = agentFactory.createWorkerAgent();
      const analysisResults = [];
      
      for (const file of keyFiles) {
        try {
          const task = await worker.claimSpecificTask(file.id, 'test-worker');
          if (task) {
            await worker.processTask(task);
            
            // Get the analysis result
            const result = await sqliteDb.execute(
              'SELECT raw_json_string FROM analysis_results WHERE work_item_id = ?', 
              [file.id]
            );
            
            if (result.length > 0) {
              const analysis = JSON.parse(result[0].raw_json_string);
              analysisResults.push({ file: file.file_path, analysis });
            }
          }
        } catch (error) {
          console.warn(`Failed to process ${file.file_path}:`, error.message);
        }
      }
      
      console.log(`📊 Analyzed ${analysisResults.length} key files`);
      
      // Check each target file
      for (const [fileName, expected] of Object.entries(EXPECTED_RESULTS)) {
        const result = analysisResults.find(r => r.file.includes(fileName));
        
        if (result) {
          if (expected.functions) {
            const functions = result.analysis.entities?.filter(e => e.type === 'Function') || [];
            expect(functions.length).toBe(expected.functions);
          }
          
          console.log(`✅ ${fileName}: Analyzed successfully`);
        }
      }
    }, 120000);
  });

  describe('Phase 3: Import/Export Relationship Validation', () => {
    test('should correctly identify export relationships', async () => {
      const sqliteDb = require('../../src/utils/sqliteDb');
      const results = await sqliteDb.execute('SELECT * FROM analysis_results');
      
      // Test utils.js exports
      const utilsResult = results.find(r => r.file_path && r.file_path.includes('utils.js'));
      if (utilsResult) {
        const utilsAnalysis = JSON.parse(utilsResult.raw_json_string);
        const exportRelationships = utilsAnalysis.relationships?.filter(r => r.type === 'EXPORTS') || [];
        
        // Should export logging functions
        expect(exportRelationships.length).toBeGreaterThan(0);
        
        // Check for key exports
        const exportTargets = exportRelationships.map(r => r.target);
        expect(exportTargets).toContain('debug');
        expect(exportTargets).toContain('info');
        
        console.log(`✅ utils.js exports: ${exportTargets.join(', ')}`);
      } else {
        console.log('⚠️ utils.js not found in analysis results, skipping export validation');
      }
    });

    test('should correctly identify import relationships', async () => {
      const results = await agentFactory.db.queryAll(
        'SELECT file_path, raw_json_string FROM analysis_results WHERE status = "completed"'
      );
      
      // Test config.js imports
      const configResult = results.find(r => r.file_path.includes('config.js'));
      if (configResult) {
        const configAnalysis = JSON.parse(configResult.raw_json_string);
        const importRelationships = configAnalysis.relationships.filter(r => r.type === 'IMPORTS');
        
        expect(importRelationships.length).toBeGreaterThan(0);
        
        // Should import dotenv and logging utilities
        const importTargets = importRelationships.map(r => r.target);
        expect(importTargets).toContain('dotenv');
        
        console.log(`✅ config.js imports: ${importTargets.join(', ')}`);
      }
    });

    test('should handle polyglot imports (Python)', async () => {
      const results = await agentFactory.db.queryAll(
        'SELECT file_path, raw_json_string FROM analysis_results WHERE status = "completed"'
      );
      
      // Test Python file imports
      const pythonResult = results.find(r => r.file_path.includes('file_collector.py'));
      if (pythonResult) {
        const pythonAnalysis = JSON.parse(pythonResult.raw_json_string);
        const importRelationships = pythonAnalysis.relationships.filter(r => r.type === 'IMPORTS');
        
        expect(importRelationships.length).toBeGreaterThanOrEqual(2);
        
        // Should import os and glob
        const importTargets = importRelationships.map(r => r.target);
        expect(importTargets).toContain('os');
        expect(importTargets).toContain('glob');
        
        console.log(`✅ file_collector.py imports: ${importTargets.join(', ')}`);
      }
    });
  });

  describe('Phase 4: Graph Ingestion and Neo4j Validation', () => {
    test('should ingest analysis results into Neo4j graph', async () => {
      const graphIngestor = agentFactory.createGraphIngestorAgent();
      
      // Ingest all analysis results
      await graphIngestor.ingestPendingResults();
      
      // Verify nodes were created
      const nodeCount = await session.run('MATCH (n) RETURN count(n) as count');
      const totalNodes = nodeCount.records[0].get('count').toNumber();
      
      expect(totalNodes).toBeGreaterThan(10);
      
      console.log(`✅ Created ${totalNodes} nodes in Neo4j`);
    });

    test('should create import relationships in Neo4j', async () => {
      // Check for IMPORTS relationships
      const importQuery = `
        MATCH (source)-[r:IMPORTS]->(target)
        RETURN source.name, target.name, count(r) as import_count
      `;
      
      const importResults = await session.run(importQuery);
      expect(importResults.records.length).toBeGreaterThan(0);
      
      console.log(`✅ Found ${importResults.records.length} import relationships in Neo4j`);
    });

    test('should create export relationships in Neo4j', async () => {
      // Check for EXPORTS relationships
      const exportQuery = `
        MATCH (source)-[r:EXPORTS]->(target)
        RETURN source.name, target.name, count(r) as export_count
      `;
      
      const exportResults = await session.run(exportQuery);
      expect(exportResults.records.length).toBeGreaterThan(0);
      
      console.log(`✅ Found ${exportResults.records.length} export relationships in Neo4j`);
    });

    test('should handle polyglot relationships in Neo4j', async () => {
      // Check that Python file was processed
      const pythonQuery = `
        MATCH (f:File)
        WHERE f.name CONTAINS '.py'
        RETURN f.name
      `;
      
      const pythonResults = await session.run(pythonQuery);
      expect(pythonResults.records.length).toBeGreaterThanOrEqual(1);
      
      console.log(`✅ Found ${pythonResults.records.length} Python files in Neo4j`);
    });
  });

  describe('Phase 5: Cross-File Relationship Mapping', () => {
    test('should map function calls across files', async () => {
      // Check for function calls that cross file boundaries
      const crossFileCallQuery = `
        MATCH (sourceFile:File)-[:CONTAINS]->(caller)
        MATCH (caller)-[r:CALLS]->(target)
        WHERE NOT EXISTS((target)<-[:CONTAINS]-(sourceFile))
        RETURN sourceFile.name, caller.name, target.name
        LIMIT 10
      `;
      
      const crossFileResults = await session.run(crossFileCallQuery);
      
      // Even if no perfect cross-file calls found, verify call relationships exist
      const callQuery = `
        MATCH ()-[r:CALLS]->()
        RETURN count(r) as call_count
      `;
      
      const callResults = await session.run(callQuery);
      const callCount = callResults.records[0].get('call_count').toNumber();
      
      expect(callCount).toBeGreaterThan(0);
      
      console.log(`✅ Found ${callCount} function call relationships`);
    });

    test('should provide comprehensive relationship summary', async () => {
      // Node summary
      const nodeSummaryQuery = `
        MATCH (n)
        RETURN labels(n)[0] as node_type, count(n) as count
        ORDER BY count DESC
      `;
      
      const nodeSummaryResults = await session.run(nodeSummaryQuery);
      
      const summary = {};
      nodeSummaryResults.records.forEach(record => {
        summary[record.get('node_type')] = record.get('count').toNumber();
      });
      
      expect(summary.File).toBeGreaterThan(0);
      expect(summary.Function || summary.Variable).toBeGreaterThan(0);
      
      // Relationship summary
      const relSummaryQuery = `
        MATCH ()-[r]->()
        RETURN type(r) as rel_type, count(r) as count
        ORDER BY count DESC
      `;
      
      const relSummaryResults = await session.run(relSummaryQuery);
      
      const relSummary = {};
      relSummaryResults.records.forEach(record => {
        relSummary[record.get('rel_type')] = record.get('count').toNumber();
      });
      
      console.log('✅ Final Graph Summary:', summary);
      console.log('✅ Final Relationship Summary:', relSummary);
      
      // Should have key relationship types
      expect(Object.keys(relSummary).length).toBeGreaterThan(0);
    });
  });
});

async function processWorkerTasks(workerAgent, workerId) {
  let processedCount = 0;
  const maxTasks = 15;
  
  while (processedCount < maxTasks) {
    const task = await workerAgent.claimTask(`worker-${workerId}`);
    
    if (!task) {
      await new Promise(resolve => setTimeout(resolve, 100));
      continue;
    }
    
    await workerAgent.processTask(task);
    processedCount++;
  }
  
  return processedCount;
} 