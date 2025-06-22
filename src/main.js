const { getDb, initializeDb } = require('./utils/sqliteDb');
const { getNeo4jDriver } = require('./utils/neo4jDriver');
const { getDeepseekClient } = require('./utils/deepseekClient');
const { getBatchProcessor } = require('./utils/batchProcessor');
const ScoutAgent = require('./agents/ScoutAgent');
const { WorkerAgent } = require('./agents/WorkerAgent');
const GraphIngestorAgent = require('./agents/GraphIngestorAgent');
const config = require('../config');

async function main() {
  const args = process.argv.slice(2);
  const dirIndex = args.indexOf('--dir');
  const targetDirectory = dirIndex !== -1 ? args[dirIndex + 1] : process.cwd();

  let neo4jDriver;
  try {
    // Initialize database and clients
    await initializeDb();
    const db = await getDb();
    neo4jDriver = getNeo4jDriver();
    const llmClient = getDeepseekClient();

    // Initialize agents
    const scoutAgent = new ScoutAgent(db, targetDirectory);
    const workerAgent = new WorkerAgent(db, llmClient, targetDirectory);
    const graphIngestorAgent = new GraphIngestorAgent(db, neo4jDriver);

    // Run the pipeline
    console.log('Starting Scout Agent...');
    await scoutAgent.run();
    console.log('Scout Agent finished.');

    console.log('Starting Worker Agent...');
    // This is a simplified run loop for the worker.
    const CONCURRENT_WORKERS = 50; // Number of parallel workers
    const tasks = [];
    for (let i = 0; i < CONCURRENT_WORKERS; i++) {
        tasks.push(runWorker(workerAgent, `worker-${i + 1}`));
    }
    await Promise.all(tasks);
    console.log('All workers finished.');

    console.log('Flushing batch processor...');
    const batchProcessor = getBatchProcessor();
    await batchProcessor.forceFlush();
    console.log('Batch processor flushed.');

    console.log('Starting Graph Ingestor Agent...');
    await graphIngestorAgent.run();
    console.log('Graph Ingestor Agent finished.');

    console.log('Pipeline completed successfully.');
  } catch (error) {
    console.error('An error occurred during the pipeline execution:', error);
    process.exit(1);
  } finally {
    if (neo4jDriver) {
      await neo4jDriver.close();
    }
    // The SQLite connection is closed automatically by the `sqlite` library's connection pooling
  }
}

async function runWorker(agent, workerId) {
  while (true) {
    const task = await agent.claimTask(workerId);
    if (!task) {
      console.log(`${workerId} found no more tasks.`);
      break;
    }
    await agent.processTask(task);
  }
}

main();