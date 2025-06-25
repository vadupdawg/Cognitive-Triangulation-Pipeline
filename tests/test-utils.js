const neo4j = require('neo4j-driver');
const { v4: uuidv4 } = require('uuid');
const { NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD } = require('../src/config');

const adminDriver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));

async function createTestDatabase() {
  const dbName = `test_${uuidv4().replace(/-/g, '')}`;
  const adminSession = adminDriver.session({ database: 'system' });
  try {
    await adminSession.run(`CREATE DATABASE ${dbName}`);
  } finally {
    await adminSession.close();
  }
  return dbName;
}

async function dropTestDatabase(dbName) {
  const adminSession = adminDriver.session({ database: 'system' });
  try {
    await adminSession.run(`DROP DATABASE ${dbName}`);
  } finally {
    await adminSession.close();
  }
}

function getTestDriver(dbName) {
  return neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD), { database: dbName });
}

module.exports = {
  createTestDatabase,
  dropTestDatabase,
  getTestDriver,
  closeAdminDriver: () => adminDriver.close(),
};