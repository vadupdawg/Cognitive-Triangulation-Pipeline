const { DatabaseManager } = require('./src/utils/sqliteDb');
const { SQLITE_DB_PATH } = require('./config');
const { createTestDatabase } = require('./tests/test-utils');

module.exports = async (globalConfig) => {
  console.log('Global setup: Initializing database schema...');
  const dbManager = new DatabaseManager(SQLITE_DB_PATH);
  dbManager.initializeDb();
  dbManager.close();
  console.log('Global setup: Database schema is ready.');

  // Create a separate Neo4j database for each worker to ensure test isolation
  const promises = Array.from({ length: globalConfig.maxWorkers }).map(createTestDatabase);
  const dbNames = await Promise.all(promises);
  process.env.JEST_NEO4J_DATABASES = JSON.stringify(dbNames);
};