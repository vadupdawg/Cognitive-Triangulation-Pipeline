//
// neo4jDriver.js
//
// This module provides a simplified, mockable interface to the Neo4j database driver.
// In a real-world application, this would be a thin wrapper around the 'neo4j-driver'
// library, managing the driver instance and providing a clean way to get sessions.
// For the purpose of London School TDD, it exposes an interface that can be
// easily mocked by Jest, matching the structure used in the test files.
//

const neo4j = require('neo4j-driver');
const { NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD } = require('../../config');

// This is a placeholder for the actual driver instance.
// The real implementation would initialize this based on environment variables.
let driver;

/**
 * Returns a singleton instance of the Neo4j driver.
 * This function is designed to be mocked in tests.
 * @returns {neo4j.Driver} The Neo4j driver instance.
 */
function getDriver() {
  if (!driver || driver._closed) {
    // In a real app, connection details would come from environment variables
    // and you'd have more robust error handling and connection management.
    driver = neo4j.driver(
      NEO4J_URI,
      neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD)
    );
  }
  return driver;
}

// Export an object that always returns a fresh driver if needed
module.exports = {
  session: (config) => getDriver().session(config),
  verifyConnectivity: () => getDriver().verifyConnectivity(),
  close: () => {
    if (driver && !driver._closed) {
      return driver.close();
    }
  },
  // For backward compatibility, allow direct access to driver methods
  ...getDriver()
};