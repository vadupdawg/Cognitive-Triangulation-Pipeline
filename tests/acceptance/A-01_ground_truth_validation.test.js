const { spawn } = require('child_process');
const path = require('path');
const neo4j = require('neo4j-driver');
const { getDb } = require('../../src/utils/sqliteDb');
const { NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD, NEO4J_DATABASE } = require('../../config');

// Throughput goals for the polyglot-test directory
const THROUGHPUT_GOALS = {
  nodes: 300,
  relationships: 1600,
};

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

describe('Acceptance Test A-01: High-Throughput Graph Ingestion', () => {
  let driver;

  beforeAll(async () => {
    // Clean Neo4j
    driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
    const session = driver.session({ database: NEO4J_DATABASE });
    try {
        await session.run('MATCH (n) DETACH DELETE n');
    } finally {
        await session.close();
    }

    // Clean SQLite - respect foreign key constraints by deleting in correct order
    const db = await getDb();
    await db.run('DELETE FROM failed_work');        // Child of work_queue
    await db.run('DELETE FROM analysis_results');   // Child of files
    await db.run('DELETE FROM work_queue');         // Child of files
    await db.run('DELETE FROM files');              // Parent table
    // Reset autoincrement counters
    await db.run("DELETE FROM sqlite_sequence WHERE name IN ('failed_work', 'analysis_results', 'work_queue', 'files')");

  }, 30000); // 30s timeout for setup

  afterAll(async () => {
    if (driver) {
      await driver.close();
    }
  });

  test('should ingest over 300 nodes and 1600 relationships', async () => {
    // 1. Execute the full pipeline on the polyglot-test directory
    const { exitCode } = await runPipeline();
    expect(exitCode).toBe(0);

    const session = driver.session({ database: NEO4J_DATABASE });

    try {
      // 2. AI-Verifiable: Verify Node and Relationship Counts
      const nodeResult = await session.run('MATCH (n) RETURN count(n) AS count');
      const actualNodeCount = nodeResult.records[0].get('count').low;
      console.log(`Verifying Node Count -- Expected > ${THROUGHPUT_GOALS.nodes}, Actual: ${actualNodeCount}`);
      expect(actualNodeCount).toBeGreaterThan(THROUGHPUT_GOALS.nodes);

      const relResult = await session.run('MATCH ()-[r]->() RETURN count(r) AS count');
      const actualRelCount = relResult.records[0].get('count').low;
      console.log(`Verifying Relationship Count -- Expected > ${THROUGHPUT_GOALS.relationships}, Actual: ${actualRelCount}`);
      expect(actualRelCount).toBeGreaterThan(THROUGHPUT_GOALS.relationships);

    } finally {
      await session.close();
    }
  }, 600000); // 10 minutes timeout for long-running pipeline
});