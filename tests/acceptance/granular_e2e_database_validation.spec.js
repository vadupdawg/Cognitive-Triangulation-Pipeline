const Database = require('better-sqlite3');
const Redis = require('ioredis');
const neo4j = require('neo4j-driver');
const { exec } = require('child_process');
const fs = require('fs-extra');
const path = require('path');

// --- Database Connection Details ---
const SQLITE_DB_PATH = path.join(__dirname, '..', '..', 'database.sqlite');
const REDIS_URL = 'redis://localhost:6379';
const NEO4J_URL = 'bolt://localhost:7687';
const NEO4J_USER = 'neo4j';
const NEO4J_PASSWORD = 'test1234'; // Use a secure password in a real environment

// --- Test Configuration ---
const TARGET_DIRECTORY = 'polyglot-test';
const TEST_TIMEOUT = 90000; // 90 seconds, increased for full pipeline runs

// --- Database Clients ---
let sqliteDb, redisClient, neo4jDriver;

// --- Helper Functions ---
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const runCommand = (command, options = {}) => {
    return new Promise((resolve, reject) => {
        const process = exec(command, options, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error executing command: ${command}`);
                console.error('STDOUT:', stdout);
                console.error('STDERR:', stderr);
                return reject(error);
            }
            resolve(stdout.trim());
        });

        process.stdout.on('data', (data) => {
            // console.log(`[CMD] ${command}:`, data.toString().trim());
        });

        process.stderr.on('data', (data) => {
            // console.error(`[CMD ERR] ${command}:`, data.toString().trim());
        });
    });
};

const cleanDatabases = async () => {
    // Clean SQLite
    if (sqliteDb) {
        sqliteDb.close();
        sqliteDb = null;
    }
    if (fs.existsSync(SQLITE_DB_PATH)) {
        fs.unlinkSync(SQLITE_DB_PATH);
    }
    sqliteDb = new Database(SQLITE_DB_PATH);
    const schema = fs.readFileSync(path.join(__dirname, '../../src/utils/schema.sql'), 'utf8');
    sqliteDb.exec(schema);

    // Clean Redis
    if (redisClient) {
        await redisClient.flushall();
    }

    // Clean Neo4j
    if (neo4jDriver) {
        const session = neo4jDriver.session();
        try {
            await session.run('MATCH (n) DETACH DELETE n');
        } finally {
            await session.close();
        }
    }
};

const getTableInfo = (tableName) => {
    return sqliteDb.pragma(`table_info('${tableName}')`);
};

const getForeignKeys = (tableName) => {
    return sqliteDb.pragma(`foreign_key_list('${tableName}')`);
};


// --- Test Suite ---
describe('Granular E2E Database Validation Pipeline', () => {

    beforeAll(() => {
        redisClient = new Redis(REDIS_URL);
        neo4jDriver = neo4j.driver(NEO4J_URL, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
    });

    afterAll(async () => {
        await redisClient.quit();
        await neo4jDriver.close();
        if (sqliteDb) {
            sqliteDb.close();
        }
    });

    beforeEach(async () => {
        await cleanDatabases();
    }, TEST_TIMEOUT);

    test('E2E-CORE-02: Relationship Resolution Worker and database validation', async () => {
        // GIVEN: The pipeline is run and POIs are generated
        await runCommand(`node src/main.js --target ${TARGET_DIRECTORY} --test-mode`);
        await delay(20000); // Allow time for FileAnalysis and RelationshipResolution workers

        // THEN: The resolved_relationships table should be correctly populated
        
        // 1. Verify Table Schema
        const tableInfo = getTableInfo('relationships');
        const columns = tableInfo.map(col => ({ name: col.name, type: col.type, notnull: col.notnull, pk: col.pk }));
        expect(columns).toEqual(expect.arrayContaining([
            { name: 'id', type: 'INTEGER', notnull: 0, pk: 1 },
            { name: 'source_poi_id', type: 'INTEGER', notnull: 0, pk: 0 },
            { name: 'target_poi_id', type: 'INTEGER', notnull: 0, pk: 0 },
            { name: 'type', type: 'TEXT', notnull: 1, pk: 0 },
            { name: 'status', type: 'TEXT', notnull: 0, pk: 0 },
            { name: 'confidence_score', type: 'REAL', notnull: 0, pk: 0 },
        ]));

        // 2. Verify Foreign Key Constraints
        const fks = getForeignKeys('relationships');
        expect(fks).toEqual(expect.arrayContaining([
            expect.objectContaining({ table: 'pois', from: 'source_poi_id', to: 'id' }),
            expect.objectContaining({ table: 'pois', from: 'target_poi_id', to: 'id' }),
        ]));

        // 3. Verify Data Correctness
        const rows = sqliteDb.prepare(`
            SELECT r.type, p1.name as source_name, p2.name as target_name, r.confidence_score
            FROM relationships r
            JOIN pois p1 ON r.source_poi_id = p1.id
            JOIN pois p2 ON r.target_poi_id = p2.id
            WHERE p1.file_path LIKE '%auth.js%'
        `).all();

        expect(rows.length).toBeGreaterThan(0);
        
        const callRelationship = rows.find(r => r.source_name === 'authenticateUser' && r.target_name === 'hashPassword' && r.type === 'CALLS');
        expect(callRelationship).toBeDefined();
        expect(callRelationship.confidence_score).toBeGreaterThan(0);
        expect(callRelationship.confidence_score).toBeLessThanOrEqual(1);

    }, TEST_TIMEOUT);

    test('E2E-VALID-01: Validation Worker and relationship_evidence table validation', async () => {
        // GIVEN: The pipeline is run
        await runCommand(`node src/main.js --target ${TARGET_DIRECTORY} --test-mode`);
        await delay(25000); // Allow time for validation workers

        // THEN: The relationship_evidence table should be correctly populated

        // 1. Verify Table Schema
        const tableInfo = getTableInfo('relationship_evidence');
        const columns = tableInfo.map(col => ({ name: col.name, type: col.type, notnull: col.notnull }));
        expect(columns).toEqual(expect.arrayContaining([
            { name: 'id', type: 'INTEGER', notnull: 0 },
            { name: 'relationship_id', type: 'INTEGER', notnull: 1 },
            { name: 'run_id', type: 'TEXT', notnull: 1 },
            { name: 'evidence_payload', type: 'TEXT', notnull: 1 },
        ]));
        
        // 2. Verify Foreign Key
        const fks = getForeignKeys('relationship_evidence');
        expect(fks[0]).toMatchObject({ table: 'relationships', from: 'relationship_id', to: 'id' });

        // 3. Verify Data Correctness
        const rows = sqliteDb.prepare(`
            SELECT re.evidence_payload FROM relationship_evidence re
            JOIN relationships r ON re.relationship_id = r.id
            JOIN pois p1 ON r.source_poi_id = p1.id
            WHERE p1.name = 'authenticateUser' AND p1.file_path LIKE '%auth.js%'
        `).all();

        expect(rows.length).toBeGreaterThan(0);
        const evidence = JSON.parse(rows[0].evidence_payload);
        expect(evidence).toHaveProperty('source');
        expect(evidence).toHaveProperty('target');
        expect(evidence).toHaveProperty('type', 'CALLS');
        expect(evidence.source.name).toBe('authenticateUser');
    }, TEST_TIMEOUT);
    
    test('E2E-RECON-01: Reconciliation Worker and relationships table validation', async () => {
        // GIVEN: The pipeline is run to completion
        await runCommand(`node src/main.js --target ${TARGET_DIRECTORY} --test-mode`);
        await delay(45000); // Allow full pipeline to run

        // THEN: The relationships table should have validated entries

        const validatedRelationship = sqliteDb.prepare(`
            SELECT r.status, r.confidence_score
            FROM relationships r
            JOIN pois p1 ON r.source_poi_id = p1.id
            JOIN pois p2 ON r.target_poi_id = p2.id
            WHERE p1.name = 'authenticateUser' 
              AND p2.name = 'hashPassword' 
              AND r.type = 'CALLS'
        `).get();
        
        expect(validatedRelationship).toBeDefined();
        expect(validatedRelationship.status).toBe('VALIDATED');
        expect(validatedRelationship.confidence_score).toBeGreaterThan(0.7); // Assuming good confidence
    }, TEST_TIMEOUT);

    test('E2E-CLEAN-01: Self-Cleaning Agent and cascade delete validation', async () => {
        // GIVEN: A complete graph exists for the target directory
        await runCommand(`node src/main.js --target ${TARGET_DIRECTORY}`);
        await delay(60000); // Wait for full run

        const filePathToDelete = path.join(TARGET_DIRECTORY, 'js', 'auth.js');
        const filePoiIdFragment = 'polyglot-test/js/auth.js';
        
        // Pre-check: Ensure data exists before deletion
        const poisBefore = sqliteDb.prepare("SELECT * FROM pois WHERE file_path = ?").all(filePathToDelete);
        expect(poisBefore.length).toBeGreaterThan(0);
        const neo4jSession = neo4jDriver.session();
        const nodesBefore = await neo4jSession.run("MATCH (n) WHERE n.id CONTAINS $fragment RETURN count(n) as count", { fragment: filePoiIdFragment });
        expect(nodesBefore.records[0].get('count').toNumber()).toBeGreaterThan(0);

        // WHEN: A file is deleted and the SelfCleaningAgent is run
        fs.unlinkSync(filePathToDelete);
        await runCommand(`node src/agents/SelfCleaningAgent.js --target ${TARGET_DIRECTORY}`);
        await delay(10000);

        // THEN: All related data should be deleted from all databases

        // 1. SQLite Validation
        const poisAfter = sqliteDb.prepare("SELECT * FROM pois WHERE file_path = ?").all(filePathToDelete);
        expect(poisAfter.length).toBe(0);

        const relationshipsAfter = sqliteDb.prepare(`
            SELECT * FROM relationships WHERE source_poi_id IN (SELECT id FROM pois WHERE file_path = ?)
        `).all(filePathToDelete);
        expect(relationshipsAfter.length).toBe(0);

        // 2. Neo4j Validation
        const nodesAfter = await neo4jSession.run("MATCH (n) WHERE n.id CONTAINS $fragment RETURN count(n) as count", { fragment: filePoiIdFragment });
        expect(nodesAfter.records[0].get('count').toNumber()).toBe(0);
        
        const fileNodeAfter = await neo4jSession.run("MATCH (f:File {path: $path}) RETURN f", { path: filePathToDelete });
        expect(fileNodeAfter.records.length).toBe(0);
        
        await neo4jSession.close();

        // Restore file for other tests if needed, though jest runs in separate processes
        fs.copyFileSync(path.join(TARGET_DIRECTORY, 'js', 'server.js'), filePathToDelete); // Not perfect, but restores a file

    }, TEST_TIMEOUT);
});