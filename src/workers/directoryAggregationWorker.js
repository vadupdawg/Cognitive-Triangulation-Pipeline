const { Worker } = require('bullmq');

class DirectoryAggregationWorker {
    constructor(queueManager, cacheClient, options = {}) {
        this.queueManager = queueManager;
        this.cacheClient = cacheClient;
        this.directoryResolutionQueue = this.queueManager.getQueue('directory-resolution-queue');
        
        if (!options.processOnly) {
            this.worker = new Worker('directory-aggregation-queue', this.process.bind(this), {
                connection: this.queueManager.connectionOptions,
                concurrency: 10,
            });
        }
    }

    async close() {
        if (this.worker) {
            await this.worker.close();
        }
    }

    async process(job) {
        const { directoryPath, runId, fileJobId } = job.data;
        console.log(`[DirectoryAggregationWorker] Processing job for directory: ${directoryPath}`);

        const directoryFilesKey = `run:${runId}:dir:${directoryPath}:files`;
        const processedFilesKey = `run:${runId}:dir:${directoryPath}:processed`;

        // Atomically mark the file as processed and check if all files are done
        const pipeline = this.cacheClient.pipeline();
        pipeline.sadd(processedFilesKey, fileJobId);
        pipeline.scard(directoryFilesKey);
        pipeline.scard(processedFilesKey);
        const [, totalFiles, processedFiles] = await pipeline.exec();

        if (totalFiles[1] === processedFiles[1]) {
            console.log(`[DirectoryAggregationWorker] All files in ${directoryPath} processed. Enqueuing for resolution.`);
            await this.directoryResolutionQueue.add('analyze-directory', {
                directoryPath,
                runId,
            });
        }
    }
}

module.exports = DirectoryAggregationWorker;