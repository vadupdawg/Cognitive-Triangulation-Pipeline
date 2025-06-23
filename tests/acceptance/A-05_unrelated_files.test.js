const neo4j = require('neo4j-driver');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

describe('Acceptance Test A-05-- Handling of Unrelated Files', () => {
    let driver;
    let session;

    beforeAll(async () => {
        driver = neo4j.driver('neo4j://localhost', neo4j.auth.basic('neo4j', 'password'));
        session = driver.session();
        
        // Ensure the graph is populated for the query tests.
        // The test data in `polyglot-test/js/config.js` is designed for this scenario.
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

    test('should create nodes for entities in standalone files with no relationships', async () => {
        // This test assumes a POI named 'API_KEY' exists in `polyglot-test/js/config.js`
        // and is not used anywhere else.

        // --- Verification Step 1-- Verify the standalone node exists ---
        const nodeResult = await session.run(
            `MATCH (p:POI {name: 'API_KEY'}) RETURN p`
        );

        expect(nodeResult.records.length).toBe(1);
        const node = nodeResult.records[0].get('p');
        expect(node.properties.type).toBe('VariableDeclaration');

        // --- Verification Step 2-- Verify the node has no relationships ---
        const relationshipResult = await session.run(
            `MATCH (p:POI {name: 'API_KEY'})-[r]-() RETURN count(r) AS relCount`
        );

        const relCount = relationshipResult.records[0].get('relCount').toNumber();
        expect(relCount).toBe(0);

    }, 30000);
});