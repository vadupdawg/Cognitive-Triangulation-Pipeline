const neo4j = require('neo4j-driver');
const config = require('../config');

class GraphBuilder {
    constructor(db, neo4jDriver) {
        this.db = db;
        this.neo4jDriver = neo4jDriver;
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
        const query = "SELECT * FROM relationships WHERE status = 'VALIDATED'";
        const stmt = this.db.prepare(query);

        const batches = [];
        let currentBatch = [];

        for (const row of stmt.iterate()) {
            currentBatch.push({
                source_poi_id: row.source_poi_id,
                target_poi_id: row.target_poi_id,
                type: row.type,
                confidence: row.confidence_score,
            });

            if (currentBatch.length >= this.config.batchSize) {
                batches.push([...currentBatch]);
                currentBatch = [];
            }
        }

        if (currentBatch.length > 0) {
            batches.push(currentBatch);
        }

        console.log(`[GraphBuilder] Created ${batches.length} relationship batches.`);

        for (let i = 0; i < batches.length; i++) {
            const batch = batches[i];
            await this._runRelationshipBatch(batch);
            console.log(`[GraphBuilder] Processed batch ${i + 1}/${batches.length}`);
        }
    }

    async _runRelationshipBatch(batch) {
        const session = this.neo4jDriver.session({ database: config.NEO4J_DATABASE });
        try {
            const cypher = `
                UNWIND $batch as rel
                MERGE (source:POI {id: rel.source_poi_id})
                MERGE (target:POI {id: rel.target_poi_id})
                CALL apoc.create.relationship(source, rel.type, {confidence: rel.confidence}, target) YIELD rel as createdRel
                RETURN count(createdRel) as created
            `;
            
            const fallbackCypher = `
                UNWIND $batch as rel
                MERGE (source:POI {id: rel.source_poi_id})
                MERGE (target:POI {id: rel.target_poi_id})
                WITH source, target, rel
                CALL apoc.cypher.doIt(
                    'MERGE (source)-[r:' + rel.type + ']->(target) SET r.confidence = $confidence',
                    {source: source, target: target, confidence: rel.confidence}
                ) YIELD value
                RETURN count(value) as created
            `;

            try {
                await session.run(cypher, { batch });
            } catch (error) {
                if (error.message.includes('apoc')) {
                    console.warn('[GraphBuilder] APOC not available, trying fallback.');
                    await session.run(fallbackCypher, { batch });
                } else {
                    throw error;
                }
            }
        } finally {
            await session.close();
        }
    }
}

module.exports = GraphBuilder;