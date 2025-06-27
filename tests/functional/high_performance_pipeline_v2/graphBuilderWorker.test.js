const neo4j = require('neo4j-driver');
const QueueManager = require('../../../src/utils/queueManager');
const GraphBuilderWorker = require('../../../src/agents/GraphBuilder');
const { RELATIONSHIP_VALIDATED_QUEUE_NAME, NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD } = require('../../../src/config');

describe('GraphBuilderWorker Functional Tests', () => {
    let queueManager;
    let graphBuilderWorker;
    let driver;
    let session;

    beforeAll(async () => {
        queueManager = new QueueManager();
        driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
    });

    beforeEach(async () => {
        graphBuilderWorker = new GraphBuilderWorker(queueManager, driver);
        session = driver.session();
        await session.run('MATCH (n) DETACH DELETE n');
        await queueManager.clearAllQueues();
    });
    afterEach(async () => {
        await graphBuilderWorker.close();
        await session.close();
    });

    afterAll(async () => {
        await queueManager.closeConnections();
        await driver.close();
    });

    // Test Case GBW-01 & GBW-02
    test('GBW-01 & GBW-02: Should create nodes and relationships idempotently', async () => {
        const validatedQueue = queueManager.getQueue(RELATIONSHIP_VALIDATED_QUEUE_NAME);
        const relationshipData = {
            source_node: { id: 'file:/a.js', label: 'File' },
            target_node: { id: 'func:myFunc', label: 'Function' },
            relationship_type: 'DEFINES',
            final_confidence_score: 0.99
        };

        // GBW-01: First run
        const job1 = await validatedQueue.add('relationship-validated', relationshipData);
        await graphBuilderWorker.process(job1);

        let result = await session.run('MATCH (a)-[r:DEFINES]->(b) RETURN a, r, b');
        expect(result.records).toHaveLength(1);
        expect(result.records[0].get('a').properties.id).toBe(relationshipData.source_node.id);
        expect(result.records[0].get('b').properties.id).toBe(relationshipData.target_node.id);
        expect(result.records[0].get('r').properties.final_confidence_score).toBe(relationshipData.final_confidence_score);

        // GBW-02: Second run (idempotency)
        const job2 = await validatedQueue.add('relationship-validated', relationshipData);
        await graphBuilderWorker.process(job2);

        result = await session.run('MATCH (n) RETURN count(n) as count');
        expect(result.records[0].get('count').low).toBe(2); // Still only 2 nodes
        result = await session.run('MATCH ()-[r]->() RETURN count(r) as count');
        expect(result.records[0].get('count').low).toBe(1); // Still only 1 relationship
    });

    // Test Case GBW-03
    test('GBW-03: Should handle malformed job data gracefully', async () => {
        const validatedQueue = queueManager.getQueue(RELATIONSHIP_VALIDATED_QUEUE_NAME);
        const malformedData = {
            // missing source_node
            target_node: { id: 'func:myFunc', label: 'Function' },
            relationship_type: 'DEFINES'
        };

        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        
        const job = await validatedQueue.add('relationship-validated', malformedData);
        await graphBuilderWorker.process(job);

        expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid job data'), expect.anything());
        
        const result = await session.run('MATCH (n) RETURN count(n) as count');
        expect(result.records[0].get('count').low).toBe(0); // No data written

        consoleErrorSpy.mockRestore();
    });
});