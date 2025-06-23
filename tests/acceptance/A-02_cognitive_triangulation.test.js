const neo4j = require('neo4j-driver');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

describe('Acceptance Test A-02-- Cognitive Triangulation and Confidence Scoring', () => {
    let driver;
    let session;

    beforeAll(async () => {
        driver = neo4j.driver('neo4j://localhost', neo4j.auth.basic('neo4j', 'password'));
        session = driver.session();
        // It's assumed the graph is already populated by a preceding test run (like A-01)
        // or a dedicated seeding script. For this test, we run the pipeline to be sure.
        await execPromise('node src/main.js --dir polyglot-test');
    }, 120000);

    afterAll(async () => {
        if (session) {
            await session.close();
        }
        if (driver) {
            await driver.close();
        }
    });

    test('should ensure all relationships have a valid confidence score and explanation', async () => {
        // --- Verification Step 1-- Check for null confidence scores ---
        const nullConfidenceResult = await session.run(`
            MATCH ()-[r:RELATES]->()
            WHERE r.confidence IS NULL
            RETURN count(r) AS count
        `);
        const nullConfidenceCount = nullConfidenceResult.records[0].get('count').toNumber();
        expect(nullConfidenceCount).toBe(0);

        // --- Verification Step 2-- Check for confidence scores outside the valid range (0-1) ---
        const invalidRangeResult = await session.run(`
            MATCH ()-[r:RELATES]->()
            WHERE r.confidence < 0 OR r.confidence > 1
            RETURN count(r) AS count
        `);
        const invalidRangeCount = invalidRangeResult.records[0].get('count').toNumber();
        expect(invalidRangeCount).toBe(0);

        // --- Verification Step 3-- Check for null or empty explanations ---
        const nullExplanationResult = await session.run(`
            MATCH ()-[r:RELATES]->()
            WHERE r.explanation IS NULL OR r.explanation = ''
            RETURN count(r) AS count
        `);
        const nullExplanationCount = nullExplanationResult.records[0].get('count').toNumber();
        expect(nullExplanationCount).toBe(0);

    }, 30000);
});