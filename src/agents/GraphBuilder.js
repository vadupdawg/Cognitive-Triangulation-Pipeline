const neo4j = require('neo4j-driver');
const DatabaseManager = require('../utils/sqliteDb');
const config = require('../config');

/**
 * GraphBuilder Agent
 * 
 * High-performance parallel graph builder that persists POIs and relationships 
 * from SQLite into Neo4j using optimized batch operations and parallel processing.
 */
class GraphBuilder {
    /**
     * @param {Object} db - SQLite database connection
     * @param {Object} neo4jDriver - Neo4j driver instance
     */
    constructor(db, neo4jDriver) {
        this.db = db;
        this.neo4jDriver = neo4jDriver;
        
        this.config = {
            batchSize: 500, // Larger batches for better performance
            maxConcurrentBatches: 2, // Reduced to avoid deadlocks
            allowedRelationshipTypes: [
                'CALLS', 'IMPLEMENTS', 'INHERITS_FROM', 'DEPENDS_ON',
                'USES_DATA_FROM', 'CONTAINS', 'IMPORTS', 'EXPORTS',
                'EXTENDS', 'USES', 'REFERENCES'
            ]
        };
    }

    /**
     * Main entry point for the graph building process.
     * Runs node and relationship persistence in parallel for maximum performance.
     */
    async run() {
        if (!this.neo4jDriver || !this.db) {
            throw new Error('GraphBuilder requires valid database connections.');
        }

        try {
            console.log('Starting parallel graph building...');
            
            // Get total counts for progress tracking
            const nodeCount = this.db.prepare('SELECT COUNT(*) as count FROM pois').get().count;
            const relCount = this.db.prepare('SELECT COUNT(*) as count FROM relationships WHERE type IN (' + 
                this.config.allowedRelationshipTypes.map(() => '?').join(',') + ')').get(...this.config.allowedRelationshipTypes).count;
            
            console.log(`Processing ${nodeCount} nodes and ${relCount} relationships...`);

            // Run node and relationship persistence in parallel
            const [nodeStats, relationshipStats] = await Promise.all([
                this._persistNodesParallel(),
                this._persistRelationshipsParallel()
            ]);

            console.log('Graph building complete.');
            console.log(`Node persistence: ${nodeStats.processed} processed, ${nodeStats.created} created`);
            console.log(`Relationship persistence: ${relationshipStats.processed} processed, ${relationshipStats.created} created`);
            
            return { nodeStats, relationshipStats };
        } catch (error) {
            console.error('Error during graph building:', error);
            throw error;
        }
    }

    /**
     * Parallel node persistence with optimized batching
     */
    async _persistNodesParallel() {
        const query = `SELECT p.*, f.path AS file_path FROM pois p JOIN files f ON p.file_id = f.id`;
        const stmt = this.db.prepare(query);
        
        const batches = [];
        let currentBatch = [];
        
        // Create batches
        for (const row of stmt.iterate()) {
            try {
                const poi = {
                    id: row.id,
                    name: row.name,
                    type: row.type,
                    description: row.description,
                    line_number: row.line_number,
                    is_exported: row.is_exported,
                    file_path: row.file_path,
                    file_id: row.file_id
                };
                
                currentBatch.push(poi);
                
                if (currentBatch.length >= this.config.batchSize) {
                    batches.push([...currentBatch]);
                    currentBatch = [];
                }
            } catch (e) {
                console.warn(`Skipping malformed POI row: ${e.message}`);
            }
        }
        
        if (currentBatch.length > 0) {
            batches.push(currentBatch);
        }

        console.log(`Created ${batches.length} node batches`);
        
        // Process batches in parallel
        let totalProcessed = 0;
        let totalCreated = 0;
        
        for (let i = 0; i < batches.length; i += this.config.maxConcurrentBatches) {
            const batchGroup = batches.slice(i, i + this.config.maxConcurrentBatches);
            
            const results = await Promise.all(
                batchGroup.map(batch => this._runNodeBatchOptimized(batch))
            );
            
            results.forEach(result => {
                totalProcessed += result.processed;
                totalCreated += result.created;
            });
            
            console.log(`Node progress: ${Math.min(i + this.config.maxConcurrentBatches, batches.length)}/${batches.length} batches completed`);
        }
        
        return { processed: totalProcessed, created: totalCreated };
    }

