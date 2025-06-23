const neo4j = require('neo4j-driver');
const { exec } = require('child_process');
const util = require('util');
const { clearDatabase, getDriver } = require('../test_utils');
const execPromise = util.promisify(exec);

describe('Acceptance Test A-02-- Resiliency and Self-Correction', () => {
    let driver;
    let session;

    beforeAll(async () => {
        driver = getDriver();
        session = driver.session();
        // Ensuring a clean state before this test suite
        await clearDatabase(session);
        // We need to run the full pipeline to have data to inspect.
        const { stdout, stderr } = await execPromise('node src/main.js --dir polyglot-test');
        if (stderr) {
            console.error('Pipeline STDERR--', stderr);
        }
    }, 180000);

    afterAll(async () => {
        if (session) {
            await session.close();
        }
        if (driver) {
            await driver.close();
        }
    });

    test('should correctly record analysis attempts and status on File nodes', async () => {
        // Verification 1 & 2: Check a specific file for its final status and attempts count.
        const fileNodeResult = await session.run(`
            MATCH (f:File {fileName: 'auth.js'})
            WHERE f.path CONTAINS 'polyglot-test/js'
            RETURN f.analysisStatus AS analysisStatus, f.analysisAttempts AS analysisAttempts
        `);

        expect(fileNodeResult.records.length).toBe(1);
        const fileNode = fileNodeResult.records[0];

        const status = fileNode.get('analysisStatus');
        const attempts = fileNode.get('analysisAttempts').toNumber();

        expect(status).toBe('COMPLETED');
        expect(attempts).toBeGreaterThanOrEqual(1);
    }, 30000);

    test('should create a FileAnalysisReport for every completed File', async () => {
        // Verification 3: Ensure that all completed files have a corresponding report.
        // This query looks for completed File nodes that do NOT have a relationship to a report.
        // The count of such nodes should be zero.
        const missingReportResult = await session.run(`
            MATCH (f:File {analysisStatus: 'COMPLETED'})
            WHERE NOT (f)-[:HAS_REPORT]->(:FileAnalysisReport)
            RETURN count(f) AS missingReportCount
        `);

        const missingReportCount = missingReportResult.records[0].get('missingReportCount').toNumber();
        expect(missingReportCount).toBe(0);
    }, 30000);
});