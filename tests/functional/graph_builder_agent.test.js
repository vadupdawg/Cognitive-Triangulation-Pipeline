const GraphBuilder = require('../../src/agents/GraphBuilder');
const DatabaseManager = require('../../src/utils/sqliteDb');
const neo4j = require('neo4j-driver');
const path = require('path');
const fs = require('fs');

const TEST_DB_PATH = path.join(__dirname, '..', 'test-data', 'test_graph_builder.sqlite');
const NEO4J_URI = process.env.NEO4J_URI || 'neo4j://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'password';

let dbManager;
let db;
let driver;

// Helper function to clear Neo4j
const clearNeo4j = async () => {
    const session = driver.session({ database: process.env.NEO4J_DATABASE || 'neo4j' });
    try {
        await session.run('MATCH (n) DETACH DELETE n');
    } finally {
        await session.close();
    }
};

// Helper function to setup SQLite
const setupSqlite = async () => {
    dbManager = new DatabaseManager(TEST_DB_PATH);
    db = dbManager.getDb();
    db.exec(`
        CREATE TABLE IF NOT EXISTS file_analysis_reports (
            id TEXT PRIMARY KEY,
            file_path TEXT,
            report JSON
        );
    `);
    db.exec(`
        CREATE TABLE IF NOT EXISTS project_analysis_summaries (
            id TEXT PRIMARY KEY,
            summary JSON
        );
    `);
};

