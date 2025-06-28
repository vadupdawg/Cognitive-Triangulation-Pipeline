const neo4j = require('neo4j-driver');
const GraphIngestionWorker = require('../../../src/workers/GraphIngestionWorker');
const { NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD } = require('../../../src/config');

const validGraphData = {
  "pois": [
    {
      "id": "test-poi-1",
      "type": "Function",
      "name": "calculateTotal",
      "filePath": "src/utils/math.js",
      "startLine": 10,
      "endLine": 25
    },
    {
      "id": "test-poi-2",
      "type": "Function",
      "name": "formatCurrency",
      "filePath": "src/utils/format.js",
      "startLine": 5,
      "endLine": 15
    }
  ],
  "relationships": [
    {
      "source": "test-poi-1",
      "target": "test-poi-2",
      "type": "calls",
      "filePath": "src/utils/math.js"
    }
  ]
};

describe('GraphIngestionWorker Functional Tests', () => {
  let driver;
  let worker;

  beforeAll(async () => {
    driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
    worker = new GraphIngestionWorker({
        neo4jUri: NEO4J_URI,
        neo4jUser: NEO4J_USER,
        neo4jPassword: NEO4J_PASSWORD
    });
  });

  beforeEach(async () => {
    const session = driver.session();
    try {
      await session.run('MATCH (n) DETACH DELETE n');
    } finally {
      await session.close();
    }
  });

  afterAll(async () => {
    await driver.close();
    await worker.close();
  });

  test('TC01 - Should successfully ingest nodes and relationships', async () => {
    const job = { data: { graphJson: validGraphData } };
    await worker.processJob(job);

    const session = driver.session();
    try {
      const nodeCountResult = await session.run('MATCH (n:POI) RETURN count(n) AS count');
      expect(nodeCountResult.records[0].get('count').low).toBe(2);

      const poiResult = await session.run("MATCH (p:POI {id: 'test-poi-1'}) RETURN p");
      const poi = poiResult.records[0].get('p').properties;
      expect(poi.name).toBe('calculateTotal');
      expect(poi.type).toBe('Function');

      const relCountResult = await session.run('MATCH ()-[r:RELATIONSHIP]->() RETURN count(r) AS count');
      expect(relCountResult.records[0].get('count').low).toBe(1);

      const relResult = await session.run("MATCH (:POI {id: 'test-poi-1'})-[r:RELATIONSHIP {type: 'calls'}]->(:POI {id: 'test-poi-2'}) RETURN r");
      expect(relResult.records.length).toBe(1);
    } finally {
      await session.close();
    }
  });

  test('TC02 - Should be idempotent and not create duplicate data', async () => {
    const job = { data: { graphJson: validGraphData } };
    await worker.processJob(job);
    await worker.processJob(job); // Process the same job again

    const session = driver.session();
    try {
      const nodeCountResult = await session.run('MATCH (n:POI) RETURN count(n) AS count');
      expect(nodeCountResult.records[0].get('count').low).toBe(2);

      const relCountResult = await session.run('MATCH ()-[r:RELATIONSHIP]->() RETURN count(r) AS count');
      expect(relCountResult.records[0].get('count').low).toBe(1);
    } finally {
      await session.close();
    }
  });

  test('TC03 - Should handle malformed job data (missing graphJson)', async () => {
    const job = { data: {} };
    await expect(worker.processJob(job)).rejects.toThrow('Job data is missing graphJson.');
    
    const session = driver.session();
    try {
        const result = await session.run('MATCH (n) RETURN count(n) as count');
        expect(result.records[0].get('count').low).toBe(0);
    } finally {
        await session.close();
    }
  });
  
  test('TC05 - Should correctly ingest nodes when relationships are absent', async () => {
    const jobData = { ...validGraphData, relationships: [] };
    const job = { data: { graphJson: jobData } };
    await worker.processJob(job);

    const session = driver.session();
    try {
        const nodeCount = await session.run('MATCH (n:POI) RETURN count(n) AS count');
        expect(nodeCount.records[0].get('count').low).toBe(2);

        const relCount = await session.run('MATCH ()-[r:RELATIONSHIP]->() RETURN count(r) AS count');
        expect(relCount.records[0].get('count').low).toBe(0);
    } finally {
        await session.close();
    }
  });
});