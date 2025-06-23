const neo4j = require('neo4j-driver');
const { exec } = require('child_process');
const util = require('util');
const { clearDatabase, getDriver } = require('../test_utils');
const execPromise = util.promisify(exec);

describe('Acceptance Test A-05-- Hierarchical Analysis Validation', () => {
    let driver;
    let session;

    beforeAll(async () => {
        driver = getDriver();
        session = driver.session();
        await clearDatabase(session);
        // The hierarchical analysis relies on a complete graph.
        await execPromise('node src/main.js --dir polyglot-test');
    }, 180000);

    afterAll(async () => {
        if (session) {
            await session.close();
        }
        if (driver) {
            await driver.close();
        }
    });

    test('should create AI-generated summaries for directories', async () => {
        // Verification 1: Check for the existence of a directory summary.
        const result = await session.run(`
            MATCH (d:Directory {name: 'polyglot-test/python'})
            RETURN d.summary AS summary
        `);

        expect(result.records.length).toBe(1);
        const summary = result.records[0].get('summary');
        expect(summary).toBeDefined();
        expect(summary.length).toBeGreaterThan(20); // Summary should be substantive.
        expect(summary).toMatch(/database|data/i); // Summary should reflect content.
    }, 30000);

    test('should correctly link directories to the files and POIs they contain', async () => {
        // Verification 2: Check for CONTAINS relationship between a directory and a POI.
        const result = await session.run(`
            MATCH (d:Directory {name: 'polyglot-test/js'})-[:CONTAINS]->(p:POI {name: 'getUser'})
            RETURN count(p) as poiCount
        `);

        const poiCount = result.records[0].get('poiCount').toNumber();
        expect(poiCount).toBe(1);
    }, 30000);

    test('should use directory summaries to infer high-level relationships', async () => {
        // Verification 3: Check for a high-level relationship inferred from summaries.
        // This is the core test for the value of hierarchical analysis.
        const result = await session.run(`
            MATCH (py_poi:POI)-[r:USES_AUTHENTICATION_MODEL]->(js_poi:POI)
            WHERE py_poi.language = 'Python' AND js_poi.language = 'JavaScript'
            RETURN r.inferredFrom AS inferredFrom
        `);
        
        // We expect at least one such relationship to be found.
        expect(result.records.length).toBeGreaterThan(0);
        
        const inferredFrom = result.records[0].get('inferredFrom');
        expect(inferredFrom).toContain('directory-summary');

    }, 30000);
});