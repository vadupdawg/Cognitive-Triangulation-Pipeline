const neo4jDriver = require('./src/utils/neo4jDriver');
const db = require('./src/utils/sqliteDb');

module.exports = async () => {
  await neo4jDriver.close();
  await db.close();
};