describe('GraphBuilder Agent - Functional Tests', () => {
    beforeAll(async () => {
        // Ensure test db directory exists
        if (!fs.existsSync(path.dirname(TEST_DB_PATH))) {
            fs.mkdirSync(path.dirname(TEST_DB_PATH), { recursive: true });
        }
        // Create and verify Neo4j driver connection
        driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
        await driver.verifyConnectivity();
        await setupSqlite();
    });

    beforeEach(async () => {
        await clearNeo4j();
        db.exec('DELETE FROM file_analysis_reports');
        db.exec('DELETE FROM project_analysis_summaries');
    });

    afterAll(async () => {
        if (driver) {
            await driver.close();
        }
        if (dbManager) {
            dbManager.close();
        }
        // Clean up the test database file with error handling
        try {
            fs.unlinkSync(TEST_DB_PATH);
        } catch (error) {
            // Ignore file cleanup errors
            console.warn('Could not clean up test database file:', error.message);
        }
    });

    // Test cases will be implemented here
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
            await agent.init(); // Assuming an async init method for connections
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

    test('GB-C-03: should throw an error if neo4jUser is not provided', () => {
        const config = {
            databasePath: TEST_DB_PATH,
            neo4jUri: NEO4J_URI,
            neo4jPassword: NEO4J_PASSWORD,
        };
        expect(() => new GraphBuilder(config)).toThrow('neo4jUser is required in configuration');
    });

    test('GB-C-04: should throw an error if neo4jPassword is not provided', () => {
        const config = {
            databasePath: TEST_DB_PATH,
            neo4jUri: NEO4J_URI,
            neo4jUser: NEO4J_USER,
        };
        expect(() => new GraphBuilder(config)).toThrow('neo4jPassword is required in configuration');
    });

    describe('run method (integrated)', () => {
        test('GB-R-02: should persist nodes from the database', async () => {
            const agent = new GraphBuilder({ databasePath: TEST_DB_PATH, neo4jUri: NEO4J_URI, neo4jUser: NEO4J_USER, neo4jPassword: NEO4J_PASSWORD });
            await agent.init();

            // Insert POI data into SQLite
            const stmt = db.prepare('INSERT INTO file_analysis_reports (id, report) VALUES (?, ?)');
            db.transaction(() => {
                for (let i = 1; i <= 5; i++) {
                    const report = { id: `test-upid-${i}`, type: 'FUNCTION', name: `testFunc${i}` };
                    stmt.run(`test-upid-${i}`, JSON.stringify(report));
                }
            })();

            await agent.run();

            const session = driver.session({ database: process.env.NEO4J_DATABASE || 'neo4j' });
            const result = await session.run('MATCH (p:POI) RETURN count(p) AS count');
            await session.close();
            expect(result.records[0].get('count').low).toBe(5);
            await agent.close();
        });

        test('GB-R-03: should be idempotent and not create duplicate nodes on second run', async () => {
            const agent = new GraphBuilder({ databasePath: TEST_DB_PATH, neo4jUri: NEO4J_URI, neo4jUser: NEO4J_USER, neo4jPassword: NEO4J_PASSWORD });
            await agent.init();
            
            const report = { id: 'test-upid-1', type: 'FUNCTION', name: 'testFunc1' };
            db.prepare('INSERT INTO file_analysis_reports (id, report) VALUES (?, ?)').run('test-upid-1', JSON.stringify(report));

            await agent.run(); // First run
            await agent.run(); // Second run

            const session = driver.session({ database: process.env.NEO4J_DATABASE || 'neo4j' });
            const result = await session.run('MATCH (p:POI) RETURN count(p) AS count');
            await session.close();
            expect(result.records[0].get('count').low).toBe(1);
            await agent.close();
        });

        test('GB-R-04: should create relationships from the database', async () => {
            const agent = new GraphBuilder({ databasePath: TEST_DB_PATH, neo4jUri: NEO4J_URI, neo4jUser: NEO4J_USER, neo4jPassword: NEO4J_PASSWORD });
            await agent.init();
            
            // Insert POIs first
            const poiStmt = db.prepare('INSERT INTO file_analysis_reports (id, report) VALUES (?, ?)');
            poiStmt.run('source-node', JSON.stringify({ id: 'source-node', type: 'FUNCTION' }));
            poiStmt.run('target-node', JSON.stringify({ id: 'target-node', type: 'FUNCTION' }));

            // Insert relationship summary
            const summary = { relationships: [{ sourcePoi: 'source-node', targetPoi: 'target-node', type: 'CALLS', confidence: 0.9, explanation: 'test' }] };
            db.prepare('INSERT INTO project_analysis_summaries (id, summary) VALUES (?, ?)').run('summary-1', JSON.stringify(summary));

            await agent.run();

            const session = driver.session({ database: process.env.NEO4J_DATABASE || 'neo4j' });
            const result = await session.run("MATCH (:POI {id: 'source-node'})-[r:CALLS]->(:POI {id: 'target-node'}) RETURN count(r) AS count");
            await session.close();
            expect(result.records[0].get('count').low).toBe(1);
            await agent.close();
        });

        test('GB-R-05: should be idempotent and not create duplicate relationships on second run', async () => {
            const agent = new GraphBuilder({ databasePath: TEST_DB_PATH, neo4jUri: NEO4J_URI, neo4jUser: NEO4J_USER, neo4jPassword: NEO4J_PASSWORD });
            await agent.init();
            
            const poiStmt = db.prepare('INSERT INTO file_analysis_reports (id, report) VALUES (?, ?)');
            poiStmt.run('source-node', JSON.stringify({ id: 'source-node', type: 'FUNCTION' }));
            poiStmt.run('target-node', JSON.stringify({ id: 'target-node', type: 'FUNCTION' }));
            const summary = { relationships: [{ sourcePoi: 'source-node', targetPoi: 'target-node', type: 'CALLS', confidence: 0.9, explanation: 'test' }] };
            db.prepare('INSERT INTO project_analysis_summaries (id, summary) VALUES (?, ?)').run('summary-1', JSON.stringify(summary));

            await agent.run(); // First run
            await agent.run(); // Second run

            const session = driver.session({ database: process.env.NEO4J_DATABASE || 'neo4j' });
            const result = await session.run("MATCH ()-[r:CALLS]->() RETURN count(r) AS count");
            await session.close();
            expect(result.records[0].get('count').low).toBe(1);
            await agent.close();
        });

        test('GB-R-06: should ignore relationships with types not in the allowlist', async () => {
            const config = {
                databasePath: TEST_DB_PATH,
                neo4jUri: NEO4J_URI,
                neo4jUser: NEO4J_USER,
                neo4jPassword: NEO4J_PASSWORD,
                allowedRelationshipTypes: ['CALLS'] // Only allow CALLS
            };
            const agent = new GraphBuilder(config);
            await agent.init();
            
            const poiStmt = db.prepare('INSERT INTO file_analysis_reports (id, report) VALUES (?, ?)');
            poiStmt.run('source-node', JSON.stringify({ id: 'source-node', type: 'FUNCTION' }));
            poiStmt.run('target-node', JSON.stringify({ id: 'target-node', type: 'FUNCTION' }));
            const summary = { relationships: [{ sourcePoi: 'source-node', targetPoi: 'target-node', type: 'INVALID_TYPE', confidence: 0.9, explanation: 'test' }] };
            db.prepare('INSERT INTO project_analysis_summaries (id, summary) VALUES (?, ?)').run('summary-1', JSON.stringify(summary));

            await agent.run();

            const session = driver.session({ database: process.env.NEO4J_DATABASE || 'neo4j' });
            const result = await session.run("MATCH ()-[r]->() RETURN count(r) AS count");
            await session.close();
            expect(result.records[0].get('count').low).toBe(0);
            await agent.close();
        });
    });

    test('GB-R-01: should run the full integration from SQLite to Neo4j', async () => {
        // 1. Setup SQLite data
        const pois = [];
        for (let i = 1; i <= 10; i++) {
            pois.push({
                id: `poi-${i}`,
                report: JSON.stringify({
                    id: `poi-${i}`,
                    type: 'FUNCTION',
                    name: `func${i}`,
                    filePath: `file${i % 2}.js`
                })
            });
        }
        const relationships = {
            relationships: [
                { sourcePoi: 'poi-1', targetPoi: 'poi-2', type: 'CALLS', confidence: 0.8, explanation: '' },
                { sourcePoi: 'poi-3', targetPoi: 'poi-4', type: 'CALLS', confidence: 0.8, explanation: '' },
                { sourcePoi: 'poi-5', targetPoi: 'poi-6', type: 'USES', confidence: 0.8, explanation: '' },
                { sourcePoi: 'poi-7', targetPoi: 'poi-8', type: 'DEPENDS_ON', confidence: 0.8, explanation: '' },
            ]
        };

        const stmt1 = db.prepare('INSERT INTO file_analysis_reports (id, report) VALUES (?, ?)');
        const stmt2 = db.prepare('INSERT INTO project_analysis_summaries (id, summary) VALUES (?, ?)');
        
        db.transaction(() => {
            for (const p of pois) {
                stmt1.run(p.id, p.report);
            }
            stmt2.run('summary-1', JSON.stringify(relationships));
        })();

        // 2. Execute
        const agent = new GraphBuilder({ databasePath: TEST_DB_PATH, neo4jUri: NEO4J_URI, neo4jUser: NEO4J_USER, neo4jPassword: NEO4J_PASSWORD });
        await agent.init();
        
        // No longer mocking the loading methods to perform a full integration test
        // jest.spyOn(agent, '_loadAllPoisFromDb').mockResolvedValue(new Map(pois.map(p => [p.id, JSON.parse(p.report)])));
        // jest.spyOn(agent, '_loadRelationshipsFromDb').mockResolvedValue(relationships.relationships);

        await agent.run();

        // 3. Assert
        const session = driver.session({ database: process.env.NEO4J_DATABASE || 'neo4j' });
        const nodeResult = await session.run('MATCH (p:POI) RETURN count(p) AS count');
        const relResult = await session.run('MATCH ()-[r]->() RETURN count(r) AS count');
        await session.close();

        expect(nodeResult.records[0].get('count').low).toBe(10);
        expect(relResult.records[0].get('count').low).toBe(4);
        await agent.close();
    });
});