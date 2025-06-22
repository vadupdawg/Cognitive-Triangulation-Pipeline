const GraphIngestorAgent = require('../../src/agents/GraphIngestorAgent');
const { getDb } = require('../../src/utils/sqliteDb');
const { getDriver } = require('../../src/utils/neo4jDriver');
const path = require('path');

describe('GraphIngestorAgent - Functional Tests', () => {
    let db;
    let neo4jDriver;
    let agent;

    beforeAll(async () => {
        // Note: getDb returns a promise which resolves to the db instance.
        db = await getDb();
        neo4jDriver = getDriver();
    });

    beforeEach(async () => {
        // Clean SQLite database
        // Resetting the sequence is important for predictable IDs in tests.
        await db.run("DELETE FROM analysis_results");
        await db.run("DELETE FROM work_queue");
        await db.run("DELETE FROM sqlite_sequence WHERE name='analysis_results'");
        await db.run("DELETE FROM sqlite_sequence WHERE name='work_queue'");


        // Clean Neo4j database
        const session = neo4jDriver.session();
        try {
            await session.run('MATCH (n) DETACH DELETE n');
        } finally {
            await session.close();
        }

        agent = new GraphIngestorAgent(db, neo4jDriver);
    });

    afterAll(async () => {
        // The getDb function manages a singleton promise, no need to close db here
        // as it's managed globally. Closing it might affect other tests.
        await neo4jDriver.close();
    });

    describe('GIA-C-001: constructor(db, neo4jDriver)', () => {
        it('should initialize the agent with live database drivers', () => {
            expect(agent.db).toBe(db);
            expect(agent.neo4jDriver).toBe(neo4jDriver);
        });
    });

    describe('GIA-GNB: getNextBatch()', () => {
        it('GIA-GNB-001: should fetch a batch of unprocessed results and mark them as ingested', async () => {
            // Arrange
            await db.run("INSERT INTO work_queue (id, file_path, absolute_file_path, content_hash) VALUES (1, 'a.js', '/a.js', 'h1'), (2, 'b.js', '/b.js', 'h2')");
            await db.run("INSERT INTO analysis_results (work_item_id, llm_output, status, file_path, absolute_file_path) VALUES (1, '{}', 'completed', 'a.js', '/a.js'), (2, '{}', 'completed', 'b.js', '/b.js')");

            // Act
            const results = await agent.getNextBatch(2);

            // Assert
            expect(results).toHaveLength(2);
            expect(results[0].id).toBe(1);
            expect(results[1].id).toBe(2);

            const rows = await db.all("SELECT status FROM analysis_results WHERE id IN (1, 2)");
            expect(rows[0].status).toBe('ingested');
            expect(rows[1].status).toBe('ingested');
        });

        it('GIA-GNB-002: should return an empty array when no unprocessed results are available', async () => {
            // Act
            const results = await agent.getNextBatch(5);

            // Assert
            expect(results).toHaveLength(0);
        });
    });

    describe('GIA-PB: processBatch()', () => {
        it('GIA-PB-001: should fully process a valid batch, creating all nodes and relationships', async () => {
            // Arrange
            const analysisData1 = {
                entities: [{ type: 'Function', name: 'funcA', filePath: '/app.js' }],
                relationships: []
            };
            const analysisData2 = {
                entities: [{ type: 'Variable', name: 'varX', filePath: '/app.js' }],
                relationships: [{ from: { type: 'Function', name: 'funcA', filePath: '/app.js' }, to: { type: 'Variable', name: 'varX', filePath: '/app.js' }, type: 'USES' }]
            };
            const resultsToProcess = [
                { id: 1, llm_output: JSON.stringify(analysisData1), file_path: '/app.js' },
                { id: 2, llm_output: JSON.stringify(analysisData2), file_path: '/app.js' }
            ];

            // Act
            await agent.processBatch(resultsToProcess);

            // Assert
            const session = neo4jDriver.session();
            try {
                const nodeCountResult = await session.run('MATCH (n) RETURN count(n) AS count');
                expect(nodeCountResult.records[0].get('count').toNumber()).toBe(2); // funcA, varX

                const relCountResult = await session.run('MATCH ()-[r:USES]->() RETURN count(r) AS count');
                expect(relCountResult.records[0].get('count').toNumber()).toBe(1);
            } finally {
                await session.close();
            }
        });

        it('GIA-PB-002: should handle malformed JSON in one result gracefully while still processing others', async () => {
            // Arrange
            const validData = {
                entities: [{ type: 'Function', name: 'goodFunc', filePath: '/good.js' }],
                relationships: []
            };
            const resultsToProcess = [
                { id: 1, llm_output: '{"bad json"', file_path: '/bad.js' },
                { id: 2, llm_output: JSON.stringify(validData), file_path: '/good.js' }
            ];

            // Mock the database records for the test
            await db.run("INSERT INTO work_queue (id, file_path, absolute_file_path, content_hash) VALUES (1, 'bad.js', '/bad.js', 'h1'), (2, 'good.js', '/good.js', 'h2')");
            await db.run("INSERT INTO analysis_results (id, work_item_id, llm_output, status, file_path, absolute_file_path) VALUES (1, 1, ?, 'ingested', ?, '/bad.js'), (2, 2, ?, 'ingested', ?, '/good.js')", [resultsToProcess[0].llm_output, resultsToProcess[0].file_path, resultsToProcess[1].llm_output, resultsToProcess[1].file_path]);

            // Act
            await agent.processBatch(resultsToProcess);

            // Assert
            // 1. Check Neo4j for the valid data
            const session = neo4jDriver.session();
            try {
                const nodeCount = await session.run('MATCH (n) RETURN count(n) AS count');
                expect(nodeCount.records[0].get('count').toNumber()).toBe(1); // Only goodFunc
                const funcNode = await session.run("MATCH (n:Function {name: 'goodFunc'}) RETURN n");
                expect(funcNode.records.length).toBe(1);
            } finally {
                await session.close();
            }

            // 2. Check SQLite for the updated status of the failed item
            const failedRow = await db.get("SELECT status, validation_errors FROM analysis_results WHERE id = 1");
            expect(failedRow.status).toBe('failed');
            expect(failedRow.validation_errors).toContain("Expected ':' after property name in JSON");

            const successRow = await db.get("SELECT status FROM analysis_results WHERE id = 2");
            expect(successRow.status).toBe('ingested');
        });
    });

    describe('GIA-RUN: run()', () => {
        it('GIA-RUN-001: should process all available results and terminate', async () => {
            // Arrange
            const data1 = { entities: [{ type: 'File', name: 'a.js', filePath: 'a.js' }, { type: 'Function', name: 'f1', filePath: 'a.js' }], relationships: [{ from: { type: 'File', name: 'a.js', filePath: 'a.js' }, to: { type: 'Function', name: 'f1', filePath: 'a.js' }, type: 'CONTAINS' }] };
            const data2 = { entities: [{ type: 'File', name: 'b.js', filePath: 'b.js' }, { type: 'Function', name: 'f2', filePath: 'b.js' }], relationships: [{ from: { type: 'File', name: 'b.js', filePath: 'b.js' }, to: { type: 'Function', name: 'f2', filePath: 'b.js' }, type: 'CONTAINS' }] };
            const data3 = { entities: [{ type: 'Function', name: 'f3', filePath: 'b.js' }], relationships: [{ from: { type: 'Function', name: 'f1', filePath: 'a.js' }, to: { type: 'Function', name: 'f2', filePath: 'b.js' }, type: 'CALLS' }, { from: { type: 'Function', name: 'f2', filePath: 'b.js' }, to: { type: 'Function', name: 'f3', filePath: 'b.js' }, type: 'CALLS' }] };
            
            await db.run("INSERT INTO work_queue (id, file_path, absolute_file_path, content_hash) VALUES (1, 'a.js', 'a.js', 'hash1'), (2, 'b.js', 'b.js', 'hash2'), (3, 'b.js', 'b.js', 'hash3')");
            await db.run("INSERT INTO analysis_results (work_item_id, file_path, absolute_file_path, llm_output, status) VALUES (1, 'a.js', 'a.js', ?, 'completed'), (2, 'b.js', 'b.js', ?, 'completed'), (3, 'b.js', 'b.js', ?, 'completed')", [JSON.stringify(data1), JSON.stringify(data2), JSON.stringify(data3)]);

            // Act
            await agent.run();

            // Assert
            const processedCountResult = await db.get("SELECT count(*) as count FROM analysis_results WHERE status = 'ingested'");
            expect(processedCountResult.count).toBe(3);

            const session = neo4jDriver.session();
            try {
                const nodeCount = await session.run('MATCH (n) RETURN count(n) AS count');
                expect(nodeCount.records[0].get('count').toNumber()).toBe(5); // f1, f2, f3, a.js, b.js
                const relCount = await session.run('MATCH ()-[r]->() RETURN count(r) AS count');
                expect(relCount.records[0].get('count').toNumber()).toBe(4);
            } finally {
                await session.close();
            }
        });

        it('GIA-RUN-002: should be idempotent and not create duplicates when run twice', async () => {
            // Arrange
            const data = { entities: [{ type: 'Class', name: 'MyClass', filePath: '/app.js' }, { type: 'Method', name: 'myMethod', filePath: '/app.js' }], relationships: [{ from: { type: 'Class', name: 'MyClass', filePath: '/app.js' }, to: { type: 'Method', name: 'myMethod', filePath: '/app.js' }, type: 'DEFINES' }] };
            await db.run("INSERT INTO work_queue (id, file_path, absolute_file_path, content_hash) VALUES (?, ?, ?, ?)", [1, '/app.js', '/app.js', 'hash1']);
            await db.run("INSERT INTO analysis_results (id, work_item_id, file_path, absolute_file_path, llm_output, status) VALUES (1, 1, '/app.js', '/app.js', ?, 'completed')", [JSON.stringify(data)]);

            // Act
            await agent.run(); // First run
            await db.run("UPDATE analysis_results SET status = 'completed' WHERE id = 1");
            await agent.run(); // Second run

            // Assert
            const session = neo4jDriver.session();
            try {
                const nodeCount = await session.run('MATCH (n) RETURN count(n) AS count');
                expect(nodeCount.records[0].get('count').toNumber()).toBe(2);
                const relCount = await session.run('MATCH ()-[r]->() RETURN count(r) AS count');
                expect(relCount.records[0].get('count').toNumber()).toBe(1);
            } finally {
                await session.close();
            }
        });
    });

    describe('GIA-SEC: Security Vulnerability Tests (Batch Processing)', () => {
        it('GIA-SEC-001: should prevent Cypher injection via node labels in processBatch', async () => {
            // Arrange
            const maliciousData = {
                entities: [
                    { type: "Function", name: 'goodFunc', filePath: '/app.js' },
                    { type: "Function` SET n.password = 'hacked", name: 'badFunc', filePath: '/app.js' }
                ],
                relationships: []
            };
            const resultsToProcess = [{ id: 1, llm_output: JSON.stringify(maliciousData), file_path: '/app.js' }];

            // Act
            await agent.processBatch(resultsToProcess);

            // Assert
            const session = neo4jDriver.session();
            try {
                // The good node should be created
                const goodNode = await session.run("MATCH (n:Function {name: 'goodFunc'}) RETURN n");
                expect(goodNode.records.length).toBe(1);

                // The malicious node should NOT be created
                const badNode = await session.run("MATCH (n {name: 'badFunc'}) RETURN n");
                expect(badNode.records.length).toBe(0);

                // Verify no properties were maliciously set
                const hackedCheck = await session.run("MATCH (n) WHERE n.password = 'hacked' RETURN n");
                expect(hackedCheck.records.length).toBe(0);
            } finally {
                await session.close();
            }
        });

        it('GIA-SEC-002: should prevent Cypher injection via relationship types in processBatch', async () => {
            // Arrange
            const maliciousData = {
                entities: [
                    { type: "Function", name: 'funcA', filePath: '/app.js' },
                    { type: "Function", name: 'funcB', filePath: '/app.js' }
                ],
                relationships: [
                    { from: { type: 'Function', name: 'funcA', filePath: '/app.js' }, to: { type: 'Function', name: 'funcB', filePath: '/app.js' }, type: "CALLS` SET a.admin = true" }
                ]
            };
            const resultsToProcess = [{ id: 1, llm_output: JSON.stringify(maliciousData), file_path: '/app.js' }];

            // Act
            await agent.processBatch(resultsToProcess);

            // Assert
            const session = neo4jDriver.session();
            try {
                // The nodes should exist
                const nodeCount = await session.run("MATCH (n:Function) RETURN count(n) as count");
                expect(nodeCount.records[0].get('count').toNumber()).toBe(2);

                // The malicious relationship should NOT have been created
                const relCount = await session.run("MATCH ()-[r]->() RETURN count(r) as count");
                expect(relCount.records[0].get('count').toNumber()).toBe(0);

                // Verify no properties were maliciously set
                const adminCheck = await session.run("MATCH (n) WHERE n.admin = true RETURN n");
                expect(adminCheck.records.length).toBe(0);
            } finally {
                await session.close();
            }
        });

        it('GIA-SEC-003: should prevent Cypher injection via relationship node labels in processBatch', async () => {
            // Arrange
            const maliciousData = {
                entities: [
                    { type: "Function", name: 'funcA', filePath: '/app.js' },
                    { type: "Function", name: 'funcB', filePath: '/app.js' }
                ],
                relationships: [
                    { from: { type: "Function` SET a.admin = true", name: 'funcA', filePath: '/app.js' }, to: { type: 'Function', name: 'funcB', filePath: '/app.js' }, type: "CALLS" }
                ]
            };
            const resultsToProcess = [{ id: 1, llm_output: JSON.stringify(maliciousData), file_path: '/app.js' }];

            // Act
            await agent.processBatch(resultsToProcess);

            // Assert
            const session = neo4jDriver.session();
            try {
                // The nodes should exist
                const nodeCount = await session.run("MATCH (n:Function) RETURN count(n) as count");
                expect(nodeCount.records[0].get('count').toNumber()).toBe(2);

                // The malicious relationship should NOT have been created
                const relCount = await session.run("MATCH ()-[r]->() RETURN count(r) as count");
                expect(relCount.records[0].get('count').toNumber()).toBe(0);

                // Verify no properties were maliciously set
                const adminCheck = await session.run("MATCH (n) WHERE n.admin = true RETURN n");
                expect(adminCheck.records.length).toBe(0);
            } finally {
                await session.close();
            }
        });
    });
});