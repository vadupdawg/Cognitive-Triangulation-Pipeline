//
// sqliteDb.js
//
// High-performance SQLite database interface with batch processing capabilities
// Optimized for concurrent access using the original sqlite3 library with batching strategies
//

const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { SQLITE_DB_PATH } = require('../../config');

// Single database connection - reused for better performance
let db = null;

/**
 * Initializes database connection with optimal PRAGMA settings for high concurrency
 */
async function initConnection() {
  if (!db) {
    db = await open({
      filename: SQLITE_DB_PATH,
      driver: sqlite3.Database,
    });
    
    // Apply optimal PRAGMA settings for high-concurrency workloads
    await db.exec('PRAGMA journal_mode = WAL');
    await db.exec('PRAGMA synchronous = NORMAL');
    await db.exec('PRAGMA busy_timeout = 10000');  // 10 second timeout
    await db.exec('PRAGMA wal_autocheckpoint = 200');  // Frequent checkpoints to minimize lock time
    await db.exec('PRAGMA foreign_keys = ON');
    await db.exec('PRAGMA cache_size = -10000');  // 10MB cache
    
    console.log('Database connection initialized with high-performance settings');
  }
  return db;
}

/**
 * Executes a SQL query with parameters
 * @param {string} sql The SQL query to execute
 * @param {Array<any>} [params=[]] The parameters for the query
 * @returns {any} The result of the query
 */
async function execute(sql, params = []) {
  const connection = await initConnection();
  
  // Determine query type and execute accordingly
  const trimmedSql = sql.trim().toUpperCase();
  
  if (trimmedSql.startsWith('SELECT')) {
    return await connection.all(sql, params);
  } else if (trimmedSql.startsWith('INSERT') || trimmedSql.startsWith('UPDATE') || trimmedSql.startsWith('DELETE')) {
    return await connection.run(sql, params);
  } else {
    // For CREATE, DROP, PRAGMA, etc.
    return await connection.exec(sql);
  }
}

/**
 * Executes a query and returns a single row
 * @param {string} sql The SQL query to execute
 * @param {Array<any>} [params=[]] The parameters for the query
 * @returns {any} The first row of the result set
 */
async function querySingle(sql, params = []) {
  const connection = await initConnection();
  return await connection.get(sql, params);
}

/**
 * Executes multiple queries in a transaction for batch processing
 * @param {Array<{sql: string, params: Array}>} queries Array of query objects
 * @returns {Array} Array of results for each query
 */
async function executeBatch(queries) {
  const connection = await initConnection();
  
  await connection.exec('BEGIN IMMEDIATE TRANSACTION');
  try {
    const results = [];
    for (const query of queries) {
      if (query.sql.trim().toUpperCase().startsWith('SELECT')) {
        results.push(await connection.all(query.sql, query.params || []));
      } else {
        results.push(await connection.run(query.sql, query.params || []));
      }
    }
    await connection.exec('COMMIT');
    return results;
  } catch (error) {
    await connection.exec('ROLLBACK');
    throw error;
  }
}

/**
 * Executes a prepared statement multiple times in a transaction (for bulk inserts)
 * @param {string} sql The SQL statement to prepare
 * @param {Array<Array>} paramSets Array of parameter arrays
 * @returns {Object} Transaction result with changes and lastInsertRowid
 */
async function executeBulk(sql, paramSets) {
  const connection = await initConnection();
  
  await connection.exec('BEGIN IMMEDIATE TRANSACTION');
  try {
    const stmt = await connection.prepare(sql);
    let totalChanges = 0;
    let lastInsertRowid = null;
    
    for (const params of paramSets) {
      const result = await stmt.run(params);
      totalChanges += result.changes;
      if (result.lastInsertRowid) {
        lastInsertRowid = result.lastInsertRowid;
      }
    }
    
    await stmt.finalize();
    await connection.exec('COMMIT');
    
    return { changes: totalChanges, lastInsertRowid };
  } catch (error) {
    await connection.exec('ROLLBACK');
    throw error;
  }
}

/**
 * Creates a transaction function for complex operations
 * @param {Function} callback Function to execute within the transaction
 * @returns {Promise<any>} Result of the transaction
 */
async function createTransaction(callback) {
  const connection = await initConnection();
  
  await connection.exec('BEGIN IMMEDIATE TRANSACTION');
  try {
    const result = await callback(connection);
    await connection.exec('COMMIT');
    return result;
  } catch (error) {
    await connection.exec('ROLLBACK');
    throw error;
  }
}

/**
 * Gets the raw database connection for advanced operations
 * @returns {Database} The sqlite database instance
 */
async function getConnection() {
  return await initConnection();
}

/**
 * Closes the database connection
 */
async function close() {
  if (db) {
    await db.close();
    db = null;
  }
}

// Legacy compatibility methods
async function beginTransaction() {
  const connection = await initConnection();
  await connection.exec('BEGIN IMMEDIATE TRANSACTION');
}

async function commit() {
  const connection = await initConnection();
  await connection.exec('COMMIT');
}

async function rollback() {
  const connection = await initConnection();
  await connection.exec('ROLLBACK');
}

module.exports = {
  execute,
  querySingle,
  executeBatch,
  executeBulk,
  createTransaction,
  getConnection,
  close,
  // Legacy compatibility
  beginTransaction,
  commit,
  rollback,
};