const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class EntityScout {
    constructor(queueManager, targetDirectory) {
        this.queueManager = queueManager;
        this.targetDirectory = targetDirectory;
        this.fileAnalysisQueue = this.queueManager.getQueue('file-analysis-queue');
        this.directoryResolutionQueue = this.queueManager.getQueue('directory-resolution-queue');
        this.globalResolutionQueue = this.queueManager.getQueue('global-resolution-queue');
    }

    async run() {
        const runId = uuidv4();
        console.log(`Starting EntityScout run with ID: ${runId} for directory ${this.targetDirectory}`);

        try {
            const fileMap = await this._discoverFiles(this.targetDirectory);
            const filePaths = Object.values(fileMap).flat();

            if (filePaths.length === 0) {
                console.log(`No files discovered for analysis. Run ${runId} complete.`);
                return { globalJob: null, totalJobs: 0 };
            }
            
            const directoryJobs = [];
            let totalJobs = 0;

            for (const [dirPath, files] of Object.entries(fileMap)) {
                const fileAnalysisJobs = await this.fileAnalysisQueue.addBulk(
                    files.map(filePath => ({ name: 'analyze-file', data: { filePath, runId, directory: dirPath } }))
                );
                totalJobs += fileAnalysisJobs.length;

                const directoryJob = await this.directoryResolutionQueue.add('resolve-directory', {
                    directoryPath: dirPath,
                    runId,
                }, {
                    // This job depends on all file analysis jobs for the files in its directory
                    dependencies: fileAnalysisJobs.map(job => ({ jobId: job.id, queue: this.fileAnalysisQueue.name }))
                });
                directoryJobs.push(directoryJob);
                totalJobs++;
            }

            // The global resolution job depends on all directory resolution jobs
            const globalJob = await this.globalResolutionQueue.add('resolve-global', {
                runId,
                targetDirectory: this.targetDirectory
            }, {
                dependencies: directoryJobs.map(job => ({ jobId: job.id, queue: this.directoryResolutionQueue.name, type: 'completed' }))
            });
            totalJobs++; // Increment for the global job itself
            
            console.log(`Global parent job ${globalJob.id} created for run ${runId}, depending on ${directoryJobs.length} directory jobs.`);
            console.log(`EntityScout run ${runId} successfully orchestrated ${totalJobs} jobs.`);
            return { globalJob, totalJobs };

        } catch (error) {
            console.error(`EntityScout run failed: ${error.message}`, error.stack);
            throw error;
        }
    }

    async _discoverFiles(directory) {
        const fileMap = {};
        const ignoreDirs = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage']);

        async function recursiveDiscover(currentDir) {
            try {
                const entries = await fs.readdir(currentDir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(currentDir, entry.name);
                    if (entry.isDirectory()) {
                        if (!ignoreDirs.has(entry.name)) {
                            await recursiveDiscover(fullPath);
                        }
                    } else {
                        if (!fileMap[currentDir]) {
                            fileMap[currentDir] = [];
                        }
                        fileMap[currentDir].push(fullPath);
                    }
                }
            } catch (error) {
                console.error(`Error reading directory ${currentDir}:`, error);
            }
        }

        await recursiveDiscover(directory);
        return fileMap;
    }
}

module.exports = EntityScout;
