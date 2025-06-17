//
// run.js
//
// This script serves as the main entry point for orchestrating the agents.
// It provides a command-line interface to run the Scout, Worker, and
// GraphIngestor agents individually or as a complete pipeline.
//

const { ScoutAgent, RepositoryScanner, ChangeAnalyzer, QueuePopulator } = require('./src/agents/ScoutAgent');
const { WorkerAgent } = require('./src/agents/WorkerAgent');
const { processBatch } = require('./src/agents/GraphIngestorAgent');
const sqliteDb = require('./src/utils/sqliteDb');
const neo4jDriver = require('./src/utils/neo4jDriver');
const fs = require('fs-extra');
const path = require('path');

// A mock LLM client for testing purposes
const mockLlmClient = {
  call: async (prompt) => {
    console.log('Mock LLM Client called with prompt:', prompt);
    // Simulate a successful response with dummy data
    return {
      body: JSON.stringify({
        entities: [{ type: 'File', name: 'test.js', qualifiedName: 'test.js' }],
        relationships: [],
      }),
    };
  },
};

// A simple file system abstraction for the ScoutAgent
const fileSystem = {
  getAllFiles: () => {
    // This should be adapted to scan a real directory for a full test
    return [
      'src/agents/ScoutAgent.js',
      'src/agents/WorkerAgent.js',
      'src/agents/GraphIngestorAgent.js',
      'src/utils/sqliteDb.js',
      'src/utils/neo4jDriver.js',
      'config.js',
      'package.json'
    ];
  },
  createReadStream: (filePath) => {
    return fs.createReadStream(path.resolve(__dirname, filePath));
  },
};

async function runScout() {
  console.log('Running Scout Agent...');
  const scanner = new RepositoryScanner(fileSystem);
  const analyzer = new ChangeAnalyzer();
  const populator = new QueuePopulator(sqliteDb);
  const agent = new ScoutAgent(scanner, analyzer, populator, sqliteDb);
  await agent.run();
  console.log('Scout Agent finished.');
}

async function runWorker() {
  console.log('Running Worker Agent...');
  const agent = new WorkerAgent(sqliteDb, fs, mockLlmClient);
  const task = await agent.claimTask('worker-1');
  if (task) {
    console.log(`Processing task: ${task.file_path}`);
    await agent.processTask(task);
    console.log('Worker Agent finished task.');
  } else {
    console.log('No tasks for Worker Agent to process.');
  }
}

async function runIngestor() {
  console.log('Running Graph Ingestor Agent...');
  const analysisBatch = await sqliteDb.execute("SELECT * FROM analysis_results WHERE status = 'pending_ingestion'");
  const refactoringBatch = await sqliteDb.execute("SELECT * FROM refactoring_tasks WHERE status = 'pending'");
  await processBatch(analysisBatch, refactoringBatch);
  console.log('Graph Ingestor Agent finished.');
}

async function main() {
  const command = process.argv[2];

  try {
    switch (command) {
      case 'scout':
        await runScout();
        break;
      case 'worker':
        await runWorker();
        break;
      case 'ingestor':
        await runIngestor();
        break;
      case 'all':
        await runScout();
        await runWorker();
        await runIngestor();
        break;
      default:
        console.log('Usage: node run.js [scout|worker|ingestor|all]');
    }
  } catch (error) {
    console.error('An error occurred:', error);
    process.exit(1);
  } finally {
    // Close the Neo4j driver connection if it was opened
    if (neo4jDriver) {
      await neo4jDriver.close();
    }
  }
}

main();