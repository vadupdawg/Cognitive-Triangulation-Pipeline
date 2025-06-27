const Database = require('better-sqlite3');
const Redis = require('ioredis');
const neo4j = require('neo4j-driver');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// --- Database Connection Details ---
const SQLITE_DB_PATH = path.join(__dirname, '..', '..', 'database.sqlite');
const REDIS_URL = 'redis://localhost:6379';
const NEO4J_URL = 'bolt://localhost:7687';
const NEO4J_USER = 'neo4j';
const NEO4J_PASSWORD = 'test1234'; // Use a secure password in a real environment

// --- Test Configuration ---
const TARGET_DIRECTORY = 'polyglot-test';
const TEST_TIMEOUT = 60000; // 60 seconds

// --- Database Clients ---
let sqliteDb, redisClient, neo4jDriver;

// --- Helper Functions ---
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const runCommand = (command) => {
    return new Promise((resolve, reject) => {
        const process = exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error executing command: ${command}`);
                console.error(stdout);
                console.error(stderr);
                return reject(error);
            }
            resolve(stdout.trim());
        });

        process.stdout.on('data', (data) => {
            console.log(`[CMD] ${command}:`, data.toString().trim());
        });

        process.stderr.on('data', (data) => {
            console.error(`[CMD ERR] ${command}:`, data.toString().trim());
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
    await redisClient.flushall();

    // Clean Neo4j
    const session = neo4jDriver.session();
    try {
        await session.run('MATCH (n) DETACH DELETE n');
    } finally {
        await session.close();
    }
};

const getTableInfo = (tableName) => {
    return sqliteDb.pragma(`table_info('${tableName}')`);
};

// --- Test Suite ---

describe('Granular E2E Pipeline with Database Validation', () => {
    beforeAll(() => {
        redisClient = new Redis(REDIS_URL);
        neo4jDriver = neo4j.driver(NEO4J_URL, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
    });

    afterAll(async () => {
        await redisClient.quit();
        await neo4jDriver.close();
        if (sqliteDb) {
            sqliteDb.close();
            sqliteDb = null;
        }
    });

    beforeEach(async () => {
        await cleanDatabases();
    }, TEST_TIMEOUT);

    test('E2E-INIT-01-- CLI-Triggered Run and Job Validation', async () => {
        // When
        await runCommand(`node src/main.js --target ${TARGET_DIRECTORY} --test-mode`);

        // Then-- allow some time for EntityScout to work
        await delay(5000);

        // AI-Verifiable Completion Criterion
        // 1. Redis `file-analysis-queue`
        const fileQueueLength = await redisClient.llen('bull:file-analysis-queue:waiting');
        expect(fileQueueLength).toBeGreaterThan(0);
        const fileJob = JSON.parse(await redisClient.lindex('bull:file-analysis-queue:waiting', 0));
        expect(fileJob.data).toHaveProperty('file_path');
        expect(typeof fileJob.data.file_path).toBe('string');
        expect(fileJob.data.file_path).toContain(TARGET_DIRECTORY);


        // 2. Redis `directory-resolution-queue`
        const dirQueueLength = await redisClient.llen('bull:directory-resolution-queue:waiting');
        expect(dirQueueLength).toBeGreaterThan(0);
        const dirJob = JSON.parse(await redisClient.lindex('bull:directory-resolution-queue:waiting', 0));
        expect(dirJob.data).toHaveProperty('directory_path');
        expect(dirJob.data.directory_path).toContain(TARGET_DIRECTORY);


        // 3. Redis Run Manifest
        const manifestKeys = await redisClient.keys('run_manifest:*');
        expect(manifestKeys.length).toBe(1);
        const manifest = await redisClient.hgetall(manifestKeys[0]);
        expect(manifest.status).toBe('IN_PROGRESS');
        expect(manifest.target_directory).toBe(TARGET_DIRECTORY);
        expect(parseInt(manifest.total_files, 10)).toBeGreaterThan(0);

    }, TEST_TIMEOUT);


    test('E2E-CORE-01-- File-Level POI Analysis and Database Validation', async () => {
        // This test requires workers to be running. For an isolated test,
        // we can manually trigger the worker logic on a specific file.
        // For this E2E test, we assume the workers are started separately.
        await runCommand(`node src/main.js --target ${TARGET_DIRECTORY} --test-mode`);
        
        // Wait for workers to process
        await delay(15000); // Adjust delay based on expected processing time

        // AI-Verifiable Completion Criterion
        // 1. SQLite `points_of_interest` Table Schema
        const tableInfo = getTableInfo('points_of_interest');
        const columns = tableInfo.map(col => ({ name: col.name, type: col.type, pk: col.pk }));
        expect(columns).toEqual(expect.arrayContaining([
            { name: 'id', type: 'TEXT', pk: 1 },
            { name: 'file_path', type: 'TEXT', pk: 0 },
            { name: 'name', type: 'TEXT', pk: 0 },
            { name: 'type', type: 'TEXT', pk: 0 },
            { name: 'start_line', type: 'INTEGER', pk: 0 },
            { name: 'end_line', type: 'INTEGER', pk: 0 },
            { name: 'confidence', type: 'REAL', pk: 0 },
            { name: 'llm_output', type: 'TEXT', pk: 0 },
        ]));

        // 2. SQLite `points_of_interest` Data Correctness
        const rows = sqliteDb.prepare("SELECT * FROM points_of_interest WHERE file_path LIKE ?").all(`%${TARGET_DIRECTORY}%`);
        
        expect(rows.length).toBeGreaterThan(0);
        const functionPoi = rows.find(r => r.name === 'authenticateUser' && r.file_path.includes('auth.js'));
        expect(functionPoi).toBeDefined();
        expect(functionPoi.type).toBe('Function');
        expect(functionPoi.start_line).toBeGreaterThan(0);
        expect(functionPoi.end_line).toBeGreaterThan(functionPoi.start_line);
        expect(typeof functionPoi.id).toBe('string');
        expect(functionPoi.confidence).toBeGreaterThan(0.5);
        expect(functionPoi.llm_output).not.toBeNull();


    }, TEST_TIMEOUT);
    
    test('E2E-BUILD-01-- Knowledge Graph Construction and Validation', async () => {
        // Run the full pipeline
        await runCommand(`node src/main.js --target ${TARGET_DIRECTORY} --test-mode`);
        
        // Wait for the entire pipeline to complete. This is the longest part.
        await delay(45000);

        // Manually trigger GraphBuilder
        await runCommand(`node src/agents/GraphBuilder.js`);
        await delay(5000);

        const session = neo4jDriver.session();
        try {
            // 1. Neo4j Node Validation
            const fileNodeResult = await session.run("MATCH (f:File) WHERE f.path CONTAINS $dir RETURN f.path, f.language, f.node_count", { dir: TARGET_DIRECTORY });
            expect(fileNodeResult.records.length).toBeGreaterThan(0);
            const authFile = fileNodeResult.records.find(r => r.get('f.path').includes('auth.js'));
            expect(authFile).toBeDefined();
            expect(authFile.get('f.language')).toBe('JavaScript');
            expect(authFile.get('f.node_count').toNumber()).toBeGreaterThan(0);

            
            const funcNodeResult = await session.run("MATCH (p:Function {name: 'authenticateUser'}) RETURN p.name, p.startLine, p.endLine");
            expect(funcNodeResult.records.length).toBe(1);
            expect(funcNodeResult.records[0].get('p.name')).toBe('authenticateUser');
            expect(neo4j.integer.inSafeRange(funcNodeResult.records[0].get('p.startLine'))).toBe(true);
            expect(neo4j.integer.inSafeRange(funcNodeResult.records[0].get('p.endLine'))).toBe(true);


            // 2. Neo4j Relationship Validation
            const relationshipResult = await session.run("MATCH (f:Function {name: 'authenticateUser'})-[r:CALLS]->(t:Function {name: 'hashPassword'}) RETURN type(r), r.confidenceScore");
            expect(relationshipResult.records.length).toBeGreaterThan(0);
            expect(relationshipResult.records[0].get('type(r)')).toBe('CALLS');
            expect(relationshipResult.records[0].get('r.confidenceScore')).toBeGreaterThan(0.5);


            const containsResult = await session.run("MATCH (file:File)-[r:CONTAINS]->(func:Function) WHERE file.path CONTAINS 'auth.js' RETURN count(func) AS funcCount");
            expect(containsResult.records[0].get('funcCount').toNumber()).toBeGreaterThan(0);

        } finally {
            await session.close();
        }

    }, TEST_TIMEOUT);

});