const neo4j = require('neo4j-driver');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

describe('Acceptance Test A-04-- Queryability for Code Discovery', () => {
    let driver;
    let session;

    beforeAll(async () => {
        driver = neo4j.driver('neo4j://localhost', neo4j.auth.basic('neo4j', 'password'));
        session = driver.session();
        
        // Ensure the graph is populated for the query tests
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

    test('should be able to find the definition and all usages of a specific function', async () => {
        // --- Ground Truth Calculation ---
        // To make this test robust, we calculate the expected checksum dynamically
        // instead of hardcoding it.
        const filePath = path.join(__dirname, '../../polyglot-test/js/auth.js');
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const expectedChecksum = crypto.createHash('sha256').update(fileContent).digest('hex');
        
        // --- Verification Step 1-- Find the function definition ---
        const definitionResult = await session.run(
            `MATCH (p:POI {name: 'getUser'}) RETURN p.fileChecksum, p.startLine`,
        );

        expect(definitionResult.records.length).toBe(1);
        const record = definitionResult.records[0];
        expect(record.get('fileChecksum')).toBe(expectedChecksum);
        expect(record.get('startLine')).toBe(5); // Line number from `polyglot-test/js/auth.js`

        // --- Verification Step 2-- Find all callers of the function ---
        const callersResult = await session.run(
            `MATCH (caller)-[:RELATES {type: 'CALLS'}]->(p:POI {name: 'getUser'}) RETURN count(caller) AS callerCount`
        );

        const callerCount = callersResult.records[0].get('callerCount').toNumber();
        // Based on the test data, `getUser` is called by two functions in `data_processor.py`
        expect(callerCount).toBe(2);

    }, 30000);
});