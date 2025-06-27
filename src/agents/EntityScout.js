const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const ignore = require('ignore');

class EntityScout {
    constructor(queueManager, cacheClient, targetDirectory, runId) {
        this.queueManager = queueManager;
        this.cacheClient = cacheClient;
        this.targetDirectory = targetDirectory;
        this.runId = runId;
        this.fileAnalysisQueue = this.queueManager.getQueue('file-analysis-queue');
        this.directoryResolutionQueue = this.queueManager.getQueue('directory-resolution-queue');
        this.ig = ignore();
    }

    async _loadIgnoreFile() {
        const ignoreFilePath = path.join(this.targetDirectory, '.gitignore');
        try {
            const ignoreFileContent = await fs.readFile(ignoreFilePath, 'utf-8');
            this.ig.add(ignoreFileContent);
            console.log(`[EntityScout] Loaded .gitignore patterns from ${ignoreFilePath}`);
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log(`[EntityScout] No .gitignore file found in ${this.targetDirectory}. Proceeding without ignore patterns.`);
            } else {
                console.error(`[EntityScout] Error reading .gitignore file: ${error.message}`);
            }
        }
    }

    async run() {
        console.log(`[EntityScout] Starting run ID: ${this.runId} for directory ${this.targetDirectory}`);
        await this._loadIgnoreFile();

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
        
        const recursiveDiscover = async (currentDir) => {
            const relativePath = path.relative(this.targetDirectory, currentDir);
            if (relativePath && this.ig.ignores(relativePath)) {
                return;
            }

            const entries = await fs.readdir(currentDir, { withFileTypes: true });
            if (!dirFileMap.has(currentDir)) {
                dirFileMap.set(currentDir, []);
            }

            for (const entry of entries) {
                const fullPath = path.join(currentDir, entry.name);
                const entryRelativePath = path.relative(this.targetDirectory, fullPath);

                if (this.ig.ignores(entryRelativePath)) {
                    continue;
                }

                if (entry.isDirectory()) {
                    await recursiveDiscover(fullPath);
                } else {
                    const fileJobId = `file-job-${uuidv4()}`;
                    fileJobs.push({
                        name: 'analyze-file',
                        data: { filePath: fullPath, runId: this.runId, jobId: fileJobId },
                    });
                    dirFileMap.get(currentDir).push(fileJobId);
                }
            }
        };

        await recursiveDiscover(this.targetDirectory);

        const pipeline = this.cacheClient.pipeline();
        for (const [dir, files] of dirFileMap.entries()) {
            if (files.length > 0) {
                const directoryFilesKey = `run:${this.runId}:dir:${dir}:files`;
                pipeline.sadd(directoryFilesKey, files);
            }
        }
        await pipeline.exec();

        return { fileJobs, dirJobs: [] };
    }
}

module.exports = EntityScout;
