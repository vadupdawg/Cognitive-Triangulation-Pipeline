const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const neo4j = require('neo4j-driver');
const Redis = require('ioredis');
const EntityScout = require('../../../src/agents/EntityScout');
const FileAnalysisWorker = require('../../../src/workers/fileAnalysisWorker');
const AggregationService = require('../../../src/workers/directoryAggregationWorker');
const GraphBuilderWorker = require('../../../src/agents/GraphBuilder');
const ValidationWorker = require('../../../src/workers/validationWorker');
const GraphBuilderWorker = require('../../../src/workers/graphBuilderWorker');
const QueueManager = require('../../../src/utils/queueManager');
const { NEO4J_CONFIG, REDIS_CONFIG } = require('../../../src/config');

describe('End-to-End Pipeline Test', () => {
    let testRootDir;
    let queueManager;
    let driver;
    let session;
    let redisClient;
    let workers = [];

    beforeAll(async () => {
        queueManager = new QueueManager();
        driver = neo4j.driver(NEO4J_CONFIG.uri, neo4j.auth.basic(NEO4J_CONFIG.user, NEO4J_CONFIG.password));
        redisClient = new Redis(REDIS_CONFIG);
    });

    beforeEach(async () => {
        const uniqueId = uuidv4();
        testRootDir = path.join(os.tmpdir(), `e2e-test-${uniqueId}`);
        await fs.ensureDir(testRootDir);
        
        session = driver.session();
        await session.run('MATCH (n) DETACH DELETE n');
        await redisClient.flushall();
        await queueManager.clearAllQueues();

        // Start all workers
        workers.push(new FileAnalysisWorker());
        workers.push(new AggregationService());
        workers.push(new GlobalResolutionWorker());
        workers.push(new ValidationWorker());
        workers.push(new GraphBuilderWorker());
    });

    afterEach(async () => {
        await fs.remove(testRootDir);
        for (const worker of workers) {
            await worker.close();
        }
        workers = [];
        await session.close();
    });

    afterAll(async () => {
        await queueManager.closeConnections();
        await driver.close();
        await redisClient.quit();
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
        const entityScout = new EntityScout();
        await entityScout.run(testRootDir);

        // 3. Wait for the entire pipeline to complete
        // This is a long timeout to allow all async events and workers to finish.
        // In a real-world scenario, we might have more sophisticated polling or signaling.
        await new Promise(resolve => setTimeout(resolve, 15000));

        // 4. Verify final state in Neo4j
        const result = await session.run(
            `MATCH (source:File)-[r:CALLS]->(target:Function)
             WHERE source.id ENDS WITH 'handler.js' AND target.id = 'func:calculateTax'
             RETURN r`
        );
        
        expect(result.records).toHaveLength(1);
        expect(result.records[0].get('r').properties.linking_element).toBe('calculateTax');

        const definitionResult = await session.run(
            `MATCH (source:File)-[r:DEFINES]->(target:Function)
             WHERE source.id ENDS WITH 'service.js' AND target.id = 'func:calculateTax'
             RETURN r`
        );
        expect(definitionResult.records).toHaveLength(1);

    }, 20000); // 20-second timeout for this E2E test
});