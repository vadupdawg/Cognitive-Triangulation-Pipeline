const GraphBuilder = require('../../src/agents/GraphBuilder');
const path = require('path');
const fs = require('fs');

const TEST_DB_PATH = path.join(__dirname, '..', 'test-data', 'test_graph_builder_simple.sqlite');
const NEO4J_URI = process.env.NEO4J_URI || 'neo4j://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'test1234';

describe('GraphBuilder Agent - Simple Tests', () => {
    beforeAll(() => {
        // Ensure test db directory exists
        if (!fs.existsSync(path.dirname(TEST_DB_PATH))) {
            fs.mkdirSync(path.dirname(TEST_DB_PATH), { recursive: true });
        }
    });

    afterAll(() => {
        // Clean up test database file
        if (fs.existsSync(TEST_DB_PATH)) {
            try {
                fs.unlinkSync(TEST_DB_PATH);
            } catch (error) {
                // Ignore cleanup errors
            }
        }
    });

    test('GB-C-01: should initialize and connect to databases', async () => {
        const config = {
            databasePath: TEST_DB_PATH,
            neo4jUri: NEO4J_URI,
            neo4jUser: NEO4J_USER,
            neo4jPassword: NEO4J_PASSWORD,
        };
        
        let agent;
        try {
            agent = new GraphBuilder(config);
            await agent.init();
            
            expect(agent.neo4jDriver).toBeDefined();
            expect(agent.db).toBeDefined();
        } finally {
            if (agent) {
                await agent.close();
            }
        }
    });

    test('GB-C-02: should throw an error for invalid Neo4j connection', async () => {
        const config = {
            databasePath: TEST_DB_PATH,
            neo4jUri: 'neo4j://localhost:9999', // Invalid URI
            neo4jUser: NEO4J_USER,
            neo4jPassword: NEO4J_PASSWORD,
        };
        
        let agent;
        try {
            agent = new GraphBuilder(config);
            await expect(agent.init()).rejects.toThrow();
        } finally {
            if (agent) {
                await agent.close();
            }
        }
    });
}); 