const neo4j = require('neo4j-driver');
const { v4: uuidv4 } = require('uuid');
const { NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD } = require('../src/config');

/**
 * Resolves localhost to IPv4 to avoid DNS resolution issues on Windows
 * @param {string} uri - The original Neo4j URI
 * @returns {string} - The URI with localhost resolved to 127.0.0.1
 */
function resolveLocalhostToIPv4(uri) {
  return uri.replace('localhost', '127.0.0.1');
}

const adminDriver = neo4j.driver(resolveLocalhostToIPv4(NEO4J_URI), neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));

async function createTestDatabase() {
  // Neo4j database names must use only simple ascii characters, numbers, dots and dashes
  const dbName = `test-${uuidv4()}`;
  const adminSession = adminDriver.session({ database: 'system' });
  try {
    await adminSession.run(`CREATE DATABASE \`${dbName}\``);
  } finally {
    await adminSession.close();
  }
  return dbName;
}

async function dropTestDatabase(dbName) {
  const adminSession = adminDriver.session({ database: 'system' });
  try {
    await adminSession.run(`DROP DATABASE \`${dbName}\``);
  } finally {
    await adminSession.close();
  }
}

function getTestDriver(dbName) {
  return neo4j.driver(resolveLocalhostToIPv4(NEO4J_URI), neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD), { database: dbName });
}

module.exports = {
  createTestDatabase,
  dropTestDatabase,
  getTestDriver,
  closeAdminDriver: () => adminDriver.close(),
};