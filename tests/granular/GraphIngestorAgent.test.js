// @ts-check
require('dotenv').config();
const ProductionAgentFactory = require('../../src/utils/productionAgentFactory');
const neo4jDriver = require('../../src/utils/neo4jDriver');

describe('GraphIngestorAgent Production Tests', () => {
    let factory;
    let graphIngestor;
    let connections;

    beforeAll(async () => {
        // Initialize production factory
        factory = new ProductionAgentFactory();
        
        // Test connections
        console.log('\n=== Testing Production Connections ===');
        connections = await factory.testConnections();
        
        if (!connections.sqlite) {
            throw new Error('SQLite is required for GraphIngestorAgent tests');
        }
        
        if (!connections.neo4j) {
            console.warn('⚠️  Neo4j not available - some tests may be skipped');
        }

        // Initialize database with schema
        await factory.initializeDatabase();
        
        // Create production GraphIngestorAgent
        graphIngestor = factory.createGraphIngestorAgent();
        
        console.log('Production GraphIngestorAgent environment ready');
    }, 60000);

    afterAll(async () => {
        if (factory) {
            await factory.cleanup();
        }
    });

    beforeEach(async () => {
        // Clean database before each test
        const db = await factory.getSqliteConnection();
        try {
            await db.exec('DELETE FROM analysis_results');
            await db.exec('DELETE FROM work_queue');
        } finally {
            await db.close();
        }
        
        // Clean Neo4j if available
        if (connections.neo4j) {
            const { NEO4J_DATABASE } = require('../../src/config');
            const session = neo4jDriver.session({ database: NEO4J_DATABASE });
            try {
                await session.run('MATCH (n) DETACH DELETE n');
            } finally {
                await session.close();
            }
        }
    });

    async function setupAnalysisResult(filePath, llmOutput) {
        const db = await factory.getSqliteConnection();
        try {
            const workItemRes = await db.run(
                "INSERT INTO work_queue (file_path, content_hash, status) VALUES (?, ?, 'completed')",
                [filePath, 'test-hash-ingest']
            );
            const workItemId = workItemRes.lastID;

            const analysisRes = await db.run(
                "INSERT INTO analysis_results (work_item_id, file_path, llm_output, status) VALUES (?, ?, ?, 'pending_ingestion')",
                [workItemId, filePath, JSON.stringify(llmOutput)]
            );
            return { analysisId: analysisRes.lastID, workItemId };
        } finally {
            await db.close();
        }
    }

    describe('Successful Ingestion', () => {
        test('GRAPH-PROD-001: Ingests a single, simple analysis result correctly', async () => {
            if (!connections.neo4j) {
                console.log('Skipping Neo4j test - database not available');
                return;
            }

            const llmOutput = {
                filePath: 'test.js',
                entities: [{ name: 'varA', qualifiedName: 'test.js--varA', type: 'Variable' }],
                relationships: []
            };
            const { analysisId } = await setupAnalysisResult('test.js', llmOutput);

            // Get analysis batch for ingestion
            const db = await factory.getSqliteConnection();
            let analysisBatch;
            try {
                analysisBatch = await db.all('SELECT * FROM analysis_results');
            } finally {
                await db.close();
            }

            // Process batch with production GraphIngestorAgent
            await graphIngestor.processBatch(analysisBatch, []);

            // Verify node was created in Neo4j
            const { NEO4J_DATABASE } = require('../../src/config');
            const session = neo4jDriver.session({ database: NEO4J_DATABASE });
            try {
                // Debug: Check what nodes were actually created
                const allNodes = await session.run('MATCH (n) RETURN n.qualifiedName as qName, labels(n) as labels');
                console.log('All nodes in Neo4j:', allNodes.records.map(r => ({ qName: r.get('qName'), labels: r.get('labels') })));
                
                const result = await session.run('MATCH (n:Variable {qualifiedName: $qName}) RETURN n', { qName: 'test.js--varA' });
                expect(result.records).toHaveLength(1);
                const node = result.records[0].get('n').properties;
                expect(node.qualifiedName).toBe('test.js--varA');
            } finally {
                await session.close();
            }

            // Verify status was updated to ingested
            const db2 = await factory.getSqliteConnection();
            try {
                const analysisItem = await db2.get('SELECT status FROM analysis_results WHERE id = ?', [analysisId]);
                expect(analysisItem.status).toBe('ingested');
            } finally {
                await db2.close();
            }
        });

        test('GRAPH-PROD-002: Ingests an analysis result with entities and relationships', async () => {
            if (!connections.neo4j) {
                console.log('Skipping Neo4j test - database not available');
                return;
            }

            const llmOutput = {
                filePath: 'app.js',
                entities: [
                    { name: 'myFunc', qualifiedName: 'app.js--myFunc', type: 'Function' },
                    { name: 'helper', qualifiedName: 'util.js--helper', type: 'Function' }
                ],
                relationships: [{
                    source_qualifiedName: 'app.js--myFunc',
                    target_qualifiedName: 'util.js--helper',
                    type: 'CALLS'
                }]
            };
            await setupAnalysisResult('app.js', llmOutput);

            // Get analysis batch for ingestion
            const db = await factory.getSqliteConnection();
            let analysisBatch;
            try {
                analysisBatch = await db.all('SELECT * FROM analysis_results');
            } finally {
                await db.close();
            }

            // Process batch with production GraphIngestorAgent
            await graphIngestor.processBatch(analysisBatch, []);

            // Verify relationship was created in Neo4j
            const { NEO4J_DATABASE } = require('../../src/config');
            const session = neo4jDriver.session({ database: NEO4J_DATABASE });
            try {
                const result = await session.run('MATCH (a:Function)-[r:CALLS]->(b:Function) WHERE a.qualifiedName = $source AND b.qualifiedName = $target RETURN r', {
                    source: 'app.js--myFunc',
                    target: 'util.js--helper'
                });
                expect(result.records).toHaveLength(1);
            } finally {
                await session.close();
            }
        });
    });

    describe('Error Handling', () => {
        test('GRAPH-PROD-003: Handles invalid JSON in the database gracefully', async () => {
            // Setup invalid JSON in database
            const db = await factory.getSqliteConnection();
            let workItemId;
            try {
                const workItemRes = await db.run("INSERT INTO work_queue (file_path, content_hash, status) VALUES ('bad.js', 'bad-hash', 'completed')");
                workItemId = workItemRes.lastID;
                await db.run("INSERT INTO analysis_results (work_item_id, file_path, llm_output, status) VALUES (?, ?, ?, 'pending_ingestion')", [workItemId, 'bad.js', 'this is not json']);
            } finally {
                await db.close();
            }

            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            
            // Get analysis batch and process
            const db2 = await factory.getSqliteConnection();
            let analysisBatch;
            try {
                analysisBatch = await db2.all('SELECT * FROM analysis_results');
            } finally {
                await db2.close();
            }

            // Should handle invalid JSON gracefully
            await graphIngestor.processBatch(analysisBatch, []);

            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Skipping record'), expect.any(String));
            
            // Verify no nodes were created if Neo4j is available
            if (connections.neo4j) {
                const { NEO4J_DATABASE } = require('../../src/config');
                const session = neo4jDriver.session({ database: NEO4J_DATABASE });
                try {
                    const result = await session.run('MATCH (n) RETURN count(n) as count');
                    expect(result.records[0].get('count').low).toBe(0);
                } finally {
                    await session.close();
                }
            }
            
            consoleErrorSpy.mockRestore();
        });
    });
});