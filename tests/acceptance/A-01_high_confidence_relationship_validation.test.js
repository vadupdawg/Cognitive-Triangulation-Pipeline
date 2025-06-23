const neo4j = require('neo4j-driver');
const { exec } = require('child_process');
const util = require('util');
const { clearDatabase, getDriver } = require('../test_utils');
const execPromise = util.promisify(exec);

describe('Acceptance Test A-01-- High-Confidence Relationship Validation', () => {
    let driver;
    let session;

    beforeAll(async () => {
        driver = getDriver();
        session = driver.session();
        await clearDatabase(session);
        // Execute the full pipeline to generate the graph for validation.
        const { stdout, stderr } = await execPromise('node src/main.js --dir polyglot-test');
        if (stderr) {
            console.error('Pipeline STDERR--', stderr);
        }
    }, 180000); // 3-minute timeout for pipeline execution

    afterAll(async () => {
        if (session) {
            await session.close();
        }
        if (driver) {
            await driver.close();
        }
    });

    test('should correctly identify a complex, cross-language relationship with high confidence', async () => {
        // Verification 1: Find a specific, known cross-language CALLS relationship.
        const result = await session.run(`
            MATCH (source:POI {name: 'process_data', type: 'Function'})-[r:CALLS]->(target:POI {name: 'formatData', type: 'Function'})
            WHERE source.fileName = 'data_processor.py' AND target.fileName = 'utils.js'
            RETURN r.confidence, r.explanation
        `);

        expect(result.records.length).toBe(1);
        const relationship = result.records[0];
        
        // Verification 2: Assert confidence is high.
        const confidence = relationship.get('r.confidence');
        expect(confidence).toBeGreaterThan(0.9);

        // Verification 3: Assert the explanation is meaningful.
        const explanation = relationship.get('r.explanation');
        expect(explanation).toBeDefined();
        expect(explanation.length).toBeGreaterThan(10);
        expect(explanation).toMatch(/multi-model validation/i);

    }, 30000);

    test('should not create hallucinated relationships between unrelated entities', async () => {
        // Verification 4: Test for a specific, known-false relationship.
        const result = await session.run(`
            MATCH (source:POI {name: 'helper_function', type: 'Function'})-[r]-(target:POI {name: 'getUsername', type: 'Method'})
            WHERE source.fileName = 'utils.py' AND target.fileName = 'User.java'
            RETURN count(r) as relCount
        `);

        const relCount = result.records[0].get('relCount').toNumber();
        expect(relCount).toBe(0);
    }, 30000);
});