const neo4j = require('neo4j-driver');

class GraphIngestionWorker {
    constructor(options) {
        this.driver = neo4j.driver(options.neo4jUri, neo4j.auth.basic(options.neo4jUser, options.neo4jPassword));
    }

    async processJob(job) {
        if (!job.data.graphJson) {
            throw new Error('Job data is missing graphJson.');
        }
        // Implementation to be added
    }

    async close() {
        await this.driver.close();
    }
}

module.exports = GraphIngestionWorker;