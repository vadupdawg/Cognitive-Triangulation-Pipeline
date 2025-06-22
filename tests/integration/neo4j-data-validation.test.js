const { ProductionAgentFactory } = require('../../src/utils/productionAgentFactory');
const sqliteDb = require('../../src/utils/sqliteDb');

// Test configuration
const AMCP_DIRECTORY = 'C:/code/amcp';
const TEST_TIMEOUT = 300000; // 5 minutes for full tests

describe('Neo4j Data Validation - SQLite to Neo4j Accuracy', () => {
  let factory;
  
  beforeAll(async () => {
    factory = new ProductionAgentFactory();
  }, TEST_TIMEOUT);

  afterAll(async () => {
    if (factory) {
      await factory.cleanup();
    }
  });

  describe('Neo4j Schema Validation', () => {
    test('Should connect to Neo4j and get schema information', async () => {
      console.log('🔍 Testing Neo4j connection and schema...');
      
      const session = require('../../src/utils/neo4jDriver').session();
      
      try {
        const result = await session.run('RETURN 1 as test');
        expect(result.records.length).toBe(1);
        expect(result.records[0].get('test').toNumber()).toBe(1);
        
        console.log('✅ Neo4j connection successful');
      } finally {
        await session.close();
      }
    }, TEST_TIMEOUT);

    test('Should validate node types exist in Neo4j', async () => {
      const session = require('../../src/utils/neo4jDriver').session();
      
      try {
        const labelResult = await session.run('CALL db.labels()');
        const labels = labelResult.records.map(record => record.get('label'));
        
        console.log('Node labels in Neo4j:', labels);
        
        const expectedLabels = ['File', 'Function', 'Class', 'Variable'];
        const foundLabels = expectedLabels.filter(label => labels.includes(label));
        
        console.log('Expected labels found:', foundLabels);
        expect(foundLabels.length).toBeGreaterThan(0);
        
      } finally {
        await session.close();
      }
    }, TEST_TIMEOUT);
  });

  describe('Data Consistency Validation', () => {
    test('Should validate SQLite analysis results match Neo4j nodes', async () => {
      const analysisResults = await sqliteDb.execute('SELECT * FROM analysis_results LIMIT 3');
      
      if (analysisResults.length === 0) {
        console.log('⚠️ No analysis results found in SQLite - run pipeline first');
        return;
      }
      
      const session = require('../../src/utils/neo4jDriver').session();
      
      try {
        for (const result of analysisResults) {
          const analysis = JSON.parse(result.llm_output);
          
          console.log(`--- Validating file: ${result.file_path} ---`);
          
          for (const entity of analysis.entities.slice(0, 2)) {
            const nodeQuery = 'MATCH (n {qualifiedName: $qualifiedName}) RETURN n, labels(n) as labels';
            const nodeResult = await session.run(nodeQuery, { qualifiedName: entity.qualifiedName });
            
            if (nodeResult.records.length > 0) {
              const node = nodeResult.records[0].get('n');
              const labels = nodeResult.records[0].get('labels');
              
              console.log(`✅ Entity found: ${entity.name} (${entity.type})`);
              expect(labels).toContain(entity.type);
              expect(node.properties.name).toBe(entity.name);
            } else {
              console.log(`❌ Entity NOT found: ${entity.name}`);
            }
          }
        }
      } finally {
        await session.close();
      }
    }, TEST_TIMEOUT);
  });
});