const { Worker } = require('bullmq');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;

class FileAnalysisWorker {
    constructor(queueManager, dbManager, cacheClient, llmClient) {
        this.queueManager = queueManager;
        this.dbManager = dbManager; // This is the *central* DB manager
        this.cacheClient = cacheClient;
        this.llmClient = llmClient;
        this.worker = new Worker('file-analysis-queue', this.process.bind(this), {
            connection: this.queueManager.connectionOptions,
            concurrency: 5
        });
    }

    async process(job) {
        const { filePath, runId, jobId } = job.data;
        console.log(`[FileAnalysisWorker] Processing job ${job.id} for file: ${filePath}`, { data: job.data });

        try {
            const content = await fs.readFile(filePath, 'utf-8');
            const prompt = this.constructPrompt(filePath, content);
            // console.log(`[FileAnalysisWorker] Prompt for ${filePath}:`, prompt); // Too verbose for now

            const llmResponse = await this.llmClient.query(prompt);
            // console.log(`[FileAnalysisWorker] LLM Response for ${filePath}:`, llmResponse); // Too verbose for now

            const pois = this.parseResponse(llmResponse);

            if (pois.length > 0) {
                console.log(`[FileAnalysisWorker] Found ${pois.length} POIs in ${filePath}.`);
                const findingPayload = {
                    type: 'file-analysis-finding',
                    source: 'FileAnalysisWorker',
                    jobId: jobId,
                    runId: runId,
                    filePath: filePath,
                    pois: pois,
                };

                const db = this.dbManager.getDb();
                const stmt = db.prepare(
                    'INSERT INTO outbox (event_type, payload, status) VALUES (?, ?, ?)'
                );
                stmt.run(findingPayload.type, JSON.stringify(findingPayload), 'PENDING');
                console.log(`[FileAnalysisWorker] Wrote finding for ${filePath} to outbox.`);
            }
        } catch (error) {
            console.error(`[FileAnalysisWorker] Error processing job ${job.id} for file ${filePath}:`, error);
            throw error; // Re-throw to let BullMQ handle the failure
        }
    }

    constructPrompt(filePath, fileContent) {
        return `
            Analyze the following code file to identify all Points of Interest (POIs).
            POIs include:
            - Class Definitions
            - Function Definitions
            - Variable Declarations (at global/module scope)
            - Imported modules/libraries

            For each POI, provide:
            - name: The name of the class, function, variable, or import.
            - type: One of 'ClassDefinition', 'FunctionDefinition', 'VariableDeclaration', 'ImportStatement'.
            - start_line: The starting line number.
            - end_line: The ending line number.

            File Path: ${filePath}
            """
            ${fileContent}
            """

            Format the output as a JSON object with a single key "pois", which is an array of POI objects.
            Example:
            {
              "pois": [
                {
                  "name": "MyClass",
                  "type": "ClassDefinition",
                  "start_line": 10,
                  "end_line": 54
                }
              ]
            }
        `;
    }

    parseResponse(response) {
        try {
            const parsed = JSON.parse(response);
            return parsed.pois || [];
        } catch (error) {
            console.error('Failed to parse LLM response for file analysis:', error);
            return [];
        }
    }
}

module.exports = FileAnalysisWorker;