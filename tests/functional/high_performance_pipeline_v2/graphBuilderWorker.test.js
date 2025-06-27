const neo4j = require('neo4j-driver');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const GraphBuilder = require('../../../src/agents/GraphBuilder');
const { NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD } = require('../../../src/config');

jest.mock('../../../src/utils/logger');

describe('GraphBuilder Functional Tests', () => {
    let driver;
    let db;
    const testDbName = `testdb${Date.now()}`;

    beforeAll(async () => {
        driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
        const session = driver.session({ database: 'system' });
        try {
            await session.run(`CREATE DATABASE ${testDbName} IF NOT EXISTS`);
        } finally {
            await session.close();
        }

        const constraintSession = driver.session({ database: testDbName });
        try {
            await constraintSession.run('CREATE CONSTRAINT poi_id_unique IF NOT EXISTS FOR (p:POI) REQUIRE p.id IS UNIQUE');
        } finally {
            await constraintSession.close();
        }
    });

    beforeEach(async () => {
        db = new Database(':memory:');
        db.pragma('journal_mode = WAL');
        const schemaPath = path.join(__dirname, '../../../src/utils/schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf-8');
        db.exec(schema);

        const session = driver.session({ database: testDbName });
        try {
            await session.run('MATCH (n) DETACH DELETE n');
        } finally {
            await session.close();
        }
    });

    afterEach(() => {
        db.close();
    });

    afterAll(async () => {
        const session = driver.session({ database: 'system' });
        try {
            await session.run(`DROP DATABASE ${testDbName}`);
        } finally {
            await session.close();
        }
        await driver.close();
    });

    test('GBW-01 & GBW-02: Should create nodes and relationships from validated data idempotently', async () => {
        // Setup: Insert POIs first to satisfy foreign key constraints
        const insertPoiStmt = db.prepare(
            "INSERT INTO pois (id, file_path, name, type, start_line, end_line, hash) VALUES (?, ?, ?, ?, ?, ?, ?)"
        );
        insertPoiStmt.run(1, 'file:/a.js', 'a.js', 'file', 1, 10, 'hash1');
        insertPoiStmt.run(2, 'file:/a.js', 'myFunc', 'function', 3, 8, 'hash2');

        // Setup: Insert validated relationships into SQLite
        const insertRelStmt = db.prepare(
            "INSERT INTO relationships (source_poi_id, target_poi_id, type, status) VALUES (?, ?, ?, 'VALIDATED')"
        );
        insertRelStmt.run(1, 2, 'DEFINES');

        const graphBuilder = new GraphBuilder(db, driver, testDbName);
        
        // GBW-01: First run
        await graphBuilder.run();

        const session = driver.session({ database: testDbName });
        try {
            // Correctly query for the relationship using the new semantic IDs
            const result = await session.run(`
                MATCH (a:POI {id: 'file:/a.js'})
                      -[r:RELATIONSHIP {type: 'DEFINES'}]->
                      (b:POI {id: 'function:myFunc@file:/a.js:3'})
                RETURN a, r, b
            `);
            expect(result.records).toHaveLength(1);
            const record = result.records[0];
            expect(record.get('a').properties.name).toBe('a.js');
            expect(record.get('b').properties.name).toBe('myFunc');
            
            // GBW-02: Second run (idempotency)
            await graphBuilder.run();
            const idempotentResult = await session.run(`
                MATCH (a:POI {id: 'file:/a.js'})
                      -[r:RELATIONSHIP {type: 'DEFINES'}]->
                      (b:POI {id: 'function:myFunc@file:/a.js:3'})
                RETURN a, r, b
            `);
            expect(idempotentResult.records).toHaveLength(1); // Should not create duplicates

        } finally {
            await session.close();
        }
    });
});