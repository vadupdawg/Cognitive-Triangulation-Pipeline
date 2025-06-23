const GraphBuilder = require('../../src/agents/GraphBuilder');
const sqlite3 = require('sqlite3').verbose();
const neo4j = require('neo4j-driver');
const path = require('path');
const fs = require('fs');

const TEST_DB_PATH = path.join(__dirname, '..', 'test-data', 'test_graph_builder.sqlite');
const NEO4J_URI = process.env.NEO4J_URI || 'neo4j://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'password';

let db;
let driver;

// Helper function to clear Neo4j
const clearNeo4j = async () => {
    const session = driver.session();
    try {
        await session.run('MATCH (n) DETACH DELETE n');
    } finally {
        await session.close();
    }
};

// Helper function to setup SQLite
const setupSqlite = () => {
    return new Promise((resolve, reject) => {
        db = new sqlite3.Database(TEST_DB_PATH, (err) => {
            if (err) return reject(err);
            db.serialize(() => {
                db.run(`
                    CREATE TABLE IF NOT EXISTS file_analysis_reports (
                        id TEXT PRIMARY KEY,
                        file_path TEXT,
                        report JSON
                    );
                `, (err) => { if (err) return reject(err); });

                db.run(`
                    CREATE TABLE IF NOT EXISTS project_analysis_summaries (
                        id TEXT PRIMARY KEY,
                        summary JSON
                    );
                `, (err) => { if (err) return reject(err); });

                db.run('DELETE FROM file_analysis_reports', (err) => { if (err) return reject(err); });
                db.run('DELETE FROM project_analysis_summaries', (err) => { if (err) return reject(err); });
                resolve();
            });
        });
    });
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
        await new Promise((resolve, reject) => {
            db.serialize(() => {
                db.run('DELETE FROM file_analysis_reports', (err) => { if (err) return reject(err); });
                db.run('DELETE FROM project_analysis_summaries', (err) => { if (err) return reject(err); });
                resolve();
            });
        });
    });

    afterAll(async () => {
        await driver.close();
        await new Promise((resolve, reject) => {
            db.close((err) => {
                if (err) return reject(err);
                fs.unlinkSync(TEST_DB_PATH); // Clean up the test database file
                resolve();
            });
        });
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

    describe('_persistNodes', () => {
        test('GB-PN-01: should persist new POIs as nodes in Neo4j', async () => {
            const agent = new GraphBuilder({ databasePath: TEST_DB_PATH, neo4jUri: NEO4J_URI, neo4jUser: NEO4J_USER, neo4jPassword: NEO4J_PASSWORD });
            await agent.init();

            const poiMap = new Map();
            for (let i = 1; i <= 5; i++) {
                poiMap.set(`test-upid-${i}`, { id: `test-upid-${i}`, type: 'FUNCTION', name: `testFunc${i}` });
            }

            await agent._persistNodes(poiMap);

            const session = driver.session();
            const result = await session.run('MATCH (p:POI) RETURN count(p) AS count');
            await session.close();
            expect(result.records[0].get('count').low).toBe(5);
            await agent.close();
        });

        test('GB-PN-02: should be idempotent and not create duplicate nodes', async () => {
            const agent = new GraphBuilder({ databasePath: TEST_DB_PATH, neo4jUri: NEO4J_URI, neo4jUser: NEO4J_USER, neo4jPassword: NEO4J_PASSWORD });
            await agent.init();
            const poiMap = new Map([['test-upid-1', { id: 'test-upid-1', type: 'FUNCTION', name: 'testFunc1' }]]);

            await agent._persistNodes(poiMap);
            await agent._persistNodes(poiMap); // Call second time

            const session = driver.session();
            const result = await session.run('MATCH (p:POI) RETURN count(p) AS count');
            await session.close();
            expect(result.records[0].get('count').low).toBe(1);
            await agent.close();
        });
    });

    describe('_persistRelationships', () => {
        test('GB-PR-01: should create relationships with dynamic types', async () => {
            const agent = new GraphBuilder({ databasePath: TEST_DB_PATH, neo4jUri: NEO4J_URI, neo4jUser: NEO4J_USER, neo4jPassword: NEO4J_PASSWORD });
            await agent.init();
            const poiMap = new Map([
                ['source-node', { id: 'source-node', type: 'FUNCTION' }],
                ['target-node', { id: 'target-node', type: 'FUNCTION' }]
            ]);
            await agent._persistNodes(poiMap);

            const relationships = [{ sourcePoi: 'source-node', targetPoi: 'target-node', type: 'CALLS', confidence: 0.9, explanation: 'test' }];
            await agent._persistRelationships(relationships);

            const session = driver.session();
            const result = await session.run("MATCH (:POI {id: 'source-node'})-[r:CALLS]->(:POI {id: 'target-node'}) RETURN count(r) AS count");
            await session.close();
            expect(result.records[0].get('count').low).toBe(1);
            await agent.close();
        });

        test('GB-PR-02: should be idempotent and not create duplicate relationships', async () => {
            const agent = new GraphBuilder({ databasePath: TEST_DB_PATH, neo4jUri: NEO4J_URI, neo4jUser: NEO4J_USER, neo4jPassword: NEO4J_PASSWORD });
            await agent.init();
            const poiMap = new Map([
                ['source-node', { id: 'source-node', type: 'FUNCTION' }],
                ['target-node', { id: 'target-node', type: 'FUNCTION' }]
            ]);
            await agent._persistNodes(poiMap);
            const relationships = [{ sourcePoi: 'source-node', targetPoi: 'target-node', type: 'CALLS', confidence: 0.9, explanation: 'test' }];

            await agent._persistRelationships(relationships);
            await agent._persistRelationships(relationships); // Call second time

            const session = driver.session();
            const result = await session.run("MATCH ()-[r:CALLS]->() RETURN count(r) AS count");
            await session.close();
            expect(result.records[0].get('count').low).toBe(1);
            await agent.close();
        });

        test('GB-PR-03: should ignore relationships with types not in the allowlist', async () => {
            const config = {
                databasePath: TEST_DB_PATH,
                neo4jUri: NEO4J_URI,
                neo4jUser: NEO4J_USER,
                neo4jPassword: NEO4J_PASSWORD,
                allowedRelationshipTypes: ['CALLS'] // Only allow CALLS
            };
            const agent = new GraphBuilder(config);
            await agent.init();
            const poiMap = new Map([
                ['source-node', { id: 'source-node', type: 'FUNCTION' }],
                ['target-node', { id: 'target-node', type: 'FUNCTION' }]
            ]);
            await agent._persistNodes(poiMap);
            const relationships = [{ sourcePoi: 'source-node', targetPoi: 'target-node', type: 'INVALID_TYPE', confidence: 0.9, explanation: 'test' }];
            
            // The filtering logic is in `run`, so we call it.
            // We need to mock the DB loading methods for this unit-like test.
            jest.spyOn(agent, '_loadAllPoisFromDb').mockResolvedValue(poiMap);
            jest.spyOn(agent, '_loadRelationshipsFromDb').mockResolvedValue(relationships);

            await agent.run();

            const session = driver.session();
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

        await new Promise((resolve, reject) => {
            const stmt1 = db.prepare('INSERT INTO file_analysis_reports (id, report) VALUES (?, ?)');
            pois.forEach(p => stmt1.run(p.id, p.report));
            stmt1.finalize(err => { if(err) reject(err) });

            const stmt2 = db.prepare('INSERT INTO project_analysis_summaries (id, summary) VALUES (?, ?)');
            stmt2.run('summary-1', JSON.stringify(relationships));
            stmt2.finalize(err => { if(err) reject(err); else resolve(); });
        });

        // 2. Execute
        const agent = new GraphBuilder({ databasePath: TEST_DB_PATH, neo4jUri: NEO4J_URI, neo4jUser: NEO4J_USER, neo4jPassword: NEO4J_PASSWORD });
        await agent.run();

        // 3. Assert
        const session = driver.session();
        const nodeResult = await session.run('MATCH (p:POI) RETURN count(p) AS count');
        const relResult = await session.run('MATCH ()-[r]->() RETURN count(r) AS count');
        await session.close();

        expect(nodeResult.records[0].get('count').low).toBe(10);
        expect(relResult.records[0].get('count').low).toBe(4);
    });
});