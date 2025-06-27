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
        const dirFileMap = new Map();
        const ignoreDirs = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage']);
        const ignoreFiles = new Set(['.gitignore']);
        const ignoreExtensions = new Set(['.md']);

        const recursiveDiscover = async (currentDir) => {
            const entries = await fs.readdir(currentDir, { withFileTypes: true });
            if (!dirFileMap.has(currentDir)) {
                dirFileMap.set(currentDir, []);
            }

            for (const entry of entries) {
                const fullPath = path.join(currentDir, entry.name);
                if (entry.isDirectory()) {
                    if (!ignoreDirs.has(entry.name) && !entry.name.includes('test')) {
                        await recursiveDiscover(fullPath);
                    }
                } else {
                    const extension = path.extname(entry.name);
                    if (!ignoreFiles.has(entry.name) && !ignoreExtensions.has(extension)) {
                        const fileJobId = `file-job-${uuidv4()}`;
                        fileJobs.push({
                            name: 'analyze-file',
                            data: { filePath: fullPath, runId: this.runId, jobId: fileJobId },
                        });
                        dirFileMap.get(currentDir).push(fileJobId);
                    }
                }
            }
        };

        await recursiveDiscover(this.targetDirectory);

        // Save directory to file job mappings in Redis
        const pipeline = this.cacheClient.pipeline();
        for (const [dir, files] of dirFileMap.entries()) {
            if (files.length > 0) {
                const directoryFilesKey = `run:${this.runId}:dir:${dir}:files`;
                pipeline.sadd(directoryFilesKey, files);
            }
        }
        await pipeline.exec();

        return { fileJobs, dirJobs: [] }; // No direct directory jobs
    }
}

module.exports = EntityScout;
