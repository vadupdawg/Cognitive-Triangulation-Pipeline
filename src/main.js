const { getDb, initializeDb } = require('./utils/sqliteDb');
const neo4jDriverModule = require('./utils/neo4jDriver');
const { getNeo4jDriver } = neo4jDriverModule;
const { getDeepseekClient } = require('./utils/deepseekClient');
const EntityScout = require('./agents/EntityScout');
const GraphBuilder = require('./agents/GraphBuilder');
const RelationshipResolver = require('./agents/RelationshipResolver');
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
    console.log('Clearing databases for fresh start...');
    await clearDatabases(db, neo4jDriver);
    console.log('Databases cleared successfully.');

    // Initialize cognitive triangulation agents
    const entityScout = new EntityScout(db, llmClient, targetDirectory);
    const graphBuilder = new GraphBuilder(db, neo4jDriver);
    const relationshipResolver = new RelationshipResolver(db, llmClient);

    // Run the cognitive triangulation pipeline
    console.log('Starting EntityScout Agent...');
    await entityScout.run();
    console.log('EntityScout Agent finished.');

    console.log('Starting GraphBuilder Agent...');
    await graphBuilder.run();
    console.log('GraphBuilder Agent finished.');

    console.log('Starting RelationshipResolver Agent...');
    await relationshipResolver.run();
    console.log('RelationshipResolver Agent finished.');

    console.log('Cognitive triangulation pipeline completed successfully.');
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
  // Clear SQLite database tables and reset auto-increment counters
  console.log('Clearing SQLite database tables...');
  await db.run('DELETE FROM entity_reports');
  await db.run('DELETE FROM files');
  
  // Reset auto-increment counters to ensure fresh start
  await db.run('DELETE FROM sqlite_sequence WHERE name IN ("files", "entity_reports")');
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

main();