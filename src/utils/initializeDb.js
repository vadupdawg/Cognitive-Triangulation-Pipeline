//
// initializeDb.js
//
// This script initializes the SQLite database with the required schema.
// It creates the tables needed by the agents to manage the pipeline.
// This is intended to be run once before starting the system.
//

const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { SQLITE_DB_PATH } = require('../../config');

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS work_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
    worker_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS refactoring_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_type TEXT NOT NULL, -- DELETE, RENAME
    old_path TEXT,
    new_path TEXT,
    status TEXT NOT NULL DEFAULT 'pending', -- pending, completed
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS analysis_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    work_item_id INTEGER NOT NULL,
    file_path TEXT NOT NULL,
    llm_output TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending_ingestion', -- pending_ingestion, ingested
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (work_item_id) REFERENCES work_queue (id)
  );

  CREATE TABLE IF NOT EXISTS failed_work (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    work_item_id INTEGER,
    error_message TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (work_item_id) REFERENCES work_queue (id)
  );

  CREATE TABLE IF NOT EXISTS file_state (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path TEXT NOT NULL UNIQUE,
    content_hash TEXT NOT NULL,
    last_scanned DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`;

async function initialize() {
  console.log('Initializing database...');
  const db = await open({
    filename: SQLITE_DB_PATH,
    driver: sqlite3.Database,
  });

  await db.exec(SCHEMA);
  console.log('Database initialized successfully.');
  await db.close();
}

initialize().catch((err) => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});

module.exports = { initialize };