const { spawn } = require('child_process');
const path = require('path');
const neo4j = require('neo4j-driver');
const { NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD, NEO4J_DATABASE } = require('../../config');

// Ground Truth counts from docs/reports/polyglot-test-analysis-report.md
const GROUND_TRUTH_COUNTS = {
  nodes: {
    File: 15,
    Database: 1,
    Table: 15,
    Class: 20,
    Function: 203,
    Variable: 59,
  },
  relationships: {
    IMPORTS: 65,
    EXPORTS: 38,
    EXTENDS: 2,
    CONTAINS: 381,
    CALLS: 135, // Approximate
    USES: 200,   // Approximate
  },
};

const APPROXIMATE_TOLERANCE = 0.05; // 5% tolerance for approximate counts

/**
 * Executes the main pipeline script.
 * @returns {Promise<{exitCode: number}>}
 */
function runPipeline() {
  return new Promise((resolve, reject) => {
    const pipelineProcess = spawn('node', ['src/main.js', '--dir', 'polyglot-test'], {
      stdio: 'inherit',
      shell: true,
    });

    pipelineProcess.on('close', (exitCode) => {
      resolve({ exitCode });
    });

    pipelineProcess.on('error', (error) => {
      console.error('Failed to start pipeline process.', error);
      reject(error);
    });
  });
}

describe('Acceptance Test A-01-- Ground Truth Validation', () => {
  let driver;

  beforeAll(async () => {
    driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
    // Ensure the database is clean before running the test
    const session = driver.session({ database: NEO4J_DATABASE });
    try {
        await session.run('MATCH (n) DETACH DELETE n');
    } finally {
        await session.close();
    }
  }, 30000); // 30s timeout for setup

  afterAll(async () => {
    if (driver) {
      await driver.close();
    }
  });

  test('should produce a graph that perfectly matches the ground truth report', async () => {
    // 1. Execute the full pipeline on the polyglot-test directory
    const { exitCode } = await runPipeline();
    expect(exitCode).toBe(0);

    const session = driver.session({ database: NEO4J_DATABASE });

    try {
      // 2. AI-Verifiable-- Verify Node Counts
      for (const [label, expectedCount] of Object.entries(GROUND_TRUTH_COUNTS.nodes)) {
        const result = await session.run(`MATCH (n:${label}) RETURN count(n) AS count`);
        const actualCount = result.records[0].get('count').low;
        console.log(`Verifying Node Count -- ${label} -- Expected-- ${expectedCount}, Actual-- ${actualCount}`);
        expect(actualCount).toBe(expectedCount);
      }

      // 3. AI-Verifiable-- Verify Relationship Counts
      for (const [type, expectedCount] of Object.entries(GROUND_TRUTH_COUNTS.relationships)) {
        const result = await session.run(`MATCH ()-[r:${type}]->() RETURN count(r) AS count`);
        const actualCount = result.records[0].get('count').low;
        console.log(`Verifying Relationship Count -- ${type} -- Expected-- ${expectedCount}, Actual-- ${actualCount}`);

        // Handle approximate counts with a tolerance
        if (type === 'CALLS' || type === 'USES') {
          const lowerBound = Math.floor(expectedCount * (1 - APPROXIMATE_TOLERANCE));
          const upperBound = Math.ceil(expectedCount * (1 + APPROXIMATE_TOLERANCE));
          expect(actualCount).toBeGreaterThanOrEqual(lowerBound);
          expect(actualCount).toBeLessThanOrEqual(upperBound);
        } else {
          expect(actualCount).toBe(expectedCount);
        }
      }
    } finally {
      await session.close();
    }
  }, 600000); // 10-minute timeout to allow the full pipeline to run
});