const path = require('path');
const { CognitiveTriangulationPipeline } = require('../../src/main');
const neo4jDriver = require('../../src/utils/neo4jDriver');
const { DatabaseManager } = require('../../src/utils/sqliteDb');
const fs = require('fs-extra');

const TEST_DB_PATH = path.join(__dirname, 'test_sprint_5_e2e.sqlite');
const POLYGLOT_DIR = path.resolve(__dirname, '../../polyglot-test');

describe('Sprint 5 - E2E Worker-Based Architecture Acceptance Test', () => {
  let driver;
  let dbManager;

  beforeAll(async () => {
    // Ensure a clean state before tests
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
    dbManager = new DatabaseManager(TEST_DB_PATH);
    dbManager.initializeDb();
    driver = neo4jDriver;
    const session = driver.session();
    try {
      await session.run('MATCH (n) DETACH DELETE n');
    } finally {
      await session.close();
    }
  }, 30000);

  afterAll(async () => {
    if (dbManager) {
        dbManager.close();
    }
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
    if (driver) {
        await driver.close();
    }
  });

  test('A-S5-01: CognitiveTriangulationPipeline should successfully orchestrate the entire analysis process', async () => {
    const pipeline = new CognitiveTriangulationPipeline(POLYGLOT_DIR, TEST_DB_PATH);
    try {
        await pipeline.run();

        const session = driver.session();
        try {
            // Verification 1: Check for a specific, known cross-file relationship
            const result = await session.run(`
                MATCH (caller:POI {name: 'startServer'})-[r:CALLS]->(callee:POI {name: 'setupUtils'})
                WHERE caller.fileName CONTAINS 'server.js' AND callee.fileName CONTAINS 'utils.js'
                RETURN r
            `);
            expect(result.records.length).toBe(1);
            const relationship = result.records[0].get('r').properties;
            expect(relationship.confidence).toBeGreaterThan(0.8);

            // Verification 2: Check for directory-level analysis
            const dirResult = await session.run(`
                MATCH (d:Directory {name: $dirName})
                RETURN d.summary
            `, { dirName: path.join(POLYGLOT_DIR, 'js') });
            expect(dirResult.records.length).toBe(1);
            expect(dirResult.records[0].get('d.summary')).not.toBeNull();

        } finally {
            await session.close();
        }
    } finally {
        await pipeline.close();
    }
  }, 1200000);
});