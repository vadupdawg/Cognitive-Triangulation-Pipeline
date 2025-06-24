const { DatabaseManager } = require('./src/utils/sqliteDb');
const { SQLITE_DB_PATH } = require('./config');

module.exports = async () => {
  console.log('Global setup: Initializing database schema...');
  const dbManager = new DatabaseManager(SQLITE_DB_PATH);
  dbManager.initializeDb();
  dbManager.close();
  console.log('Global setup: Database schema is ready.');
};