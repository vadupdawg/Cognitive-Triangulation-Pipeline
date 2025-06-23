const neo4j = require('neo4j-driver');
const { exec } = require('child_process');
const util = require('util');
const { clearDatabase, getDriver } = require('../test_utils');
const execPromise = util.promisify(exec);

describe('Acceptance Test A-03-- Idempotency of Updates', () => {
    let driver;
    let session;

    const getGraphCounts = async (session) => {
        const nodeResult = await session.run('MATCH (n) RETURN count(n) AS count');
        const relResult = await session.run('MATCH ()-[r]->() RETURN count(r) AS count');
        return {
            nodes: nodeResult.records[0].get('count').toNumber(),
            relationships: relResult.records[0].get('count').toNumber(),
        };
    };

    beforeAll(async () => {
        driver = getDriver();
        session = driver.session();
        await clearDatabase(session);
        // Run the pipeline once to establish a baseline graph state.
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

    test('should not alter the graph when re-run on an unchanged codebase', async () => {
        // Get initial counts after the first run.
        const initialCounts = await getGraphCounts(session);
        expect(initialCounts.nodes).toBeGreaterThan(0);
        expect(initialCounts.relationships).toBeGreaterThan(0);

        // Get a specific property for a deeper check.
        const initialPropResult = await session.run(`MATCH (p:POI {name: 'getUser'}) RETURN p.startLine`);
        const initialStartLine = initialPropResult.records[0].get('p.startLine');

        // Re-run the full analysis pipeline.
        const { stderr } = await execPromise('node src/main.js --dir polyglot-test');
        expect(stderr).toBe('');

        // Verify counts have not changed.
        const finalCounts = await getGraphCounts(session);
        expect(finalCounts.nodes).toBe(initialCounts.nodes);
        expect(finalCounts.relationships).toBe(initialCounts.relationships);

        // Verify the specific property has not changed.
        const finalPropResult = await session.run(`MATCH (p:POI {name: 'getUser'}) RETURN p.startLine`);
        const finalStartLine = finalPropResult.records[0].get('p.startLine');
        expect(finalStartLine).toEqual(initialStartLine);

    }, 180000);
});