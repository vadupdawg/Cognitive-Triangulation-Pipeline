const { initialize } = require('./src/utils/initializeDb');
const neo4jDriver = require('./src/utils/neo4jDriver');

module.exports = async () => {
  await initialize();
  try {
    await neo4jDriver.verifyConnectivity();
  } catch (error) {
    throw new Error(`Neo4j connection failed: ${error.message}. Please ensure the database is running.`);
  }
};