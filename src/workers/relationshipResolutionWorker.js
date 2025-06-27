const { Worker } = require('bullmq');
const { v4: uuidv4 } = require('uuid');

class RelationshipResolutionWorker {
    constructor(queueManager, dbManager, llmClient) {
        this.queueManager = queueManager;
        this.dbManager = dbManager;
        this.llmClient = llmClient;
        this.worker = new Worker('relationship-resolution-queue', this.process.bind(this), {
            connection: this.queueManager.connectionOptions,
            concurrency: 5 // Can handle more of these jobs concurrently
        });
    }

    async process(job) {
        const { filePath, pois, runId, jobId } = job.data;
        console.log(`[RelationshipResolutionWorker] Processing job ${job.id} for file: ${filePath}`, { data: job.data });

        try {
            if (!pois || pois.length < 2) {
                console.log(`[RelationshipResolutionWorker] Skipping ${filePath}, not enough POIs for relationship analysis.`);
                return;
            }

            const prompt = this.constructPrompt(filePath, pois);
            const llmResponse = await this.llmClient.query(prompt);
            const relationships = this.parseResponse(llmResponse);

            if (relationships.length > 0) {
                const findingPayload = {
                    type: 'relationship-analysis-finding',
                    source: 'RelationshipResolutionWorker',
                    jobId: jobId,
                    runId: runId,
                    filePath: filePath,
                    relationships: relationships,
                };

                const db = this.dbManager.getDb();
                const stmt = db.prepare(
                    'INSERT INTO outbox (id, event_type, payload, status) VALUES (?, ?, ?, ?)'
                );
                stmt.run(uuidv4(), findingPayload.type, JSON.stringify(findingPayload), 'PENDING');
                console.log(`[RelationshipResolutionWorker] Wrote ${relationships.length} relationships for ${filePath} to outbox.`);
            }
        } catch (error) {
            console.error(`[RelationshipResolutionWorker] Error processing job ${job.id} for file ${filePath}:`, error);
            throw error;
        }
    }

    constructPrompt(filePath, pois) {
        const poiList = pois.map(p => `- ${p.type}: ${p.name} (id: ${p.id})`).join('\n');

        return `
            Analyze the list of Points of Interest (POIs) from the file "${filePath}" to identify relationships between them.

            POIs:
            ${poiList}

            Identify relationships such as "calls", "inherits_from", "implements", "uses_type", etc.
            Format the output as a JSON object with a single key "relationships". This key should contain an array of objects, where each object has:
            - "from": The ID of the source POI.
            - "to": The ID of the target POI.
            - "type": A string describing the relationship (e.g., "CALLS", "IMPLEMENTS").
            - "evidence": A brief justification for the relationship.

            Example:
            {
              "relationships": [
                {
                  "from": "poi-id-1",
                  "to": "poi-id-2",
                  "type": "CALLS",
                  "evidence": "Function 'alpha' calls function 'beta' on line 42."
                }
              ]
            }

            If no relationships are found, return an empty array.
        `;
    }

    parseResponse(response) {
        try {
            const parsed = JSON.parse(response);
            return parsed.relationships || [];
        } catch (error) {
            console.error(`Failed to parse LLM response for relationship analysis in ${this.currentJobPath}:`, error);
            return [];
        }
    }
}

module.exports = RelationshipResolutionWorker;