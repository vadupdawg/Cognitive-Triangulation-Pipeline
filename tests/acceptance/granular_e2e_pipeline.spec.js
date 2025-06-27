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
const NEO4J_PASSWORD = 'test1234';

// --- Test Configuration ---
const TARGET_DIRECTORY = 'polyglot-test';

// --- Helper Functions ---
const runPipeline = (targetDir) => {
    return new Promise((resolve, reject) => {
        const command = `node src/main.js --target ${targetDir}`;
        const pipelineProcess = exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`Pipeline Error: ${stderr}`);
                return reject(new Error(`Pipeline process exited with code ${error.code}`));
            }
            resolve(stdout);
        });
        pipelineProcess.stdout.pipe(process.stdout);
    });
};

const cleanDatabases = async () => {
    // This function will be handled by the global setup
};

// --- Test Suite ---
describe('Granular E2E Pipeline - Production Style', () => {
    let db, redis, neo4jDriver;

    beforeAll(() => {
        redis = new Redis(REDIS_URL);
        neo4jDriver = neo4j.driver(NEO4J_URL, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
    });
    
    afterAll(async () => {
        await redis.quit();
        await neo4jDriver.close();
    });

    beforeEach(() => {
        db = new Database(SQLITE_DB_PATH);
    });

    afterEach(() => {
        db.close();
    });

    test('E2E-FULL-RUN: The pipeline should run to completion and populate all databases correctly', async () => {
        // WHEN the pipeline is run to completion
        await runPipeline(TARGET_DIRECTORY);

        // THEN validate the final state of all databases

        // 1. SQLite Validation
        const pois = db.prepare("SELECT * FROM pois WHERE file_path LIKE ?").all(`%${TARGET_DIRECTORY}%`);
        expect(pois.length).toBeGreaterThan(10); // Expect a reasonable number of POIs

        const validatedRelationships = db.prepare("SELECT * FROM relationships WHERE status = 'VALIDATED'").all();
        expect(validatedRelationships.length).toBeGreaterThan(5); // Expect a reasonable number of relationships

        // 2. Redis Validation
        const manifestKeys = await redis.keys('run_manifest:*');
        expect(manifestKeys.length).toBe(1);
        const manifest = await redis.hgetall(manifestKeys[0]);
        expect(manifest.status).toBe('COMPLETED');
        expect(parseInt(manifest.total_files, 10)).toBeGreaterThan(0);

        // 3. Neo4j Validation
        const session = neo4jDriver.session();
        try {
            const fileNodes = await session.run("MATCH (n:File) RETURN count(n) as count");
            expect(fileNodes.records[0].get('count').toNumber()).toBeGreaterThan(5);
            
            const functionNodes = await session.run("MATCH (n:Function) RETURN count(n) as count");
            expect(functionNodes.records[0].get('count').toNumber()).toBeGreaterThan(5);

            const callRelations = await session.run("MATCH ()-[r:CALLS]->() RETURN count(r) as count");
            expect(callRelations.records[0].get('count').toNumber()).toBeGreaterThan(1);

        } finally {
            await session.close();
        }
    });
});