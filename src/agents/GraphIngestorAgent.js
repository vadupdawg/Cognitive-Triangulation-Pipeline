const neo4j = require('neo4j-driver');

class GraphIngestorAgent {
    /**
     * Initializes the agent with database connections.
     * @param {object} db - An instance of the SQLite database connection client.
     * @param {object} neo4jDriverModule - The neo4j driver module with configured session method.
     */
    constructor(db, neo4jDriverModule) {
        this.db = db;
        this.neo4jDriverModule = neo4jDriverModule;
        this.ALLOWED_NODE_LABELS = new Set(['Function', 'Variable', 'File', 'Class', 'Method', 'Database', 'Table', 'View']);
        this.ALLOWED_RELATIONSHIP_TYPES = new Set(['CALLS', 'USES', 'CONTAINS', 'DEFINES', 'IMPORTS', 'EXPORTS', 'EXTENDS']);
    }

    /**
     * The main execution loop. It fetches batches of unprocessed analysis results and ingests them into the graph.
     * @param {number} batchSize - The number of results to process in each batch.
     */
    async run(batchSize = 100) {
        console.log('[GraphIngestorAgent] Starting graph ingestion process...');
        let totalProcessed = 0;
        while (true) {
            const results = await this.getNextBatch(batchSize);
            console.log(`[GraphIngestorAgent] Retrieved ${results.length} results for processing`);
            if (results.length === 0) {
                console.log('[GraphIngestorAgent] No more results to process');
                break;
            }
            await this.processBatch(results);
            totalProcessed += results.length;
            console.log(`[GraphIngestorAgent] Processed batch of ${results.length} results (total: ${totalProcessed})`);
        }
        console.log(`[GraphIngestorAgent] Completed processing ${totalProcessed} total results`);
    }

    /**
     * Fetches a batch of completed analysis results for ingestion.
     * @param {number} batchSize - The maximum number of results to fetch.
     * @returns {Promise<Array<Object>>} A promise that resolves to an array of analysis results.
     */
    async getNextBatch(batchSize) {
        try {
            const results = await this.db.all(
                `SELECT id, llm_output, absolute_file_path as file_path FROM analysis_results WHERE status = ? LIMIT ?`,
                'completed',
                batchSize
            );
            return results;
        } catch (error) {
            console.error('Failed to get next batch:', error);
            throw error;
        }
    }

    /**
     * Parses and ingests a batch of results into Neo4j within a single transaction.
     * @param {Array<Object>} results - The batch of analysis results from the database.
     */
    async processBatch(results) {
        const session = this.neo4jDriverModule.session();
        const transaction = session.beginTransaction();
        const processedIds = [];
        
        try {
            const allEntities = [];
            const allRelationships = [];

            for (const result of results) {
                try {
                    console.log(`[GraphIngestorAgent] Processing result ID ${result.id} for file: ${result.file_path}`);
                    console.log(`[GraphIngestorAgent] LLM output sample: ${result.llm_output.substring(0, 200)}...`);
                    
                    const data = JSON.parse(result.llm_output);
                    console.log(`[GraphIngestorAgent] Parsed data structure:`, {
                        hasEntities: !!data.entities,
                        entitiesCount: data.entities ? data.entities.length : 0,
                        hasRelationships: !!data.relationships,
                        relationshipsCount: data.relationships ? data.relationships.length : 0
                    });
                    
                    if (!data.entities || !data.relationships) {
                        throw new Error("Invalid result format: missing entities or relationships array.");
                    }

                    // Add file path to entities and relationships if missing
                    data.entities.forEach(e => e.filePath = e.filePath || result.file_path);
                    data.relationships.forEach(r => {
                        if (r.from) r.from.filePath = r.from.filePath || result.file_path;
                        if (r.to) r.to.filePath = r.to.filePath || result.file_path;
                    });

                    console.log(`[GraphIngestorAgent] Adding ${data.entities.length} entities and ${data.relationships.length} relationships from result ${result.id}`);
                    allEntities.push(...data.entities);
                    allRelationships.push(...data.relationships);
                    processedIds.push(result.id);
                } catch (error) {
                    console.error(`[GraphIngestorAgent] Error parsing result ID ${result.id}:`, error.message);
                    console.error(`[GraphIngestorAgent] Raw LLM output for failed result:`, result.llm_output);
                    // Skip this result and continue processing others
                }
            }

            console.log(`[GraphIngestorAgent] Total entities to create: ${allEntities.length}`);
            console.log(`[GraphIngestorAgent] Total relationships to create: ${allRelationships.length}`);

            console.log(`[GraphIngestorAgent] Creating nodes in batch...`);
            await this.createNodesInBatch(transaction, allEntities);
            console.log(`[GraphIngestorAgent] Creating relationships in batch...`);
            await this.createRelationshipsInBatch(transaction, allRelationships);

            console.log(`[GraphIngestorAgent] Committing Neo4j transaction...`);
            await transaction.commit();
            console.log(`[GraphIngestorAgent] Neo4j transaction committed successfully`);
            
            // After successful Neo4j ingestion, delete the processed results from SQLite
            if (processedIds.length > 0) {
                const placeholders = processedIds.map(() => '?').join(',');
                await this.db.run(`DELETE FROM analysis_results WHERE id IN (${placeholders})`, processedIds);
            }
        } catch (error) {
            console.error(`Error processing batch:`, error.message);
            await transaction.rollback();
            throw error; // Re-throw to stop processing if there's a critical error
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
        console.log(`[GraphIngestorAgent] createNodesInBatch called with ${entities.length} entities`);
        
        const validEntities = entities.filter(entity => {
            if (!entity || !entity.type || !entity.name || !entity.filePath) {
                console.warn("[GraphIngestorAgent] Invalid entity for createNode:", entity);
                return false;
            }
            if (!this.ALLOWED_NODE_LABELS.has(entity.type)) {
                console.warn(`[GraphIngestorAgent] Attempted to create node with invalid label: ${entity.type}.`);
                return false;
            }
            return true;
        });

        console.log(`[GraphIngestorAgent] ${validEntities.length} valid entities after filtering`);
        if (validEntities.length === 0) {
            console.log(`[GraphIngestorAgent] No valid entities to create, returning early`);
            return;
        }

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