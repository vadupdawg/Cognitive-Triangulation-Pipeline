const neo4j = require('neo4j-driver');
const { getDb } = require('../utils/sqliteDb');

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

        this.config = {
            databasePath: config.databasePath,
            neo4jUri: config.neo4jUri,
            neo4jUser: config.neo4jUser || 'neo4j',
            neo4jPassword: config.neo4jPassword || 'password',
            batchSize: config.batchSize || 100,
            allowedRelationshipTypes: config.allowedRelationshipTypes || [
                'CALLS', 'IMPLEMENTS', 'INHERITS_FROM', 'DEPENDS_ON', 
                'USES_DATA_FROM', 'CONTAINS', 'IMPORTS', 'EXPORTS', 
                'EXTENDS', 'USES'
            ]
        };

        // Initialize connection objects as null
        this.neo4jDriver = null;
        this.db = null;
    }

    /**
     * Initialize connections to both SQLite and Neo4j databases
     * @throws {Error} If Neo4j connection fails
     */
    async init() {
        try {
            // Initialize SQLite connection
            this.db = getDb(this.config.databasePath);
            
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

        // SQLite connection is managed by the utility module
        // We just need to null our reference
        this.db = null;

        // If there were errors during cleanup, log them but don't throw
        if (errors.length > 0) {
            console.warn('Errors during GraphBuilder cleanup:', errors);
        }
    }

    /**
     * Main entry point for the graph building process
     * Orchestrates loading data from SQLite and persisting to Neo4j
     */
    async run() {
        if (!this.neo4jDriver || !this.db) {
            throw new Error('GraphBuilder must be initialized before running. Call init() first.');
        }

        try {
            // Load all data from the database first
            const poiMap = await this._loadAllPoisFromDb();
            const relationships = await this._loadRelationshipsFromDb();

            if (poiMap.size === 0) {
                console.log('No POIs found in the database to process.');
                return;
            }

            // Persist all nodes first, then relationships
            await this._persistNodes(poiMap);

            // Filter relationships to ensure type safety
            const validRelationships = relationships.filter(rel =>
                this.config.allowedRelationshipTypes.includes(rel.type)
            );
            
            await this._persistRelationships(validRelationships);

            console.log('Graph building complete.');
        } catch (error) {
            console.error('Error during graph building:', error);
            throw error;
        }
    }

    /**
     * Load all POIs from the analysis_results table in SQLite
     * @returns {Promise<Map<string, Object>>} Map of UPID to POI objects
     */
    async _loadAllPoisFromDb() {
        // Implementation stub - will be expanded in future iterations
        return new Map();
    }

    /**
     * Load relationships from the SQLite database
     * @returns {Promise<Array>} Array of relationship objects
     */
    async _loadRelationshipsFromDb() {
        // Implementation stub - will be expanded in future iterations
        return [];
    }

    /**
     * Persist POIs as nodes in Neo4j using idempotent MERGE queries
     * @param {Map<string, Object>} poiMap - Map of UPID to POI objects
     */
    async _persistNodes(poiMap) {
        if (!poiMap || poiMap.size === 0) {
            return;
        }

        const session = this.neo4jDriver.session();
        try {
            // Convert Map values to array and process in batches
            const allPois = Array.from(poiMap.values());
            
            // Process in batches for better performance with large datasets
            for (let i = 0; i < allPois.length; i += this.config.batchSize) {
                const batch = allPois.slice(i, i + this.config.batchSize);
                
                const cypher = `
                    UNWIND $batch as poi
                    MERGE (p:POI {id: poi.id})
                    ON CREATE SET p += poi
                    ON MATCH SET p += poi
                `;

                await session.run(cypher, { batch });
            }
        } finally {
            await session.close();
        }
    }

    /**
     * Persist relationships as edges in Neo4j using idempotent MERGE queries
     * @param {Array} relationships - Array of relationship objects
     */
    async _persistRelationships(relationships) {
        if (!relationships || relationships.length === 0) {
            return;
        }

        const session = this.neo4jDriver.session();
        try {
            // Process relationships in batches
            for (let i = 0; i < relationships.length; i += this.config.batchSize) {
                const batch = relationships.slice(i, i + this.config.batchSize);
                
                // Use dynamic relationship types for performance
                for (const rel of batch) {
                    const cypher = `
                        MATCH (source:POI {id: $sourcePoi})
                        MATCH (target:POI {id: $targetPoi})
                        MERGE (source)-[r:${rel.type}]->(target)
                        ON CREATE SET
                            r.confidence = $confidence,
                            r.explanation = $explanation
                        ON MATCH SET
                            r.confidence = $confidence,
                            r.explanation = $explanation
                    `;

                    await session.run(cypher, {
                        sourcePoi: rel.sourcePoi,
                        targetPoi: rel.targetPoi,
                        confidence: rel.confidence,
                        explanation: rel.explanation
                    });
                }
            }
        } finally {
            await session.close();
        }
    }
}

module.exports = GraphBuilder;