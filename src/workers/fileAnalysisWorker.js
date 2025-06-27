const { Worker } = require('bullmq');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;
const path = require('path');
const LLMResponseSanitizer = require('../utils/LLMResponseSanitizer');

class FileAnalysisWorker {
    constructor(queueManager, dbManager, cacheClient, llmClient) {
        this.queueManager = queueManager;
        this.dbManager = dbManager;
        this.cacheClient = cacheClient;
        this.llmClient = llmClient;
        this.directoryAggregationQueue = this.queueManager.getQueue('directory-aggregation-queue');
        this.worker = new Worker('file-analysis-queue', this.process.bind(this), {
            connection: this.queueManager.connectionOptions,
            concurrency: 100 // Increased concurrency
        });
    }

    async process(job) {
        const { filePath, runId, jobId } = job.data;
        console.log(`[FileAnalysisWorker] Processing job ${job.id} for file: ${filePath}`);

        try {
            const content = await fs.readFile(filePath, 'utf-8');
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
                const stmt = db.prepare('INSERT INTO outbox (event_type, payload, status) VALUES (?, ?, ?)');
                stmt.run(findingPayload.type, JSON.stringify(findingPayload), 'PENDING');
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
            return parsed.pois || [];
        } catch (error) {
            console.error('Failed to parse LLM response for file analysis:', error);
            console.error('Original response:', response);
            return [];
        }
    }
}

module.exports = FileAnalysisWorker;