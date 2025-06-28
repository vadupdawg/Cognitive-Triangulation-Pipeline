require('dotenv').config({ path: './.env' });
const { DatabaseManager } = require('./src/utils/sqliteDb');
const { getInstance } = require('./src/utils/queueManager');
const config = require('./src/config');

module.exports = async (globalConfig) => {
  console.log('Global setup: Initializing database schema...');
  const dbManager = new DatabaseManager(config.SQLITE_DB_PATH);
  dbManager.initializeDb();
  dbManager.close();
  console.log('Global setup: Database schema is ready.');

  console.log('Global setup: Clearing all Redis queues...');
  
  // Get the QueueManager instance
  const queueManager = getInstance();
  
  // Connect and then perform operations
  await queueManager.connect();
  console.log(`Global setup: QueueManager connected: ${queueManager.isConnected}`);
  await queueManager.clearAllQueues();
  await queueManager.closeConnections();
  console.log('Global setup: All Redis queues are cleared.');
};