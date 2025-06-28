const { exec } = require('child_process');
const neo4j = require('neo4j-driver');
const { clearRedis, clearSqlite, clearNeo4j } = require('../../src/utils/testUtils'); // Assuming testUtils file in utils
const path = require('path');

describe('V2 High-Performance Pipeline - Ground Truth Validation (A-02)', () => {
    let driver;

    beforeAll(async () => {
        // Clear all databases before running the test suite
        await clearRedis();
        await clearSqlite();
        await clearNeo4j();

        // Setup Neo4j driver
        driver = neo4j.driver(
            process.env.NEO4J_URI,
            neo4j.auth.basic(process.env.NEO4J_USER, process.env.NEO4J_PASSWORD)
        );
    }, 30000); // 30 second timeout for setup

    afterAll(async () => {
        if (driver) {
            await driver.close();
        }
    });

    test('should process the polyglot-test directory and match the ground truth state', async () => {
        // 1. Execute the pipeline
        const projectPath = path.resolve(__dirname, '../../polyglot-test');
        const mainScriptPath = path.resolve(__dirname, '../../src/main.js');

        await new Promise((resolve, reject) => {
            const command = `node ${mainScriptPath} --path ${projectPath}`;
            const pipelineProcess = exec(command, { env: { ...process.env, LOG_LEVEL: 'silent' } });

            pipelineProcess.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`Pipeline process exited with code ${code}`));
                }
            });

            pipelineProcess.stderr.on('data', (data) => {
                console.error(`Pipeline STDERR: ${data}`);
            });
        });

        // 2. Validate the final state of the Neo4j graph
        const session = driver.session();
        try {
            // Node Counts
            const fileCountResult = await session.run('MATCH (n:File) RETURN count(n) as count');
            expect(fileCountResult.records[0].get('count').toNumber()).toBe(15);

            const dbCountResult = await session.run('MATCH (n:Database) RETURN count(n) as count');
            expect(dbCountResult.records[0].get('count').toNumber()).toBe(1);

            const tableCountResult = await session.run('MATCH (n:Table) RETURN count(n) as count');
            expect(tableCountResult.records[0].get('count').toNumber()).toBe(15);

            const classCountResult = await session.run('MATCH (n:Class) RETURN count(n) as count');
            expect(classCountResult.records[0].get('count').toNumber()).toBe(20);

            const functionCountResult = await session.run('MATCH (n:Function) RETURN count(n) as count');
            expect(functionCountResult.records[0].get('count').toNumber()).toBe(203);

            const variableCountResult = await session.run('MATCH (n:Variable) RETURN count(n) as count');
            expect(variableCountResult.records[0].get('count').toNumber()).toBe(59);

            // Relationship Counts
            const importsCountResult = await session.run('MATCH ()-[r:IMPORTS]->() RETURN count(r) as count');
            expect(importsCountResult.records[0].get('count').toNumber()).toBe(65);

            const exportsCountResult = await session.run('MATCH ()-[r:EXPORTS]->() RETURN count(r) as count');
            expect(exportsCountResult.records[0].get('count').toNumber()).toBe(38);

            const extendsCountResult = await session.run('MATCH ()-[r:EXTENDS]->() RETURN count(r) as count');
            expect(extendsCountResult.records[0].get('count').toNumber()).toBe(2);

            const containsCountResult = await session.run('MATCH ()-[r:CONTAINS]->() RETURN count(r) as count');
            expect(containsCountResult.records[0].get('count').toNumber()).toBe(381);

            const callsCountResult = await session.run('MATCH ()-[r:CALLS]->() RETURN count(r) as count');
            const callsCount = callsCountResult.records[0].get('count').toNumber();
            expect(callsCount).toBeGreaterThanOrEqual(125);
            expect(callsCount).toBeLessThanOrEqual(145);

            const usesCountResult = await session.run('MATCH ()-[r:USES]->() RETURN count(r) as count');
            const usesCount = usesCountResult.records[0].get('count').toNumber();
            expect(usesCount).toBeGreaterThanOrEqual(190);
            expect(usesCount).toBeLessThanOrEqual(210);

        } finally {
            await session.close();
        }
    }, 300000); // 5 minute timeout for the full pipeline run and validation
});