    /**
     * Parallel relationship persistence with optimized batching
     */
    async _persistRelationshipsParallel() {
        const query = `SELECT * FROM relationships WHERE type IN (${this.config.allowedRelationshipTypes.map(() => '?').join(',')})`;
        const stmt = this.db.prepare(query);
        
        const batches = [];
        let currentBatch = [];
        
        // Create batches
        for (const row of stmt.iterate(...this.config.allowedRelationshipTypes)) {
            try {
                const relationship = {
                    sourcePoi: row.source_poi_id,
                    targetPoi: row.target_poi_id,
                    type: row.type,
                    explanation: row.reason || '',
                    confidence: 0.8
                };
                
                currentBatch.push(relationship);
                
                if (currentBatch.length >= this.config.batchSize) {
                    batches.push([...currentBatch]);
                    currentBatch = [];
                }
            } catch (e) {
                console.warn(`Skipping malformed relationship row: ${e.message}`);
            }
        }
        
        if (currentBatch.length > 0) {
            batches.push(currentBatch);
        }

        console.log(`Created ${batches.length} relationship batches`);
        
        // Process batches SEQUENTIALLY to avoid Neo4j deadlocks
        // Parallel processing was causing lock contention on shared nodes
        let totalProcessed = 0;
        let totalCreated = 0;
        
        for (let i = 0; i < batches.length; i++) {
            const batch = batches[i];
            console.log(`Relationship progress: ${i + 1}/${batches.length} batches processing...`);
            
            const result = await this._runRelationshipBatchOptimized(batch);
            totalProcessed += result.processed;
            totalCreated += result.created;
            
            console.log(`Relationship progress: ${i + 1}/${batches.length} batches completed (${result.created} relationships created)`);
        }
        
        return { processed: totalProcessed, created: totalCreated };
    }

    /**
     * Optimized node batch processing with proper labels
     */
    async _runNodeBatchOptimized(batch) {
        const session = this.neo4jDriver.session({ database: config.NEO4J_DATABASE });
        
        try {
            // Use a single, efficient query that creates nodes with proper labels
            const cypher = `
                UNWIND $batch as poi
                CALL {
                    WITH poi
                    CALL apoc.create.node([poi.type], poi) YIELD node
                    RETURN node
                } IN TRANSACTIONS OF 100 ROWS
                RETURN count(*) as created
            `;
            
            // Fallback without APOC
            const fallbackCypher = `
                UNWIND $batch as poi
                CALL {
                    WITH poi
                    WITH poi, 
                         CASE poi.type 
                             WHEN 'Function' THEN 'Function'
                             WHEN 'Class' THEN 'Class'
                             WHEN 'Variable' THEN 'Variable'
                             WHEN 'File' THEN 'File'
                             WHEN 'Table' THEN 'Table'
                             WHEN 'Database' THEN 'Database'
                             WHEN 'View' THEN 'View'
                             ELSE 'POI'
                         END as label
                    CREATE (n)
                    SET n = poi
                    SET n:POI
                    CALL apoc.create.addLabels(n, [label]) YIELD node
                    RETURN node
                } IN TRANSACTIONS OF 100 ROWS
                RETURN count(*) as created
            `;
            
            // Basic fallback without any APOC
            const basicCypher = `
                UNWIND $batch as poi
                MERGE (n:POI {id: poi.id})
                SET n += poi
                RETURN count(n) as created
            `;

            let result;
            try {
                result = await session.run(cypher, { batch });
            } catch (error) {
                if (error.message.includes('apoc') || error.message.includes('Unknown procedure')) {
                    console.warn('APOC not available for nodes, trying fallback');
                    try {
                        result = await session.run(fallbackCypher, { batch });
                    } catch (fallbackError) {
                        console.warn('APOC fallback failed, using basic MERGE');
                        result = await session.run(basicCypher, { batch });
                    }
                } else {
                    throw error;
                }
            }

            const created = result.records[0]?.get('created')?.low || 0;
            return { processed: batch.length, created };
            
        } finally {
            await session.close();
        }
    }

