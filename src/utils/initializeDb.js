const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const fs = require('fs');
const path = require('path');
const { SQLITE_DB_PATH } = require('../../config');

const SCHEMA_FILE_PATH = path.join(__dirname, 'schema.sql');

async function initialize() {
  console.log('Initializing database with high-performance settings...');
  
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
    console.log('Configuring SQLite for optimal concurrent access...');
    
    await db.exec('PRAGMA journal_mode = WAL');
    await db.exec('PRAGMA synchronous = NORMAL');
    await db.exec('PRAGMA busy_timeout = 10000');
    await db.exec('PRAGMA wal_autocheckpoint = 200');
    await db.exec('PRAGMA foreign_keys = ON');
    await db.exec('PRAGMA cache_size = -10000');
    
    console.log('SQLite configured with optimal WAL mode settings for concurrent workers');
    
    await db.exec(schema);
    console.log('Database initialized successfully with enhanced schema.');
  } catch (error) {
    console.error('Failed to execute schema:', error);
    throw error;
  } finally {
    // Do not close the connection if running in a test environment
    if (process.env.JEST_WORKER_ID === undefined) {
      await db.close();
    }
  }
}

if (require.main === module) {
  initialize().catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });
}

module.exports = { initialize };