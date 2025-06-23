const neo4j = require('neo4j-driver');
const { exec } = require('child_process');
const util = require('util');
const { clearDatabase, getDriver } = require('../test_utils');
const execPromise = util.promisify(exec);

describe('Acceptance Test A-04-- Advanced Code Discovery and Queryability', () => {
    let driver;
    let session;

    beforeAll(async () => {
        driver = getDriver();
        session = driver.session();
        await clearDatabase(session);
        // We need a fully populated graph to run complex queries against.
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

    test('should answer a complex, multi-hop developer question', async () => {
        // This test validates a key business goal: enabling developers to ask complex
        // questions of the codebase.
        // The question: "What are the names of the JavaScript functions that are called
        // by Python functions which, in turn, interact with the database via the
        // `database_client.py` module?"

        const query = `
            // Start with the Python module that interacts with the database
            MATCH (db_client:File {fileName: 'database_client.py'})
            
            // Find Python functions that import or use this module
            MATCH (py_func:POI)-[:IMPORTS|INTERACTS_WITH]->(db_client)
            WHERE py_func.language = 'Python' AND py_func.type = 'Function'
            
            // Find the JavaScript functions called by those Python functions
            MATCH (py_func)-[:CALLS]->(js_func:POI)
            WHERE js_func.language = 'JavaScript' AND js_func.type = 'Function'

            // Return the distinct names of the JS functions found
            RETURN collect(distinct js_func.name) AS jsFunctionNames
        `;

        const result = await session.run(query);

        expect(result.records.length).toBe(1);
        const jsFunctionNames = result.records[0].get('jsFunctionNames');

        // Based on the `polyglot-test` ground truth, `data_processor.py/process_data`
        // uses the db_client and calls `server.js/getAuthenticatedUser`.
        // We expect this array to contain 'getAuthenticatedUser'.
        expect(jsFunctionNames).toBeDefined();
        expect(Array.isArray(jsFunctionNames)).toBe(true);
        expect(jsFunctionNames).toContain('getAuthenticatedUser');
        
        // This makes the test more specific if other relationships are added later.
        expect(jsFunctionNames.length).toBe(1); 

    }, 30000);
});