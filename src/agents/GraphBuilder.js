const neo4j = require('neo4j-driver');
const DatabaseManager = require('../utils/sqliteDb');

/**
 * GraphBuilder Agent
 * 
 * The final component in the Cognitive Triangulation pipeline that persists
 * discovered POIs and relationships into a Neo4j graph database.
 * 
 * This agent sources all data from the central SQLite database and creates
 * an idempotent, queryable graph structure.
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
            batchSize: 100,
            allowedRelationshipTypes: [
                'CALLS', 'IMPLEMENTS', 'INHERITS_FROM', 'DEPENDS_ON',
                'USES_DATA_FROM', 'CONTAINS', 'IMPORTS', 'EXPORTS',
                'EXTENDS', 'USES'
            ]
        };
    }

    /**
     * Main entry point for the graph building process.
     * This version streams data from SQLite to Neo4j to minimize memory usage.
     */
    async run() {
        if (!this.neo4jDriver || !this.db) {
            throw new Error('GraphBuilder requires valid database connections.');
        }

        try {
            console.log('Starting node persistence...');
            await this._persistNodes();
            console.log('Node persistence complete.');

            console.log('Starting relationship persistence...');
            await this._persistRelationships();
            console.log('Relationship persistence complete.');

            console.log('Graph building complete.');
        } catch (error) {
            console.error('Error during graph building:', error);
            throw error;
        }
    }

    /**
     * Streams POIs from SQLite and persists them as nodes in Neo4j.
     * This method avoids loading all POIs into memory at once.
     */
    async _persistNodes() {
        const session = this.neo4jDriver.session({ database: process.env.NEO4J_DATABASE || 'neo4j' });
        const query = `SELECT p.*, f.path as file_path FROM pois p JOIN files f ON p.file_id = f.id`;
        const stmt = this.db.prepare(query);

        try {
            let batch = [];
            for (const row of stmt.iterate()) {
                try {
                    // Create a POI node object from the database row
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
                    
                    batch.push(poi);

                    if (batch.length >= this.config.batchSize) {
                        await this._runNodeBatch(session, batch);
                        batch = [];
                    }
                } catch (e) {
                    console.warn(`Skipping malformed POI row: ${e.message}`);
                    continue;
                }
            }

            // Process any remaining items in the last batch
            if (batch.length > 0) {
                await this._runNodeBatch(session, batch);
            }
        } finally {
            await session.close();
        }
    }

    /**
     * Executes a batch of node persistence queries against Neo4j.
     * @param {import('neo4j-driver').Session} session - The Neo4j session.
     * @param {Array<Object>} batch - An array of POI objects.
     */
    async _runNodeBatch(session, batch) {
        const cypher = `
            UNWIND $batch as poi
            MERGE (p:POI {id: poi.id})
            ON CREATE SET p += poi
            ON MATCH SET p += poi
        `;
        await session.run(cypher, { batch });
    }

    /**
     * Streams relationships from SQLite and persists them as edges in Neo4j.
     * This method avoids loading all relationships into memory at once.
     */
    async _persistRelationships() {
        const session = this.neo4jDriver.session({ database: process.env.NEO4J_DATABASE || 'neo4j' });
        const query = `SELECT * FROM relationships`;
        const stmt = this.db.prepare(query);

        try {
            let batch = [];
            for (const row of stmt.iterate()) {
                try {
                    // Create a relationship object from the database row
                    const relationship = {
                        sourcePoi: row.source_poi_id,
                        targetPoi: row.target_poi_id,
                        type: row.type,
                        explanation: row.reason,
                        confidence: 0.8 // Default confidence since it's not stored in the current schema
                    };
                    
                    // Filter by allowed relationship types
                    if (this.config.allowedRelationshipTypes.includes(relationship.type)) {
                        batch.push(relationship);
                    }

                    if (batch.length >= this.config.batchSize) {
                        await this._runRelationshipBatch(session, batch);
                        batch = [];
                    }
                } catch (e) {
                    console.warn(`Skipping malformed relationship row: ${e.message}`);
                    continue;
                }
            }

            // Process any remaining items in the last batch
            if (batch.length > 0) {
                await this._runRelationshipBatch(session, batch);
            }
        } finally {
            await session.close();
        }
    }

    /**
     * Executes a batch of relationship persistence queries against Neo4j.
     * @param {import('neo4j-driver').Session} session - The Neo4j session.
     * @param {Array<Object>} batch - An array of relationship objects.
     */
    async _runRelationshipBatch(session, batch) {
        // Use standard Cypher instead of APOC to avoid dependency issues
        const cypher = `
            UNWIND $batch as rel
            MATCH (source:POI {id: rel.sourcePoi})
            MATCH (target:POI {id: rel.targetPoi})
            CALL {
                WITH source, target, rel
                WITH source, target, rel.type as relType, rel.confidence as confidence, rel.explanation as explanation
                CALL apoc.create.relationship(source, relType, {confidence: confidence, explanation: explanation}, target)
                YIELD rel as createdRel
                RETURN createdRel
            }
            RETURN count(*) as relationshipsCreated
        `;
        
        // Fallback to basic Cypher if APOC is not available
        const basicCypher = `
            UNWIND $batch as rel
            MATCH (source:POI {id: rel.sourcePoi})
            MATCH (target:POI {id: rel.targetPoi})
            WITH source, target, rel
            FOREACH (dummy IN CASE WHEN rel.type = 'CALLS' THEN [1] ELSE [] END |
                CREATE (source)-[:CALLS {confidence: rel.confidence, explanation: rel.explanation}]->(target)
            )
            FOREACH (dummy IN CASE WHEN rel.type = 'IMPORTS' THEN [1] ELSE [] END |
                CREATE (source)-[:IMPORTS {confidence: rel.confidence, explanation: rel.explanation}]->(target)
            )
            FOREACH (dummy IN CASE WHEN rel.type = 'EXTENDS' THEN [1] ELSE [] END |
                CREATE (source)-[:EXTENDS {confidence: rel.confidence, explanation: rel.explanation}]->(target)
            )
            FOREACH (dummy IN CASE WHEN rel.type = 'IMPLEMENTS' THEN [1] ELSE [] END |
                CREATE (source)-[:IMPLEMENTS {confidence: rel.confidence, explanation: rel.explanation}]->(target)
            )
            FOREACH (dummy IN CASE WHEN rel.type = 'USES' THEN [1] ELSE [] END |
                CREATE (source)-[:USES {confidence: rel.confidence, explanation: rel.explanation}]->(target)
            )
            FOREACH (dummy IN CASE WHEN rel.type = 'DEPENDS_ON' THEN [1] ELSE [] END |
                CREATE (source)-[:DEPENDS_ON {confidence: rel.confidence, explanation: rel.explanation}]->(target)
            )
            FOREACH (dummy IN CASE WHEN rel.type = 'CONTAINS' THEN [1] ELSE [] END |
                CREATE (source)-[:CONTAINS {confidence: rel.confidence, explanation: rel.explanation}]->(target)
            )
            FOREACH (dummy IN CASE WHEN rel.type = 'INHERITS_FROM' THEN [1] ELSE [] END |
                CREATE (source)-[:INHERITS_FROM {confidence: rel.confidence, explanation: rel.explanation}]->(target)
            )
            FOREACH (dummy IN CASE WHEN rel.type = 'EXPORTS' THEN [1] ELSE [] END |
                CREATE (source)-[:EXPORTS {confidence: rel.confidence, explanation: rel.explanation}]->(target)
            )
            RETURN count(*) as relationshipsCreated
        `;
        
        try {
            // Try APOC first, fall back to basic Cypher
            await session.run(cypher, { batch });
        } catch (error) {
            if (error.message.includes('apoc.create.relationship') || error.message.includes('Unknown procedure')) {
                console.warn('APOC not available, using basic Cypher for relationship creation');
                await session.run(basicCypher, { batch });
            } else {
                throw error;
            }
        }
    }
}

module.exports = GraphBuilder;