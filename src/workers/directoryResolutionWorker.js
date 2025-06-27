const fs = require('fs').promises;
const path = require('path');
const { Worker } = require('bullmq');
const { v4: uuidv4 } = require('uuid');

class DirectoryResolutionWorker {
    constructor(queueManager, dbManager, cacheClient, llmClient) {
        this.queueManager = queueManager;
        this.dbManager = dbManager; // This is the *central* DB manager
        this.cacheClient = cacheClient;
        this.llmClient = llmClient;
        this.worker = new Worker('directory-resolution-queue', this.process.bind(this), {
            connection: this.queueManager.connectionOptions,
            concurrency: 2 // Lower concurrency for directory analysis
        });
    }

    async process(job) {
        const { directoryPath, runId, jobId } = job.data;
        console.log(`[DirectoryResolutionWorker] Processing job ${job.id} for directory: ${directoryPath}`, { data: job.data });

        try {
            const fileContents = await this.getFileContents(directoryPath);
            const prompt = this.constructPrompt(directoryPath, fileContents);
            const llmResponse = await this.llmClient.query(prompt);
            const summary = this.parseResponse(llmResponse);

            const findingPayload = {
                type: 'directory-analysis-finding',
                source: 'DirectoryResolutionWorker',
                jobId: jobId,
                runId: runId,
                directoryPath: directoryPath,
                summary: summary,
            };

            const db = this.dbManager.getDb();
            const stmt = db.prepare(
                'INSERT INTO outbox (id, event_type, payload, status) VALUES (?, ?, ?, ?)'
            );
            stmt.run(uuidv4(), findingPayload.type, JSON.stringify(findingPayload), 'PENDING');

            console.log(`[DirectoryResolutionWorker] Wrote finding for ${directoryPath} to outbox.`);
        } catch (error) {
            console.error(`[DirectoryResolutionWorker] Error processing job ${job.id} for directory ${directoryPath}:`, error);
            throw error;
        }
    }

    async getFileContents(directoryPath) {
        const entries = await fs.readdir(directoryPath, { withFileTypes: true });
        const fileContents = [];
        for (const entry of entries) {
            if (entry.isFile()) {
                const fullPath = path.join(directoryPath, entry.name);
                const content = await fs.readFile(fullPath, 'utf-8');
                fileContents.push({
                    fileName: entry.name,
                    content: content.substring(0, 500) // Truncate for prompt
                });
            }
        }
        return fileContents;
    }

    constructPrompt(directoryPath, fileContents) {
        const fileSummaries = fileContents.map(f => `File: ${f.fileName}\n---\n${f.content}\n---\n`).join('\n');
        return `
            Analyze the following files in the directory "${directoryPath}" and provide a concise summary of the directory's purpose and key components.
            Focus on the overall responsibility of the directory and how the files within it contribute to that.

            ${fileSummaries}

            Format the output as a JSON object with a single key "summary".
        `;
    }

    parseResponse(response) {
        try {
            const parsed = JSON.parse(response);
            return parsed.summary || '';
        } catch (error) {
            console.error('Failed to parse LLM response for directory analysis:', error);
            return '';
        }
    }
}

module.exports = DirectoryResolutionWorker;