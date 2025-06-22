//
// initializeDb.js
//
// This script initializes the SQLite database with the required schema.
// It creates the tables needed by the agents to manage the pipeline.
// This is intended to be run once before starting the system.
//

const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const fs = require('fs');
const path = require('path');
const { SQLITE_DB_PATH } = require('../../config');

// Read schema from the schema.sql file to ensure consistency
const SCHEMA_FILE_PATH = path.join(__dirname, 'schema.sql');

async function initialize() {
  console.log('Initializing database with high-performance settings...');
  
  // Read the schema from schema.sql file
  let schema;
  try {
    schema = fs.readFileSync(SCHEMA_FILE_PATH, 'utf8');
    console.log('Loaded schema from schema.sql');
  } catch (error) {
    console.error('Failed to read schema.sql file:', error);
    throw error;
  }
  
  const db = await open({
    filename: SQLITE_DB_PATH,
    driver: sqlite3.Database,
  });

  try {
    // Configure SQLite for optimal concurrent access based on research
    console.log('Configuring SQLite for optimal concurrent access...');
    
    // Enable WAL mode for better concurrency
    await db.exec('PRAGMA journal_mode = WAL');
    
    // Set synchronous to NORMAL for better performance while maintaining durability
    await db.exec('PRAGMA synchronous = NORMAL');
    
    // Set busy timeout to 10 seconds - optimal balance for concurrent workers
    await db.exec('PRAGMA busy_timeout = 10000');
    
    // Reduce checkpoint frequency to minimize lock contention
    await db.exec('PRAGMA wal_autocheckpoint = 200');
    
    // Enable foreign keys for data integrity
    await db.exec('PRAGMA foreign_keys = ON');
    
    // Optimize cache size for better performance (10MB cache)
    await db.exec('PRAGMA cache_size = -10000');
    
    console.log('SQLite configured with optimal WAL mode settings for concurrent workers');
    
    await db.exec(schema);
    console.log('Database initialized successfully with enhanced schema.');
  } catch (error) {
    console.error('Failed to execute schema:', error);
    throw error;
  } finally {
    await db.close();
  }
}

// Only run if called directly (not when imported as module)
if (require.main === module) {
  initialize().catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });
}

module.exports = { initialize };