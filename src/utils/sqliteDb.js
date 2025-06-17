//
// sqliteDb.js
//
// This module provides a simplified, mockable interface to the SQLite database.
// In a real-world scenario, this would be a thin wrapper around the 'sqlite3' library,
// managing a connection pool and providing methods for executing queries.
// For the purpose of London School TDD, it exposes an interface that can be
// easily mocked by Jest.
//

const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { SQLITE_DB_PATH } = require('../../config');

// This is a placeholder for the actual database connection.
// The real implementation would initialize this in a more robust way.
let db = null;

/**
 * Executes a SQL query.
 * This function is designed to be mocked in tests.
 * @param {string} sql The SQL query to execute.
 * @param {Array<any>} [params=[]] The parameters for the query.
 * @returns {Promise<any>} The result of the query.
 */
async function execute(sql, params = []) {
  // In a real implementation, we would use the 'db' object to run the query.
  // For testing, this function is mocked, so no actual DB interaction happens.
  if (!db) {
    // In a real app, you'd likely have a more robust connection management setup.
    // This is simplified for the example.
    db = await open({
      filename: SQLITE_DB_PATH,
      driver: sqlite3.Database,
    });
  }
  // The return value depends on the query type (e.g., all, get, run)
  if (sql.trim().toUpperCase().startsWith('SELECT')) {
    return db.all(sql, params);
  }
  return db.run(sql, params);
}

/**
 * Begins a new transaction.
 * @returns {Promise<void>}
 */
async function beginTransaction() {
    await execute('BEGIN TRANSACTION');
}

/**
 * Commits the current transaction.
 * @returns {Promise<void>}
 */
async function commit() {
    await execute('COMMIT');
}

/**
 * Rolls back the current transaction.
 * @returns {Promise<void>}
 */
async function rollback() {
    await execute('ROLLBACK');
}

/**
 * Executes a SQL query and returns a single row.
 * @param {string} sql The SQL query to execute.
 * @param {Array<any>} [params=[]] The parameters for the query.
 * @returns {Promise<any>} The first row of the result set.
 */
async function querySingle(sql, params = []) {
    if (!db) {
        db = await open({
            filename: SQLITE_DB_PATH,
            driver: sqlite3.Database,
        });
    }
    return db.get(sql, params);
}

module.exports = {
  execute,
  beginTransaction,
  commit,
  rollback,
  querySingle,
};