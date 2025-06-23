const GraphBuilder = require('./src/agents/GraphBuilder');
const neo4j = require('neo4j-driver');
const path = require('path');

const TEST_DB_PATH = path.join(__dirname, 'test-persist-nodes.sqlite');
const NEO4J_URI = process.env.NEO4J_URI || 'neo4j://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'test1234';

let testDriver;

// Helper function to clear Neo4j
const clearNeo4j = async () => {
    console.log('Clearing Neo4j...');
    const session = testDriver.session();
    try {
        await session.run('MATCH (n) DETACH DELETE n');
        console.log('✓ Neo4j cleared');
    } finally {
        await session.close();
    }
};

// Helper function to count nodes
const countNodes = async () => {
    const session = testDriver.session();
    try {
        const result = await session.run('MATCH (p:POI) RETURN count(p) AS count');
        return result.records[0].get('count').low;
    } finally {
        await session.close();
    }
};

async function testPersistNodes() {
    console.log('=== Testing _persistNodes Method ===');
    
    try {
        // Setup test Neo4j driver
        console.log('Connecting to Neo4j...');
        testDriver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
        await testDriver.verifyConnectivity();
        console.log('✓ Neo4j connected');
        
        // Clear any existing data
        await clearNeo4j();
        
        // Test GB-PN-01: should persist new POIs as nodes in Neo4j
        console.log('\n--- Test GB-PN-01: should persist new POIs as nodes in Neo4j ---');
        
        const agent = new GraphBuilder({ 
            databasePath: TEST_DB_PATH, 
            neo4jUri: NEO4J_URI, 
            neo4jUser: NEO4J_USER, 
            neo4jPassword: NEO4J_PASSWORD 
        });
        await agent.init();
        console.log('✓ GraphBuilder initialized');

        // Create test POI map with 5 POIs
        const poiMap = new Map();
        for (let i = 1; i <= 5; i++) {
            poiMap.set(`test-upid-${i}`, { 
                id: `test-upid-${i}`, 
                type: 'FUNCTION', 
                name: `testFunc${i}` 
            });
        }
        console.log('✓ Created POI map with 5 POIs');

        // Persist the nodes
        await agent._persistNodes(poiMap);
        console.log('✓ Nodes persisted');

        // Verify 5 nodes were created
        const nodeCount1 = await countNodes();
        console.log(`✓ Node count after first persist: ${nodeCount1}`);
        
        if (nodeCount1 === 5) {
            console.log('✅ GB-PN-01 PASSED: 5 POIs persisted correctly');
        } else {
            console.log(`❌ GB-PN-01 FAILED: Expected 5 nodes, got ${nodeCount1}`);
        }

        await agent.close();
        
        // Test GB-PN-02: should be idempotent and not create duplicate nodes
        console.log('\n--- Test GB-PN-02: should be idempotent and not create duplicate nodes ---');
        
        const agent2 = new GraphBuilder({ 
            databasePath: TEST_DB_PATH, 
            neo4jUri: NEO4J_URI, 
            neo4jUser: NEO4J_USER, 
            neo4jPassword: NEO4J_PASSWORD 
        });
        await agent2.init();
        console.log('✓ New GraphBuilder initialized');

        // Create a single POI map
        const singlePoiMap = new Map([
            ['test-upid-1', { id: 'test-upid-1', type: 'FUNCTION', name: 'testFunc1' }]
        ]);
        console.log('✓ Created single POI map');

        // Clear database first
        await clearNeo4j();
        
        // Persist the same POI twice
        await agent2._persistNodes(singlePoiMap);
        console.log('✓ First persist completed');
        
        await agent2._persistNodes(singlePoiMap);
        console.log('✓ Second persist completed');

        // Verify only 1 node exists
        const nodeCount2 = await countNodes();
        console.log(`✓ Node count after idempotent test: ${nodeCount2}`);
        
        if (nodeCount2 === 1) {
            console.log('✅ GB-PN-02 PASSED: Idempotent behavior confirmed');
        } else {
            console.log(`❌ GB-PN-02 FAILED: Expected 1 node, got ${nodeCount2}`);
        }

        await agent2.close();
        
        console.log('\n=== All _persistNodes Tests Completed ===');
        
    } catch (error) {
        console.error('Test failed:', error);
    } finally {
        // Cleanup
        if (testDriver) {
            await testDriver.close();
            console.log('✓ Test Neo4j driver closed');
        }
    }
}

testPersistNodes(); 