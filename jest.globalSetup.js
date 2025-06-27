const { DatabaseManager } = require('./src/utils/sqliteDb');
const QueueManager = require('./src/utils/queueManager');
const { SQLITE_DB_PATH } = require('./src/config');

module.exports = async (globalConfig) => {
  console.log('Global setup: Initializing database schema...');
  const dbManager = new DatabaseManager(SQLITE_DB_PATH);
  dbManager.initializeDb();
  dbManager.close();
  console.log('Global setup: Database schema is ready.');

  console.log('Global setup: Clearing all Redis queues...');
  const queueManager = new QueueManager();
  await queueManager.clearAllQueues();
  await queueManager.closeConnections();
  console.log('Global setup: All Redis queues are cleared.');
};