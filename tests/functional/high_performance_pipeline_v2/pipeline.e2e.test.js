const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const neo4j = require('neo4j-driver');
const Redis = require('ioredis');
const EntityScout = require('../../../src/agents/EntityScout');
const FileAnalysisWorker = require('../../../src/workers/fileAnalysisWorker');
const DirectoryAggregationWorker = require('../../../src/workers/directoryAggregationWorker');
const GlobalResolutionWorker = require('../../../src/workers/globalResolutionWorker');
const ValidationWorker = require('../../../src/workers/validationWorker');
const GraphBuilderWorker = require('../../../src/agents/GraphBuilder');
const QueueManager = require('../../../src/utils/queueManager');
const { DatabaseManager } = require('../../../src/utils/sqliteDb');
const { NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD, REDIS_CONFIG, SQLITE_DB_PATH } = global.config;

jest.mock('../../../src/utils/logger');
jest.setTimeout(30000); // 30-second timeout for this E2E test

describe('End-to-End Pipeline Test', () => {
    let testRootDir;
    let queueManager;
    let driver;
    let session;
    let redisClient;
    let dbManager;
    let workers = [];
    let runId;

    beforeAll(async () => {
        queueManager = new QueueManager();
        driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
        redisClient = new Redis(REDIS_CONFIG);
        dbManager = new DatabaseManager(SQLITE_DB_PATH);
    });

    beforeEach(async () => {
        runId = uuidv4();
        const uniqueId = uuidv4();
        testRootDir = path.join(os.tmpdir(), `e2e-test-${uniqueId}`);
        await fs.ensureDir(testRootDir);
        
        session = driver.session();
        await session.run('MATCH (n) DETACH DELETE n');
        await redisClient.flushall();
        await queueManager.clearAllQueues();
        dbManager.initializeDb();

        // Mock external dependencies
        const mockLlmClient = { query: jest.fn().mockResolvedValue(JSON.stringify({ relationships: [], pois: [] })) };
        
        // Start all workers with their dependencies
        workers.push(new FileAnalysisWorker(queueManager, dbManager, redisClient, mockLlmClient));
        workers.push(new DirectoryAggregationWorker(queueManager, redisClient));
        workers.push(new GlobalResolutionWorker(queueManager, mockLlmClient, dbManager));
        workers.push(new ValidationWorker(queueManager, dbManager, redisClient));
        workers.push(new GraphBuilderWorker(queueManager, driver));
    });

    afterEach(async () => {
        await fs.remove(testRootDir);
        for (const worker of workers) {
            if (worker.worker) {
                await worker.worker.close();
            }
        }
        workers = [];
        await session.close();
    });

    afterAll(async () => {
        await queueManager.closeConnections();
        await driver.close();
        await redisClient.quit();
        dbManager.close();
    });

    // Test Case E2E-01
    test('E2E-01: Should process files from discovery to graph persistence', async () => {
        // 1. Setup test files
        const appDir = path.join(testRootDir, 'app');
        const apiDir = path.join(testRootDir, 'api');
        await fs.ensureDir(appDir);
        await fs.ensureDir(apiDir);
        await fs.writeFile(path.join(appDir, 'service.js'), 'function calculateTax() { return 1; }');
        await fs.writeFile(path.join(apiDir, 'handler.js'), 'const tax = calculateTax();');

        // 2. Run EntityScout
        const entityScout = new EntityScout(queueManager, redisClient, testRootDir, runId);
        await entityScout.run();

        // 3. Poll for completion
        await pollForCompletion(async () => {
            const result = await session.run(
                `MATCH (f:File)-[:DEFINES]->(func:Function {name: 'calculateTax'})
                 RETURN f, func`
            );
            return result.records.length > 0;
        }, 20000, 1000);


        // 4. Verify final state in Neo4j
        const result = await session.run(
            `MATCH (source:File)-[r:CALLS]->(target:Function)
             WHERE source.id ENDS WITH 'handler.js' AND target.name = 'calculateTax'
             RETURN r`
        );
        
        expect(result.records).toHaveLength(1);
    });
});

async function pollForCompletion(conditionFn, timeout, interval) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
        if (await conditionFn()) {
            return;
        }
        await new Promise(resolve => setTimeout(resolve, interval));
    }
    throw new Error('Polling timed out');
}