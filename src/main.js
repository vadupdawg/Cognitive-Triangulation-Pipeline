const { getDb, initializeDb } = require('./utils/sqliteDb');
const neo4jDriverModule = require('./utils/neo4jDriver');
const { getNeo4jDriver } = neo4jDriverModule;
const { getDeepseekClient } = require('./utils/deepseekClient');
const { getBatchProcessor } = require('./utils/batchProcessor');
const ScoutAgent = require('./agents/ScoutAgent');
const { WorkerAgent } = require('./agents/WorkerAgent');
const GraphIngestorAgent = require('./agents/GraphIngestorAgent');
const config = require('./config');

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

    // Clear databases for fresh start
    console.log('Clearing databases for fresh ingestion...');
    await clearDatabases(db, neo4jDriver);
    console.log('Databases cleared successfully.');

    // Initialize agents
    const scoutAgent = new ScoutAgent(db, targetDirectory);
    const workerAgent = new WorkerAgent(db, llmClient, targetDirectory);
    const graphIngestorAgent = new GraphIngestorAgent(db, neo4jDriverModule);

    // Run the pipeline
    console.log('Starting Scout Agent...');
    await scoutAgent.run();
    console.log('Scout Agent finished.');

    console.log('Starting Worker Agent...');
    // Initialize batch processor before starting workers
    const batchProcessor = getBatchProcessor();
    await batchProcessor.startWorkers();
    console.log('Batch processor started.');
    
    // This is a simplified run loop for the worker.
    const CONCURRENT_WORKERS = 50; // Number of parallel workers
    const tasks = [];
    for (let i = 0; i < CONCURRENT_WORKERS; i++) {
        tasks.push(runWorker(workerAgent, `worker-${i + 1}`));
    }
    await Promise.all(tasks);
    console.log('All workers finished.');

    console.log('Flushing batch processor...');
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

async function clearDatabases(db, neo4jDriver) {
  // Reset batch processor to clear persistent state
  console.log('Resetting batch processor...');
  const batchProcessor = getBatchProcessor();
  await batchProcessor.reset();
  console.log('Batch processor reset.');

  // Clear SQLite database tables and reset auto-increment counters
  console.log('Clearing SQLite database tables...');
  await db.run('DELETE FROM failed_work');
  await db.run('DELETE FROM work_queue');
  await db.run('DELETE FROM analysis_results');
  await db.run('DELETE FROM files');
  
  // Reset auto-increment counters to ensure fresh start
  await db.run('DELETE FROM sqlite_sequence WHERE name IN ("files", "analysis_results", "work_queue", "failed_work")');
  console.log('SQLite tables cleared and auto-increment counters reset.');

  // Clear Neo4j database
  console.log('Clearing Neo4j database...');
  const session = neo4jDriverModule.session();
  try {
    await session.run('MATCH (n) DETACH DELETE n');
    console.log('Neo4j database cleared.');
  } finally {
    await session.close();
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