const { exec } = require('child_process');
const neo4j = require('neo4j-driver');
const Redis = require('ioredis');
const sqlite3 = require('sqlite3').verbose();
const { clearRedis, clearSqlite, clearNeo4j } = require('../testUtils');
const path = require('path');
const fs = require('fs');

describe('V2 Granular E2E Pipeline Validation (A-03)', () => {
    let neo4jDriver;
    let redisClient;
    let db;
    const dbPath = path.resolve(__dirname, '../../database.sqlite');

    beforeAll(async () => {
        // Ensure a pristine environment
        await clearRedis();
        await clearSqlite();
        await clearNeo4j();

        // Setup connections
        neo4jDriver = neo4j.driver(
            process.env.NEO4J_URI,
            neo4j.auth.basic(process.env.NEO4J_USER, process.env.NEO4J_PASSWORD)
        );
        redisClient = new Redis(process.env.REDIS_URL);
        
        // The pipeline creates the DB file, so we connect after it runs.
    }, 45000);

    afterAll(async () => {
        if (neo4jDriver) await neo4jDriver.close();
        if (redisClient) await redisClient.quit();
        if (db) await db.close();
    });

    test('should run the V2 pipeline and pass granular data validation at each stage', async () => {
        // 1. Execute the pipeline against the 'polyglot-test' directory
        const projectPath = path.resolve(__dirname, '../../polyglot-test');
        const mainScriptPath = path.resolve(__dirname, '../../src/main.js');

        const pipelineExitCode = await new Promise((resolve, reject) => {
            const command = `node ${mainScriptPath} --path ${projectPath}`;
            const pipelineProcess = exec(command, { env: { ...process.env, LOG_LEVEL: 'silent' } });

            pipelineProcess.on('close', (code) => {
                resolve(code);
            });

            pipelineProcess.stderr.on('data', (data) => {
                // Log stderr for debugging if the test fails
                console.error(`Pipeline STDERR-- ${data}`);
            });
        });

        expect(pipelineExitCode).toBe(0);

        // 2. Redis Validation (Post-EntityScout)
        const llmQueueExists = await redisClient.exists('llm-analysis-queue');
        const graphQueueExists = await redisClient.exists('graph-ingestion-queue');
        expect(llmQueueExists).toBe(1);
        expect(graphQueueExists).toBe(1);

        const runManifest = await redisClient.hgetall('run_manifest');
        expect(runManifest).toBeDefined();
        expect(runManifest.status).toBe('processing'); // Initial status
        
        const llmQueueLength = await redisClient.llen('llm-analysis-queue');
        // Based on the number of files in polyglot-test
        expect(llmQueueLength).toBe(15); 

        // 3. SQLite Validation (Post-AnalysisWorkers)
        // Wait a moment for workers to process and write to SQLite
        await new Promise(resolve => setTimeout(resolve, 5000)); 

        db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);

        // Verify schema of points_of_interest
        const poiSchema = await new Promise((resolve, reject) => {
            db.all("PRAGMA table_info(points_of_interest)", (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            });
        });
        const poiColumns = poiSchema.map(col => ({ name: col.name, type: col.type }));
        expect(poiColumns).toEqual(
            expect.arrayContaining([
                { name: 'id', type: 'INTEGER' },
                { name: 'file_path', type: 'TEXT' },
                { name: 'entity_type', type: 'TEXT' },
                { name: 'entity_name', type: 'TEXT' },
                { name: 'code_snippet', type: 'TEXT' },
            ])
        );

        // Verify schema of resolved_relationships
        const relSchema = await new Promise((resolve, reject) => {
            db.all("PRAGMA table_info(resolved_relationships)", (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            });
        });
        const relColumns = relSchema.map(col => ({ name: col.name, type: col.type }));
        expect(relColumns).toEqual(
            expect.arrayContaining([
                { name: 'id', type: 'INTEGER' },
                { name: 'source_entity_id', type: 'INTEGER' },
                { name: 'target_entity_id', type: 'INTEGER' },
                { name: 'relationship_type', type: 'TEXT' },
            ])
        );

        // Verify a specific, known POI from the test data
        const knownPoi = await new Promise((resolve, reject) => {
            db.get("SELECT * FROM points_of_interest WHERE entity_name = 'DataService'", (err, row) => {
                if (err) reject(err);
                resolve(row);
            });
        });
        expect(knownPoi).toBeDefined();
        expect(knownPoi.entity_type).toBe('Class');
        expect(knownPoi.file_path).toContain('DataService.java');

        // 4. Neo4j Validation (Post-GraphIngestionWorker)
        // Wait for the graph ingestion to complete.
        await new Promise(resolve => setTimeout(resolve, 10000)); 
        const session = neo4jDriver.session();
        try {
            // Node Counts from ground truth report
            const fileCount = await session.run('MATCH (n:File) RETURN count(n) as count');
            expect(fileCount.records[0].get('count').toNumber()).toBe(15);

            const classCount = await session.run('MATCH (n:Class) RETURN count(n) as count');
            expect(classCount.records[0].get('count').toNumber()).toBe(20);

            const functionCount = await session.run('MATCH (n:Function) RETURN count(n) as count');
            expect(functionCount.records[0].get('count').toNumber()).toBe(203);

            // Relationship Counts from ground truth report
            const importsCount = await session.run('MATCH ()-[r:IMPORTS]->() RETURN count(r) as count');
            expect(importsCount.records[0].get('count').toNumber()).toBe(65);

            const containsCount = await session.run('MATCH ()-[r:CONTAINS]->() RETURN count(r) as count');
            expect(containsCount.records[0].get('count').toNumber()).toBe(381);
            
            // Spot check a specific relationship
            const dataServiceUsesDb = await session.run(
                `MATCH (c:Class {name: 'DataService'})-[r:USES]->(d:Database {name: 'polyglot_test.db'})
                 RETURN count(r) as count`
            );
            expect(dataServiceUsesDb.records[0].get('count').toNumber()).toBeGreaterThanOrEqual(1);

        } finally {
            await session.close();
        }

    }, 300000); // 5 minute timeout for the full pipeline run
});