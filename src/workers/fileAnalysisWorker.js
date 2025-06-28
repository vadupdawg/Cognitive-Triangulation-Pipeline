const { Worker } = require('bullmq');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;
const path = require('path');
const LLMResponseSanitizer = require('../utils/LLMResponseSanitizer');
const { getTokenizer } = require('../utils/tokenizer');

const MAX_INPUT_TOKENS = 50000; // Leave a buffer for the prompt template

class FileAnalysisWorker {
    constructor(queueManager, dbManager, cacheClient, llmClient, options = {}) {
        this.queueManager = queueManager;
        this.dbManager = dbManager;
        this.cacheClient = cacheClient;
        this.llmClient = llmClient;
        this.directoryAggregationQueue = this.queueManager.getQueue('directory-aggregation-queue');
        this.tokenizer = getTokenizer();

        if (!options.processOnly) {
            this.worker = new Worker('file-analysis-queue', this.process.bind(this), {
                connection: this.queueManager.connection,
                concurrency: 100 // Increased concurrency
            });
        }
    }

    async close() {
        if (this.worker) {
            await this.worker.close();
        }
    }

    async process(job) {
        const { filePath, runId, jobId } = job.data;
        if (!filePath) {
            throw new Error("Cannot destructure property 'filePath' of 'job.data' as it is undefined.");
        }
        console.log(`[FileAnalysisWorker] Processing job ${job.id} for file: ${filePath}`);

        try {
            let content = await fs.readFile(filePath, 'utf-8');
            const tokenCount = this.tokenizer(content);

            if (tokenCount > MAX_INPUT_TOKENS) {
                console.warn(`[FileAnalysisWorker] File ${filePath} exceeds token limit (${tokenCount} > ${MAX_INPUT_TOKENS}). Truncating content.`);
                // Truncate from the middle to preserve start and end
                const halfLimit = Math.floor(MAX_INPUT_TOKENS / 2);
                const start = content.substring(0, halfLimit);
                const end = content.substring(content.length - halfLimit);
                content = `${start}\n\n... (content truncated) ...\n\n${end}`;
            }

            const prompt = this.constructPrompt(filePath, content);
            const llmResponse = await this.llmClient.query(prompt);
            const pois = this.parseResponse(llmResponse);

            if (pois.length > 0) {
                const findingPayload = {
                    type: 'file-analysis-finding',
                    source: 'FileAnalysisWorker',
                    jobId: jobId,
                    runId: runId,
                    filePath: filePath,
                    pois: pois,
                };
                const db = this.dbManager.getDb();
                const stmt = db.prepare('INSERT INTO outbox (run_id, event_type, payload, status) VALUES (?, ?, ?, ?)');
                stmt.run(runId, findingPayload.type, JSON.stringify(findingPayload), 'PENDING');
            }

            // Trigger directory aggregation
            const directoryPath = path.dirname(filePath);
            await this.directoryAggregationQueue.add('aggregate-directory', {
                directoryPath,
                runId,
                fileJobId: jobId,
            });

        } catch (error) {
            console.error(`[FileAnalysisWorker] Error processing job ${job.id} for file ${filePath}:`, error);
            throw error;
        }
    }
    constructPrompt(filePath, fileContent) {
        return `
            Analyze the code file at ${filePath} and extract all Points of Interest (POIs).
            POIs are strictly limited to: Class Definitions, Function Definitions, global/module-level Variable Declarations, and Imported modules.
            Respond with a single JSON object. The object must contain one key: "pois".
            The value of "pois" must be an array of POI objects.
            Each POI object must have the following keys: "name", "type", "start_line", "end_line".
            The "type" must be one of: 'ClassDefinition', 'FunctionDefinition', 'VariableDeclaration', 'ImportStatement'.
            Do not include any text, explanation, or markdown formatting before or after the JSON object.

            File Content:
            \`\`\`
            ${fileContent}
            \`\`\`
        `;
    }

    parseResponse(response) {
        try {
            const sanitized = LLMResponseSanitizer.sanitize(response);
            const parsed = JSON.parse(sanitized);
            const pois = parsed.pois || [];
            // Add a unique ID to each POI, as this is the contract expected by downstream workers.
            pois.forEach(poi => {
                if (!poi.id) {
                    poi.id = uuidv4();
                }
            });
            return pois;
        } catch (error) {
            console.error('Failed to parse LLM response for file analysis:', error);
            console.error('Original response:', response);
            return [];
        }
    }
}

module.exports = FileAnalysisWorker;