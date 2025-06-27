const { exec } = require('child_process');
const Redis = require('ioredis');
const sqlite3 = require('better-sqlite3');
const neo4j = require('neo4j-driver');
const path = require('path');

// --- Test Configuration ---
const TARGET_DIRECTORY = 'polyglot-test';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const SQLITE_DB_PATH = process.env.SQLITE_DB_PATH || path.join(__dirname, '../../database.db');
const NEO4J_URL = process.env.NEO4J_URL || 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'password';

// --- Test Utilities ---
let redisClient;
let db;
let driver;

beforeAll(async () => {
    // Note-- In a real test-runner environment, these would be managed by global setup/teardown scripts.
    redisClient = new Redis(REDIS_URL);
    db = new sqlite3(SQLITE_DB_PATH);
    driver = neo4j.driver(NEO4J_URL, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));

    // Clean up before tests
    await redisClient.flushall();
    db.exec('DELETE FROM outbox');
    db.exec('DELETE FROM relationships');
    db.exec('DELETE FROM relationship_evidence');
    const session = driver.session();
    await session.run('MATCH (n) DETACH DELETE n');
    await session.close();
});

afterAll(async () => {
    await redisClient.quit();
    db.close();
    await driver.close();
});

/**
 * Executes a shell command and returns it as a Promise.
 * @param {string} cmd
 * @returns {Promise<{stdout-- string, stderr-- string}>}
 */
function execShellCommand(cmd) {
    return new Promise((resolve, reject) => {
        exec(cmd, (error, stdout, stderr) => {
            if (error) {
                console.warn(error);
                reject(error);
            }
            resolve({ stdout, stderr });
        });
    });
}


describe('Granular E2E Pipeline Acceptance Tests', () => {

    describe('Phase 1-- Pipeline Initiation & Job Creation', () => {
        test('E2E-INIT-01-- CLI-Triggered Run', async () => {
            // AI-Verifiable Pre-condition-- Queues and DB are empty. This is handled by setup.

            // When-- The command is executed.
            const command = `node src/main.js --target ${TARGET_DIRECTORY}`;
            await execShellCommand(command);

            // Then-- The EntityScout agent creates jobs.
            // AI-Verifiable Completion Criterion--
            const fileQueueCount = await redisClient.llen('file-analysis-queue');
            const dirQueueCount = await redisClient.llen('directory-resolution-queue');
            const manifestKeys = await redisClient.keys('run--*');

            // --- Assertions ---
            // These checks can be performed by an AI verifier by querying Redis.
            expect(fileQueueCount).toBeGreaterThan(0); // A more specific count would require knowing the exact file count in polyglot-test
            expect(dirQueueCount).toBeGreaterThan(0); // A more specific count would require knowing the exact dir count in polyglot-test
            expect(manifestKeys.length).toBe(1);
        }, 30000); // 30-second timeout for the CLI command to run
    });

    describe('Phase 2-- Core Analysis Pipeline', () => {
        // Note-- These tests would ideally run after workers have processed jobs.
        // For this spec file, we assume workers are running in the background.

        test('E2E-CORE-01-- File-Level POI Analysis', async () => {
            // AI-Verifiable Completion Criterion--
            // This test requires a worker to have run. We poll for the result.
            const pollForEvent = async (eventType) => {
                for (let i = 0; i < 10; i++) {
                    const row = db.prepare('SELECT payload FROM outbox WHERE event_type = ? LIMIT 1').get(eventType);
                    if (row) return JSON.parse(row.payload);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
                return null;
            };

            const payload = await pollForEvent('file-analysis-finding');

            // --- Assertions ---
            expect(payload).not.toBeNull();
            expect(payload.pois).toBeInstanceOf(Array);
            expect(payload.pois.length).toBeGreaterThan(0);
        }, 15000);

        test('E2E-CORE-02-- Directory-Level Summary', async () => {
            // AI-Verifiable Completion Criterion--
            const pollForEvent = async (eventType) => {
                for (let i = 0; i < 10; i++) {
                    const row = db.prepare('SELECT payload FROM outbox WHERE event_type = ? LIMIT 1').get(eventType);
                    if (row) return JSON.parse(row.payload);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
                return null;
            };

            const payload = await pollForEvent('directory-analysis-finding');

            // --- Assertions ---
            expect(payload).not.toBeNull();
            expect(typeof payload.summary).toBe('string');
            expect(payload.summary.length).toBeGreaterThan(10);
        }, 15000);


        test('E2E-CORE-03-- Intra-File Relationship Analysis', async () => {
            // AI-Verifiable Completion Criterion--
            const pollForEvent = async (eventType) => {
                for (let i = 0; i < 15; i++) {
                    const row = db.prepare('SELECT payload FROM outbox WHERE event_type = ? LIMIT 1').get(eventType);
                    if (row) return JSON.parse(row.payload);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
                return null;
            };

            const payload = await pollForEvent('relationship-analysis-finding');

            // --- Assertions ---
            expect(payload).not.toBeNull();
            expect(payload.relationships).toBeInstanceOf(Array);
            expect(payload.relationships.length).toBeGreaterThan(0);
        }, 20000);
    });

    describe('Phase 3-- Validation, Reconciliation, and Persistence', () => {
        // These tests assume the previous phase workers have completed.

        test('E2E-VALID-01 & E2E-RECON-01-- Evidence, Reconciliation, and Scoring', async () => {
            // This test combines validation and reconciliation as they are tightly coupled.
            // AI-Verifiable Completion Criterion--
            const pollForValidatedRelationship = async () => {
                for (let i = 0; i < 20; i++) {
                    const row = db.prepare('SELECT * FROM relationships WHERE status = ? LIMIT 1').get('VALIDATED');
                    if (row) return row;
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
                return null;
            };

            const validatedRel = await pollForValidatedRelationship();
            
            // --- Assertions ---
            expect(validatedRel).not.toBeNull();
            expect(validatedRel.status).toBe('VALIDATED');
            expect(validatedRel.confidence_score).toBeGreaterThan(0);
        }, 25000);


        test('E2E-BUILD-01-- Knowledge Graph Construction', async () => {
            // This test assumes the GraphBuilder runs after reconciliation.
            // In a real scenario, this might be triggered by a "run complete" event.
            // For now, we'll manually invoke a conceptual "buildGraph" step.

            // Await previous steps to ensure data is ready.
            await new Promise(resolve => setTimeout(resolve, 5000)); 
            
            // When-- The GraphBuilder agent is executed.
            // This would be another `execShellCommand` call to a script that runs the builder.
            // For this spec, we'll directly check the result.

            // Then-- The graph is built in Neo4j.
            // AI-Verifiable Completion Criterion--
            const session = driver.session();
            const result = await session.run('MATCH (n)-[r]->(m) RETURN count(r) AS relationshipCount');
            await session.close();

            const relationshipCount = result.records[0].get('relationshipCount').toNumber();

            // --- Assertions ---
            expect(relationshipCount).toBeGreaterThan(0);
        }, 30000);
    });
});