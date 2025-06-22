const { runPipeline, getNeo4jDriver } = require('../test_utils');
const path = require('path');

describe('Acceptance Test A-01-- Comprehensive Codebase Graph Generation (User Story 1)', () => {
  let driver;
  const testRepoPath = path.join(__dirname, '..', '..', 'polyglot-test', 'A-01_polyglot_interaction');

  beforeAll(async () => {
    driver = getNeo4jDriver();
    // Ensure the database is clean before running the test
    const session = driver.session();
    await session.run('MATCH (n) DETACH DELETE n');
    await session.close();
  });

  afterAll(async () => {
    await driver.close();
  });

  test('should generate a complete and accurate graph from a polyglot codebase', async () => {
    // 1. Execute the pipeline against the test repository
    const { exitCode } = await runPipeline(testRepoPath);
    expect(exitCode).toBe(0);

    const session = driver.session();

    // 2. AI-Verifiable-- Verify node counts
    const nodeCountResult = await session.run("MATCH (n) RETURN labels(n) AS NodeLabels, count(*) AS Count");
    const nodeCounts = nodeCountResult.records.reduce((acc, record) => {
      acc[record.get('NodeLabels')[0]] = record.get('Count').low;
      return acc;
    }, {});

    expect(nodeCounts.File).toBe(2); // main.py, utils.js
    expect(nodeCounts.Function).toBe(2); // foo, bar

    // 3. AI-Verifiable-- Verify relationship counts
    const relCountResult = await session.run("MATCH ()-[r]->() RETURN type(r) AS RelationshipType, count(*) AS Count");
    const relCounts = relCountResult.records.reduce((acc, record) => {
        acc[record.get('RelationshipType')] = record.get('Count').low;
        return acc;
    }, {});
    
    expect(relCounts.DEFINED_IN).toBe(4); // 2 files, 2 functions
    expect(relCounts.CALLS).toBe(1);

    // 4. AI-Verifiable-- Verify specific cross-language CALLS relationship
    const crossCallResult = await session.run("MATCH (py:Function {name-- 'foo'})-[:CALLS]->(js:Function {name-- 'bar'}) RETURN count(*)");
    const crossCallCount = crossCallResult.records[0].get(0).low;
    expect(crossCallCount).toBe(1);

    await session.close();
  }, 30000); // Increase timeout for pipeline execution
});