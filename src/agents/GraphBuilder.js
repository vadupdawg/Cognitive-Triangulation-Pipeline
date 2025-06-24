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
     * @param {Object} config - Configuration object
     * @param {string} config.databasePath - Path to SQLite database
     * @param {string} config.neo4jUri - Neo4j connection URI
     * @param {string} config.neo4jUser - Neo4j username
     * @param {string} config.neo4jPassword - Neo4j password
     * @param {number} config.batchSize - Batch size for database operations (default: 100)
     * @param {string[]} config.allowedRelationshipTypes - Allowed relationship types for security
     */
    constructor(config) {
        // Validate required configuration
        if (!config) {
            throw new Error('Configuration object is required');
        }

        if (!config.databasePath) {
            throw new Error('databasePath is required in configuration');
        }

        if (!config.neo4jUri) {
            throw new Error('neo4jUri is required in configuration');
        }
        if (!config.neo4jUser) {
            throw new Error('neo4jUser is required in configuration');
        }
        if (!config.neo4jPassword) {
            throw new Error('neo4jPassword is required in configuration');
        }

        this.config = {
            databasePath: config.databasePath,
            neo4jUri: config.neo4jUri,
            neo4jUser: config.neo4jUser,
            neo4jPassword: config.neo4jPassword,
            batchSize: config.batchSize || 100,
            allowedRelationshipTypes: config.allowedRelationshipTypes || [
                'CALLS', 'IMPLEMENTS', 'INHERITS_FROM', 'DEPENDS_ON',
                'USES_DATA_FROM', 'CONTAINS', 'IMPORTS', 'EXPORTS',
                'EXTENDS', 'USES'
            ]
        };

        // Initialize connection objects as null
        this.neo4jDriver = null;
        this.dbManager = new DatabaseManager(this.config.databasePath);
        this.db = null;
    }

    /**
     * Initialize connections to both SQLite and Neo4j databases
     * @throws {Error} If Neo4j connection fails
     */
    async init() {
        try {
            // Initialize SQLite connection
            this.db = this.dbManager.getDb();
            
            // Initialize Neo4j connection
            this.neo4jDriver = neo4j.driver(
                this.config.neo4jUri,
                neo4j.auth.basic(this.config.neo4jUser, this.config.neo4jPassword)
            );

            // Verify Neo4j connectivity
            await this.neo4jDriver.verifyConnectivity();
            
        } catch (error) {
            // Clean up any partially initialized connections
            await this.close();
            throw new Error(`Failed to initialize GraphBuilder connections: ${error.message}`);
        }
    }

    /**
     * Close all database connections and clean up resources
     */
    async close() {
        const errors = [];

        // Close Neo4j driver if it exists
        if (this.neo4jDriver) {
            try {
                await this.neo4jDriver.close();
            } catch (error) {
                errors.push(`Neo4j close error: ${error.message}`);
            } finally {
                this.neo4jDriver = null;
            }
        }

        // Close SQLite connection via the manager
        if (this.dbManager) {
            this.dbManager.close();
        }
        this.db = null;

        // If there were errors during cleanup, log them but don't throw
        if (errors.length > 0) {
            console.warn('Errors during GraphBuilder cleanup:', errors);
        }
    }

    /**
     * Main entry point for the graph building process.
     * This version streams data from SQLite to Neo4j to minimize memory usage.
     */
    async run() {
        if (!this.neo4jDriver || !this.db) {
            throw new Error('GraphBuilder must be initialized before running. Call init() first.');
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
        const query = `SELECT report FROM file_analysis_reports`;
        const stmt = this.db.prepare(query);

        try {
            let batch = [];
            for (const row of stmt.iterate()) {
                try {
                    if (row.report) {
                        const poi = JSON.parse(row.report);
                        if (poi && poi.id) {
                            batch.push(poi);
                        }
                    }
                } catch (e) {
                    console.warn(`Skipping malformed POI report JSON: ${e.message}`);
                    continue;
                }

                if (batch.length >= this.config.batchSize) {
                    await this._runNodeBatch(session, batch);
                    batch = [];
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
        const query = `SELECT summary FROM project_analysis_summaries`;
        const stmt = this.db.prepare(query);

        try {
            let batch = [];
            for (const row of stmt.iterate()) {
                try {
                    if (row.summary) {
                        const summary = JSON.parse(row.summary);
                        if (summary && Array.isArray(summary.relationships)) {
                            const validRels = summary.relationships.filter(rel =>
                                this.config.allowedRelationshipTypes.includes(rel.type)
                            );
                            batch.push(...validRels);
                        }
                    }
                } catch (e) {
                    console.warn(`Skipping malformed relationship summary JSON: ${e.message}`);
                    continue;
                }

                if (batch.length >= this.config.batchSize) {
                    await this._runRelationshipBatch(session, batch);
                    batch = [];
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
        const cypher = `
            UNWIND $batch as rel
            MATCH (source:POI {id: rel.sourcePoi})
            MATCH (target:POI {id: rel.targetPoi})
            CALL apoc.merge.relationship(
                source,
                rel.type,
                {},
                { confidence: rel.confidence, explanation: rel.explanation },
                target
            )
            YIELD rel as result
            RETURN count(result)
        `;
        try {
            await session.run(cypher, { batch });
        } catch (error) {
            if (error.message.includes('apoc.merge.relationship')) {
                console.error(
                    'APOC procedure not found. Please ensure the APOC plugin is installed in Neo4j.'
                );
                throw new Error(
                    'Missing APOC plugin in Neo4j, which is required for relationship persistence. ' +
                    'Please see installation instructions for APOC.'
                );
            }
            throw error;
        }
    }
}

module.exports = GraphBuilder;