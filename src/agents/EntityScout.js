const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class EntityScout {
    constructor(queueManager) {
        this.fileAnalysisQueue = queueManager.getQueue('file-analysis-queue');
        this.graphBuildQueue = queueManager.getQueue('graph-build-queue');
        this.directoryResolutionQueue = queueManager.getQueue('directory-resolution-queue');
        this.globalResolutionQueue = queueManager.getQueue('global-resolution-queue');
    }

    async run() {
        const runId = uuidv4();
        console.log(`Starting EntityScout run with ID: ${runId}`);

        try {
            const parentJob = await this._createParentJob(runId);
            console.log(`Parent job ${parentJob.id} created for run ${runId}`);

            const fileMap = await this._discoverFiles();

            if (Object.keys(fileMap).length === 0) {
                console.log(`No files discovered for analysis. Run ${runId} complete.`);
                return;
            }

            const dirJobIds = [];
            for (const dirPath in fileMap) {
                const dirJob = await this.directoryResolutionQueue.add('resolve-directory', { directoryPath: dirPath, runId }, {});
                dirJobIds.push(dirJob.id);

                const filePaths = fileMap[dirPath];
                const childJobs = await this._createFileAnalysisJobs(filePaths, runId);
                const childJobIds = childJobs.map(job => job.id);

                await dirJob.addDependencies({ jobs: childJobIds });
            }

            await parentJob.addDependencies({ jobs: dirJobIds });

            console.log(`EntityScout run ${runId} successfully orchestrated.`);
        } catch (error) {
            console.error(`EntityScout run failed: ${error.message}`);
            throw error;
        }
    }

    async _createParentJob(runId) {
        return await this.globalResolutionQueue.add('resolve-global', { runId }, {});
    }

    async _createFileAnalysisJobs(filePaths, runId) {
        if (!filePaths || filePaths.length === 0) {
            return [];
        }

        const jobsToCreate = filePaths.map(filePath => ({
            name: 'analyze-file',
            data: { filePath, runId },
        }));

        return await this.fileAnalysisQueue.addBulk(jobsToCreate);
    }

    async _discoverFiles(dir = '.') {
        const fileMap = {};
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
                    continue;
                }
                const subMap = await this._discoverFiles(fullPath);
                Object.assign(fileMap, subMap);
            } else if (entry.isFile() && entry.name.endsWith('.js')) {
                const dirPath = path.dirname(fullPath);
                if (!fileMap[dirPath]) {
                    fileMap[dirPath] = [];
                }
                fileMap[dirPath].push(fullPath);
            }
        }

        return fileMap;
    }
}

module.exports = EntityScout;
