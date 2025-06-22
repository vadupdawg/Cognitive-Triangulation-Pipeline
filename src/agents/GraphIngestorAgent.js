const neo4j = require('neo4j-driver');

class GraphIngestorAgent {
    /**
     * Initializes the agent with database connections.
     * @param {object} db - An instance of the SQLite database connection client.
     * @param {neo4j.Driver} neo4jDriver - An instance of the Neo4j driver.
     */
    constructor(db, neo4jDriver) {
        this.db = db;
        this.neo4jDriver = neo4jDriver;
        this.ALLOWED_NODE_LABELS = new Set(['Function', 'Variable', 'File', 'Class', 'Method']);
        this.ALLOWED_RELATIONSHIP_TYPES = new Set(['CALLS', 'USES', 'CONTAINS', 'DEFINES']);
    }

    /**
     * The main execution loop. It fetches batches of unprocessed analysis results and ingests them into the graph.
     * @param {number} batchSize - The number of results to process in each batch.
     */
    async run(batchSize = 100) {
        while (true) {
            const results = await this.getNextBatch(batchSize);
            if (results.length === 0) {
                break;
            }
            await this.processBatch(results);
        }
    }

    /**
     * Fetches a batch of unprocessed analysis results and marks them as 'ingested'.
     * @param {number} batchSize - The maximum number of results to fetch.
     * @returns {Promise<Array<Object>>} A promise that resolves to an array of analysis results.
     */
    async getNextBatch(batchSize) {
        try {
            await this.db.run('BEGIN');
            const results = await this.db.all(
                `SELECT id, llm_output, absolute_file_path as file_path FROM analysis_results WHERE status = ? LIMIT ?`,
                'completed',
                batchSize
            );

            if (results.length > 0) {
                const ids = results.map(r => r.id);
                const placeholders = ids.map(() => '?').join(',');
                await this.db.run(
                    `UPDATE analysis_results SET status = ? WHERE id IN (${placeholders})`,
                    'ingested',
                    ...ids
                );
            }
            await this.db.run('COMMIT');
            return results;
        } catch (error) {
            await this.db.run('ROLLBACK');
            console.error('Failed to get next batch:', error);
            throw error;
        }
    }

    /**
     * Parses and ingests a batch of results into Neo4j within a single transaction.
     * @param {Array<Object>} results - The batch of analysis results from the database.
     */
    async processBatch(results) {
        const session = this.neo4jDriver.session();
        const transaction = session.beginTransaction();
        try {
            const allEntities = [];
            const allRelationships = [];

            for (const result of results) {
                try {
                    const data = JSON.parse(result.llm_output);
                    if (!data.entities || !data.relationships) {
                        throw new Error("Invalid result format: missing entities or relationships array.");
                    }

                    // Add file path to entities and relationships if missing
                    data.entities.forEach(e => e.filePath = e.filePath || result.file_path);
                    data.relationships.forEach(r => {
                        if (r.from) r.from.filePath = r.from.filePath || result.file_path;
                        if (r.to) r.to.filePath = r.to.filePath || result.file_path;
                    });

                    allEntities.push(...data.entities);
                    allRelationships.push(...data.relationships);
                } catch (error) {
                    console.error(`Error parsing result ID ${result.id}:`, error.message);
                    const updateStmt = "UPDATE analysis_results SET status = ?, validation_errors = ? WHERE id = ?";
                    // This update should be handled carefully, as it's outside the main db transaction.
                    // For simplicity, we run it immediately. A more robust solution might queue these updates.
                    await this.db.run(updateStmt, 'failed', error.message, result.id);
                }
            }

            await this.createNodesInBatch(transaction, allEntities);
            await this.createRelationshipsInBatch(transaction, allRelationships);

            await transaction.commit();
        } catch (error) {
            console.error(`Error processing batch:`, error.message);
            await transaction.rollback();
            // Decide on a strategy for the batch, e.g., mark all as failed
            const ids = results.map(r => r.id);
            const placeholders = ids.map(() => '?').join(',');
            const updateStmt = `UPDATE analysis_results SET status = ?, validation_errors = ? WHERE id IN (${placeholders})`;
            await this.db.run(updateStmt, 'failed', `Batch processing error: ${error.message}`, ...ids);
        } finally {
            await session.close();
        }
    }

