const neo4j = require('neo4j-driver');
const config = require('../config');

class GraphBuilder {
    constructor(db, neo4jDriver, dbName) {
        this.db = db;
        this.neo4jDriver = neo4jDriver;
        this.dbName = dbName;
        this.config = {
            batchSize: 500,
            maxConcurrentBatches: 2,
        };
    }

    async run() {
        if (!this.neo4jDriver || !this.db) {
            throw new Error('GraphBuilder requires valid database connections.');
        }

        try {
            console.log('[GraphBuilder] Starting graph building...');
            const relCount = this.db.prepare("SELECT COUNT(*) as count FROM relationships WHERE status = 'VALIDATED'").get().count;
            console.log(`[GraphBuilder] Processing ${relCount} validated relationships...`);

            await this._persistValidatedRelationships();

            console.log('[GraphBuilder] Graph building complete.');
        } catch (error) {
            console.error('[GraphBuilder] Error during graph building:', error);
            throw error;
        }
    }

    async _persistValidatedRelationships() {
        const relationshipQuery = "SELECT * FROM relationships WHERE status = 'VALIDATED'";
        const poiQuery = "SELECT id, file_path, name, type, start_line, end_line, hash FROM pois WHERE id = ?";

        const relIterator = this.db.prepare(relationshipQuery).iterate();
        const poiStmt = this.db.prepare(poiQuery);

        let currentBatch = [];
        const activePromises = new Set();
        let processedCount = 0;

        const generateSemanticId = (poi) => {
            if (poi.type === 'file') return poi.file_path;
            return `${poi.type}:${poi.name}@${poi.file_path}:${poi.start_line}`;
        };
        
        const processBatch = async (batch) => {
            const promise = this._runRelationshipBatch(batch)
                .then(() => {
                    processedCount += batch.length;
                    console.log(`[GraphBuilder] Processed batch of ${batch.length}. Total processed: ${processedCount}`);
                })
                .catch(error => {
                    console.error(`[GraphBuilder] Error processing a batch:`, error);
                })
                .finally(() => {
                    activePromises.delete(promise);
                });
            activePromises.add(promise);
        };

        for (const row of relIterator) {
            const sourcePoi = poiStmt.get(row.source_poi_id);
            const targetPoi = poiStmt.get(row.target_poi_id);

            if (sourcePoi && targetPoi) {
                const sourceNode = { ...sourcePoi, id: generateSemanticId(sourcePoi) };
                const targetNode = { ...targetPoi, id: generateSemanticId(targetPoi) };

                currentBatch.push({
                    source: sourceNode,
                    target: targetNode,
                    relationship: {
                        type: row.type,
                        confidence: row.confidence_score,
                    }
                });
            }

            if (currentBatch.length >= this.config.batchSize) {
                if (activePromises.size >= this.config.maxConcurrentBatches) {
                    await Promise.race(activePromises);
                }
                processBatch([...currentBatch]);
                currentBatch = [];
            }
        }

        if (currentBatch.length > 0) {
            processBatch(currentBatch);
        }

        await Promise.allSettled(activePromises);
        console.log(`[GraphBuilder] All relationship batches have been processed.`);
    }

    async _runRelationshipBatch(batch) {
        const session = this.neo4jDriver.session({ database: this.dbName });
        try {
            const cypher = `
                UNWIND $batch as item
                MERGE (source:POI {id: item.source.id})
                ON CREATE SET source += item.source
                MERGE (target:POI {id: item.target.id})
                ON CREATE SET target += item.target
                MERGE (source)-[r:RELATIONSHIP {type: item.relationship.type}]->(target)
                ON CREATE SET r.confidence = item.relationship.confidence
                ON MATCH SET r.confidence = item.relationship.confidence
            `;
            await session.run(cypher, { batch });
        } catch (error) {
            console.error(`[GraphBuilder] Error processing relationship batch:`, error);
            throw error;
        } finally {
            await session.close();
        }
    }
}

module.exports = GraphBuilder;