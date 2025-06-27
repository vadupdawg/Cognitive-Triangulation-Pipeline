const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class EntityScout {
    constructor(queueManager, cacheClient, targetDirectory, runId) {
        this.queueManager = queueManager;
        this.cacheClient = cacheClient;
        this.targetDirectory = targetDirectory;
        this.runId = runId;
        this.fileAnalysisQueue = this.queueManager.getQueue('file-analysis-queue');
        this.directoryResolutionQueue = this.queueManager.getQueue('directory-resolution-queue');
    }

    async run() {
        console.log(`[EntityScout] Starting run ID: ${this.runId} for directory ${this.targetDirectory}`);

        try {
            const { fileJobs, dirJobs } = await this._discoverAndCreateJobs();

            if (fileJobs.length === 0 && dirJobs.length === 0) {
                console.log(`[EntityScout] No files or directories discovered for analysis. Run ${this.runId} complete.`);
                await this.cacheClient.set(`run:${this.runId}:status`, 'completed');
                return { totalJobs: 0 };
            }

            await this.fileAnalysisQueue.addBulk(fileJobs);
            await this.directoryResolutionQueue.addBulk(dirJobs);
            
            const totalJobs = fileJobs.length + dirJobs.length;
            console.log(`[EntityScout] Enqueued ${totalJobs} initial jobs for run ${this.runId}.`);
            
            await this.cacheClient.set(`run:${this.runId}:status`, 'processing');

            return { totalJobs };

        } catch (error) {
            console.error(`[EntityScout] Run failed: ${error.message}`, error.stack);
            await this.cacheClient.set(`run:${this.runId}:status`, 'failed');
            throw error;
        }
    }

    async _discoverAndCreateJobs() {
        const fileJobs = [];
        const dirJobs = [];
        const fileToJobMap = {};
        const fileJobIds = new Set();
        const dirJobIds = new Set();

        const ignoreDirs = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage']);

        const recursiveDiscover = async (currentDir) => {
            const entries = await fs.readdir(currentDir, { withFileTypes: true });
            const dirJobId = `dir-job-${uuidv4()}`;
            dirJobIds.add(dirJobId);
            dirJobs.push({
                name: 'analyze-directory',
                data: { directoryPath: currentDir, runId: this.runId, jobId: dirJobId },
            });

            for (const entry of entries) {
                const fullPath = path.join(currentDir, entry.name);
                if (entry.isDirectory()) {
                    if (!ignoreDirs.has(entry.name)) {
                        await recursiveDiscover(fullPath);
                    }
                } else {
                    const fileJobId = `file-job-${uuidv4()}`;
                    fileJobIds.add(fileJobId);
                    fileToJobMap[fullPath] = fileJobId;
                    fileJobs.push({
                        name: 'analyze-file',
                        data: { filePath: fullPath, runId: this.runId, jobId: fileJobId },
                    });
                }
            }
        };

        await recursiveDiscover(this.targetDirectory);

        // Save manifest to Redis
        const pipeline = this.cacheClient.pipeline();
        pipeline.set(`run:${this.runId}:config`, JSON.stringify({ rootPath: this.targetDirectory }));
        if (fileJobIds.size > 0) {
            pipeline.sadd(`run:${this.runId}:jobs:files`, Array.from(fileJobIds));
        }
        if (dirJobIds.size > 0) {
            pipeline.sadd(`run:${this.runId}:jobs:dirs`, Array.from(dirJobIds));
        }
        if (Object.keys(fileToJobMap).length > 0) {
            pipeline.hset(`run:${this.runId}:file_to_job_map`, fileToJobMap);
        }
        await pipeline.exec();

        return { fileJobs, dirJobs };
    }
}

module.exports = EntityScout;
