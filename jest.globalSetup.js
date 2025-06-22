const { initializeDb } = require('./src/utils/sqliteDb');

module.exports = async () => {
  console.log('Global setup: Initializing database schema...');
  await initializeDb();
  console.log('Global setup: Database schema is ready.');
};