    /**
     * Optimized relationship batch processing
     */
    async _runRelationshipBatchOptimized(batch) {
        const session = this.neo4jDriver.session({ database: process.env.NEO4J_DATABASE || 'neo4j' });
        
        try {
            // Simple approach that works - create relationships directly
            const cypher = `
                UNWIND $batch as rel
                MATCH (source {id: rel.sourcePoi})
                MATCH (target {id: rel.targetPoi})
                CALL apoc.create.relationship(source, rel.type, {
                    confidence: rel.confidence, 
                    explanation: rel.explanation
                }, target) YIELD rel as createdRel
                RETURN count(createdRel) as created
            `;
            
            // Fallback without APOC - simple dynamic creation
            const fallbackCypher = `
                UNWIND $batch as rel
                MATCH (source {id: rel.sourcePoi})
                MATCH (target {id: rel.targetPoi})
                WITH source, target, rel
                CALL apoc.cypher.doIt(
                    'CREATE (source)-[r:' + rel.type + ' {confidence: $props.confidence, explanation: $props.explanation}]->(target) RETURN r',
                    {source: source, target: target, props: {confidence: rel.confidence, explanation: rel.explanation}}
                ) YIELD value
                RETURN count(value) as created
            `;
            
            // Basic approach - create relationships by type
            const basicCypher = `
                UNWIND $batch as rel
                MATCH (source {id: rel.sourcePoi})
                MATCH (target {id: rel.targetPoi})
                WITH source, target, rel
                CALL {
                    WITH source, target, rel
                    WITH source, target, rel
                    WHERE rel.type = 'CALLS'
                    CREATE (source)-[:CALLS {confidence: rel.confidence, explanation: rel.explanation}]->(target)
                    RETURN 1 as created
                    UNION ALL
                    WITH source, target, rel
                    WHERE rel.type = 'IMPORTS'
                    CREATE (source)-[:IMPORTS {confidence: rel.confidence, explanation: rel.explanation}]->(target)
                    RETURN 1 as created
                    UNION ALL
                    WITH source, target, rel
                    WHERE rel.type = 'EXTENDS'
                    CREATE (source)-[:EXTENDS {confidence: rel.confidence, explanation: rel.explanation}]->(target)
                    RETURN 1 as created
                    UNION ALL
                    WITH source, target, rel
                    WHERE rel.type = 'IMPLEMENTS'
                    CREATE (source)-[:IMPLEMENTS {confidence: rel.confidence, explanation: rel.explanation}]->(target)
                    RETURN 1 as created
                    UNION ALL
                    WITH source, target, rel
                    WHERE rel.type = 'USES'
                    CREATE (source)-[:USES {confidence: rel.confidence, explanation: rel.explanation}]->(target)
                    RETURN 1 as created
                    UNION ALL
                    WITH source, target, rel
                    WHERE rel.type = 'DEPENDS_ON'
                    CREATE (source)-[:DEPENDS_ON {confidence: rel.confidence, explanation: rel.explanation}]->(target)
                    RETURN 1 as created
                    UNION ALL
                    WITH source, target, rel
                    WHERE rel.type = 'CONTAINS'
                    CREATE (source)-[:CONTAINS {confidence: rel.confidence, explanation: rel.explanation}]->(target)
                    RETURN 1 as created
                    UNION ALL
                    WITH source, target, rel
                    WHERE rel.type = 'INHERITS_FROM'
                    CREATE (source)-[:INHERITS_FROM {confidence: rel.confidence, explanation: rel.explanation}]->(target)
                    RETURN 1 as created
                    UNION ALL
                    WITH source, target, rel
                    WHERE rel.type = 'EXPORTS'
                    CREATE (source)-[:EXPORTS {confidence: rel.confidence, explanation: rel.explanation}]->(target)
                    RETURN 1 as created
                    UNION ALL
                    WITH source, target, rel
                    WHERE rel.type = 'REFERENCES'
                    CREATE (source)-[:REFERENCES {confidence: rel.confidence, explanation: rel.explanation}]->(target)
                    RETURN 1 as created
                }
                RETURN sum(created) as created
            `;

            let result;
            try {
                result = await session.run(cypher, { batch });
            } catch (error) {
                if (error.message.includes('apoc') || error.message.includes('Unknown procedure')) {
                    console.warn('APOC not available for relationships, trying fallback');
                    try {
                        result = await session.run(fallbackCypher, { batch });
                    } catch (fallbackError) {
                        console.warn('APOC fallback failed, using basic UNION approach');
                        result = await session.run(basicCypher, { batch });
                    }
                } else {
                    throw error;
                }
            }

            const created = result.records[0]?.get('created')?.low || 0;
            return { processed: batch.length, created };
            
        } finally {
            await session.close();
        }
    }
}

module.exports = GraphBuilder;