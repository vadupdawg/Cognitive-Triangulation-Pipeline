const { getDb } = require('./src/utils/sqliteDb');

module.exports = async () => {
  console.log('Global setup: Warming up database connection...');
  await getDb();
  console.log('Global setup: Database connection is ready.');
};