    /**
     * Creates multiple nodes in a single transaction using UNWIND.
     * @param {neo4j.Transaction} transaction - The active Neo4j transaction.
     * @param {Array<Object>} entities - A list of entities to create as nodes.
     */
    async createNodesInBatch(transaction, entities) {
        const validEntities = entities.filter(entity => {
            if (!entity || !entity.type || !entity.name || !entity.filePath) {
                console.warn("Invalid entity for createNode:", entity);
                return false;
            }
            if (!this.ALLOWED_NODE_LABELS.has(entity.type)) {
                console.warn(`Attempted to create node with invalid label: ${entity.type}.`);
                return false;
            }
            return true;
        });

        if (validEntities.length === 0) return;

        const entitiesByType = validEntities.reduce((acc, entity) => {
            if (!acc[entity.type]) {
                acc[entity.type] = [];
            }
            acc[entity.type].push(entity);
            return acc;
        }, {});

        for (const type in entitiesByType) {
            const batch = entitiesByType[type];
            const batchQuery = `
                UNWIND $batch AS data
                MERGE (n:\`${type}\` { name: data.name, filePath: data.filePath })
                SET n += data.props
            `;
            const batchForQuery = batch.map(e => {
                const { name, filePath, ...props } = e;
                delete props.type;
                return { name, filePath, props };
            });
            await transaction.run(batchQuery, { batch: batchForQuery });
        }
    }


    /**
     * Creates multiple relationships in a single transaction using UNWIND.
     * @param {neo4j.Transaction} transaction - The active Neo4j transaction.
     * @param {Array<Object>} relationships - A list of relationships to create.
     */
    async createRelationshipsInBatch(transaction, relationships) {
        const validRelationships = relationships.filter(rel => {
            if (!rel || !rel.from || !rel.to || !rel.type || !rel.from.type || !rel.to.type || !rel.from.name || !rel.to.name || !rel.from.filePath || !rel.to.filePath) {
                console.warn("Invalid relationship for createRelationship:", rel);
                return false;
            }
            if (!this.ALLOWED_NODE_LABELS.has(rel.from.type) || !this.ALLOWED_NODE_LABELS.has(rel.to.type)) {
                console.warn(`Attempted to create rel with invalid node label. From: ${rel.from.type}, To: ${rel.to.type}.`);
                return false;
            }
            if (!this.ALLOWED_RELATIONSHIP_TYPES.has(rel.type)) {
                console.warn(`Attempted to create relationship with invalid type: ${rel.type}.`);
                return false;
            }
            return true;
        });

        if (validRelationships.length === 0) return;

        // Group relationships by type to run separate queries
        const relationshipsByType = validRelationships.reduce((acc, rel) => {
            const key = `${rel.from.type}-${rel.type}-${rel.to.type}`;
            if (!acc[key]) {
                acc[key] = {
                    fromType: rel.from.type,
                    toType: rel.to.type,
                    type: rel.type,
                    batch: []
                };
            }
            acc[key].batch.push({
                fromName: rel.from.name,
                fromFilePath: rel.from.filePath,
                toName: rel.to.name,
                toFilePath: rel.to.filePath
            });
            return acc;
        }, {});

        for (const key in relationshipsByType) {
            const group = relationshipsByType[key];
            const query = `
                UNWIND $batch AS rel
                MATCH (a:\`${group.fromType}\` { name: rel.fromName, filePath: rel.fromFilePath })
                MATCH (b:\`${group.toType}\` { name: rel.toName, filePath: rel.toFilePath })
                MERGE (a)-[r:\`${group.type}\`]->(b)
            `;
            await transaction.run(query, { batch: group.batch });
        }
    }
}

module.exports = GraphIngestorAgent;