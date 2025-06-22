/**
 * AMCP Production Pipeline Test
 * 
 * This is a PRODUCTION-GRADE test that runs the actual pipeline with:
 * - Real DeepSeek LLM API calls (20-30 seconds per file)
 * - Real database operations (SQLite + Neo4j)
 * - Real file analysis and import/export detection
 * - Real cross-file relationship mapping
 * 
 * Tests 5 key files from AMCP codebase to validate the system works end-to-end.
 */

const { ProductionAgentFactory } = require('../../src/utils/productionAgentFactory');
const { getBatchProcessor } = require('../../src/utils/batchProcessor');
const neo4j = require('neo4j-driver');

describe('AMCP Production Pipeline - REAL LLM TESTING', () => {
  let agentFactory;
  let batchProcessor;
  let driver;
  let session;
  
  // Target directory for AMCP analysis
  const AMCP_DIRECTORY = 'C:/code/amcp';
  
  // 5 key files for production testing (rich import/export relationships)
  const TARGET_FILES = [
    'utils.js',           // Exports: debug, info, warn, error, log, setLogLevel, batch, withTimeout
    'config.js',          // Imports from utils.js, exports config constants
    'neo4j-wrapper.js',   // Imports from utils.js, exports database functions
    'file_collector.py',  // Python: imports os, glob
    'neo4j-mcp.js'        // Complex file with imports and exports
  ];

  beforeAll(async () => {
    console.log('🚀 Starting PRODUCTION-GRADE pipeline test...');
    console.log('⚠️  This test will make REAL LLM API calls and take 2-3 minutes to complete');
    
    // Initialize production environment with REAL components
    agentFactory = new ProductionAgentFactory();
    batchProcessor = getBatchProcessor();
    
    // Clear SQLite database (disable foreign keys temporarily)
    const sqliteDb = require('../../src/utils/sqliteDb');
    await sqliteDb.execute('PRAGMA foreign_keys = OFF');
    await sqliteDb.execute('DELETE FROM analysis_results');
    await sqliteDb.execute('DELETE FROM work_queue');
    await sqliteDb.execute('PRAGMA foreign_keys = ON');
    console.log('✅ SQLite database cleared');
    
    // Get Neo4j driver and clear database
    const neo4jDriver = require('../../src/utils/neo4jDriver');
    driver = neo4jDriver.getDriver();
    session = driver.session({ database: process.env.NEO4J_DATABASE });
    await session.run('MATCH (n) DETACH DELETE n');
    console.log('✅ Neo4j database cleared');
    
    console.log('✅ Production environment initialized');
  }, 60000);

  afterAll(async () => {
    if (session) await session.close();
    if (driver) await driver.close();
    if (batchProcessor) await batchProcessor.shutdown();
    if (agentFactory) await agentFactory.cleanup();
    console.log('✅ Production environment cleaned up');
  });

  describe('Phase 1: Scout Discovery (Real Directory Scan)', () => {
    test('should discover target files in AMCP directory', async () => {
      console.log(`🔍 Scanning ${AMCP_DIRECTORY} for target files...`);
      
      const scout = await agentFactory.createScoutAgent(AMCP_DIRECTORY);
      await scout.run();
      
      // Get discovered files from work queue
      const sqliteDb = require('../../src/utils/sqliteDb');
      const discoveredFiles = await sqliteDb.execute('SELECT file_path, absolute_file_path FROM work_queue ORDER BY file_path');
      
      console.log(`📊 Scout discovered ${discoveredFiles.length} files total`);
      
      // Verify our target files were discovered (handle Windows paths)
      const relativePaths = discoveredFiles.map(f => f.file_path);
      const foundTargets = [];
      
      for (const targetFile of TARGET_FILES) {
        // Handle both forward and backward slashes for cross-platform compatibility
        const found = relativePaths.find(path => {
          const normalizedPath = path.replace(/\\/g, '/');
          const normalizedTarget = targetFile.replace(/\\/g, '/');
          return normalizedPath.includes(normalizedTarget) || normalizedPath === normalizedTarget;
        });
        if (found) {
          foundTargets.push(found);
          console.log(`✅ Found target file: ${found}`);
        } else {
          console.warn(`⚠️  Target file not found: ${targetFile}`);
          console.warn(`   Available files: ${relativePaths.slice(0, 5).join(', ')}...`);
        }
      }
      
      expect(foundTargets.length).toBeGreaterThanOrEqual(3);
      console.log(`✅ Scout successfully discovered ${foundTargets.length}/${TARGET_FILES.length} target files`);
    }, 30000);
  });

  describe('Phase 2: Production Worker Analysis (Real LLM Calls)', () => {
    test('should analyze target files with REAL DeepSeek LLM', async () => {
      console.log('🤖 Starting REAL LLM analysis of target files...');
      console.log('⏱️  Expected duration: 2-3 minutes for 5 files');
      
      const sqliteDb = require('../../src/utils/sqliteDb');
      
      // Get our target files from work queue
      const targetConditions = TARGET_FILES.map(f => `file_path LIKE '%${f}'`).join(' OR ');
      const targetTasks = await sqliteDb.execute(`
        SELECT id, file_path, absolute_file_path 
        FROM work_queue 
        WHERE ${targetConditions}
        LIMIT 5
      `);
      
      console.log(`📋 Found ${targetTasks.length} target files to analyze`);
      expect(targetTasks.length).toBeGreaterThanOrEqual(3);
      
      // Process each file with REAL WorkerAgent + REAL LLM
      const worker = agentFactory.createWorkerAgent();
      const analysisResults = [];
      
      for (const task of targetTasks) {
        console.log(`\n🔄 Processing ${task.file_path} (ID: ${task.id})`);
        console.log(`📁 Absolute path: ${task.absolute_file_path}`);
        
        const startTime = Date.now();
        
        try {
          // Claim the task
          const claimedTask = await worker.claimSpecificTask(task.id, 'production-test-worker');
          
          if (claimedTask) {
            // Process with REAL LLM (this will take 20-30 seconds)
            await worker.processTask(claimedTask);
            
            const duration = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`✅ Completed ${task.file_path} in ${duration}s`);
            
            // Force flush batch processor to get immediate results
            await batchProcessor.forceFlush();
            
            // Get the analysis result
            const result = await sqliteDb.execute(
              'SELECT raw_json_string, status FROM analysis_results WHERE work_item_id = ?', 
              [task.id]
            );
            
            if (result.length > 0 && result[0].status === 'completed') {
              const analysis = JSON.parse(result[0].raw_json_string);
              analysisResults.push({ 
                file: task.file_path, 
                analysis,
                duration: parseFloat(duration)
              });
              
              console.log(`📊 Analysis contains: ${analysis.entities?.length || 0} entities, ${analysis.relationships?.length || 0} relationships`);
            } else {
              console.warn(`⚠️  No completed analysis found for ${task.file_path}`);
            }
          } else {
            console.warn(`⚠️  Could not claim task for ${task.file_path}`);
          }
        } catch (error) {
          const duration = ((Date.now() - startTime) / 1000).toFixed(1);
          console.error(`❌ Failed to process ${task.file_path} after ${duration}s:`, error.message);
        }
      }
      
      console.log(`\n📈 PRODUCTION ANALYSIS COMPLETE:`);
      console.log(`✅ Successfully analyzed: ${analysisResults.length}/${targetTasks.length} files`);
      
      const totalDuration = analysisResults.reduce((sum, r) => sum + r.duration, 0);
      const avgDuration = totalDuration / analysisResults.length;
      console.log(`⏱️  Total time: ${totalDuration.toFixed(1)}s, Average: ${avgDuration.toFixed(1)}s per file`);
      
      expect(analysisResults.length).toBeGreaterThanOrEqual(2);
      expect(avgDuration).toBeGreaterThan(10); // Should take at least 10 seconds per file for real LLM
      
      // Validate import/export relationships were detected
      let totalImports = 0;
      let totalExports = 0;
      
      for (const result of analysisResults) {
        const imports = result.analysis.relationships?.filter(r => r.type === 'IMPORTS') || [];
        const exports = result.analysis.relationships?.filter(r => r.type === 'EXPORTS') || [];
        
        totalImports += imports.length;
        totalExports += exports.length;
        
        console.log(`📊 ${result.file}: ${imports.length} imports, ${exports.length} exports`);
        
        if (imports.length > 0) {
          console.log(`  📥 Imports: ${imports.map(i => i.target).join(', ')}`);
        }
        if (exports.length > 0) {
          console.log(`  📤 Exports: ${exports.map(e => e.target).join(', ')}`);
        }
      }
      
      console.log(`\n🔗 TOTAL RELATIONSHIPS DETECTED:`);
      console.log(`📥 Total imports: ${totalImports}`);
      console.log(`📤 Total exports: ${totalExports}`);
      
      expect(totalImports + totalExports).toBeGreaterThan(5); // Should find meaningful relationships
      
    }, 300000); // 5 minute timeout for real LLM calls
  });

  describe('Phase 3: Production Graph Ingestion', () => {
    test('should ingest analysis results into Neo4j graph', async () => {
      console.log('📊 Starting graph ingestion of production analysis results...');
      
      // Get analysis results from SQLite
      const sqliteDb = require('../../src/utils/sqliteDb');
      const results = await sqliteDb.execute('SELECT * FROM analysis_results WHERE status = "completed"');
      
      console.log(`📋 Found ${results.length} completed analysis results to ingest`);
      expect(results.length).toBeGreaterThan(0);
      
      // Run graph ingestion
      const graphIngestor = agentFactory.createGraphIngestorAgent();
      await graphIngestor.ingestAnalysisResults();
      
      // Verify nodes were created in Neo4j
      const nodeCountResult = await session.run(`
        MATCH (n) 
        RETURN labels(n) as label, count(n) as count
        ORDER BY count DESC
      `);
      
      let totalNodes = 0;
      console.log(`\n📊 NEO4J NODES CREATED:`);
      for (const record of nodeCountResult.records) {
        const label = record.get('label')[0];
        const count = record.get('count').toNumber();
        totalNodes += count;
        console.log(`  ${label}: ${count} nodes`);
      }
      
      expect(totalNodes).toBeGreaterThan(10); // Should create meaningful number of nodes
      
      // Verify relationships were created
      const relCountResult = await session.run(`
        MATCH ()-[r]->() 
        RETURN type(r) as relType, count(r) as count
        ORDER BY count DESC
      `);
      
      let totalRels = 0;
      console.log(`\n🔗 NEO4J RELATIONSHIPS CREATED:`);
      for (const record of relCountResult.records) {
        const relType = record.get('relType');
        const count = record.get('count').toNumber();
        totalRels += count;
        console.log(`  ${relType}: ${count} relationships`);
      }
      
      expect(totalRels).toBeGreaterThan(5); // Should create meaningful relationships
      
      console.log(`\n✅ Graph ingestion complete: ${totalNodes} nodes, ${totalRels} relationships`);
    }, 60000);
  });

  describe('Phase 4: Cross-File Relationship Validation', () => {
    test('should validate cross-file import/export relationships in Neo4j', async () => {
      console.log('🔍 Validating cross-file relationships in production graph...');
      
      // Query for import relationships
      const importQuery = await session.run(`
        MATCH (source)-[r:IMPORTS]->(target)
        RETURN source.filePath as sourceFile, target.name as targetName, target.filePath as targetFile
        LIMIT 20
      `);
      
      console.log(`\n📥 IMPORT RELATIONSHIPS FOUND:`);
      const imports = [];
      for (const record of importQuery.records) {
        const sourceFile = record.get('sourceFile');
        const targetName = record.get('targetName');
        const targetFile = record.get('targetFile');
        
        imports.push({ sourceFile, targetName, targetFile });
        console.log(`  ${sourceFile} IMPORTS ${targetName} FROM ${targetFile || 'external'}`);
      }
      
      // Query for export relationships
      const exportQuery = await session.run(`
        MATCH (source)-[r:EXPORTS]->(target)
        RETURN source.filePath as sourceFile, target.name as targetName
        LIMIT 20
      `);
      
      console.log(`\n📤 EXPORT RELATIONSHIPS FOUND:`);
      const exports = [];
      for (const record of exportQuery.records) {
        const sourceFile = record.get('sourceFile');
        const targetName = record.get('targetName');
        
        exports.push({ sourceFile, targetName });
        console.log(`  ${sourceFile} EXPORTS ${targetName}`);
      }
      
      // Validate we found meaningful cross-file relationships
      expect(imports.length + exports.length).toBeGreaterThan(3);
      
      // Look for specific expected patterns
      const utilsExports = exports.filter(e => e.sourceFile?.includes('utils.js'));
      const configImports = imports.filter(i => i.sourceFile?.includes('config.js'));
      
      if (utilsExports.length > 0) {
        console.log(`✅ Found utils.js exports: ${utilsExports.map(e => e.targetName).join(', ')}`);
      }
      
      if (configImports.length > 0) {
        console.log(`✅ Found config.js imports: ${configImports.map(i => i.targetName).join(', ')}`);
      }
      
      console.log(`\n🎯 PRODUCTION VALIDATION COMPLETE:`);
      console.log(`📥 Cross-file imports detected: ${imports.length}`);
      console.log(`📤 Cross-file exports detected: ${exports.length}`);
      console.log(`✅ System successfully mapped import/export relationships!`);
      
    }, 30000);
  });
}); 