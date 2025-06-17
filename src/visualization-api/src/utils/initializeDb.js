const { execute } = require('./sqliteDb');

async function initializeDb() {
  const createWorkQueueTable = `
    CREATE TABLE IF NOT EXISTS work_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      worker_id TEXT,
      last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  const createAnalysisResultsTable = `
    CREATE TABLE IF NOT EXISTS analysis_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      work_item_id INTEGER,
      file_path TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending_ingestion',
      llm_output TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  const createFailedWorkTable = `
    CREATE TABLE IF NOT EXISTS failed_work (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      work_item_id INTEGER,
      error_message TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  try {
    await execute(createWorkQueueTable);
    await execute(createAnalysisResultsTable);
    await execute(createFailedWorkTable);
    console.log('Database tables checked/created successfully.');
  } catch (error) {
    console.error('Error initializing database:', error);
    // Exit the process if the database cannot be initialized
    process.exit(1);
  }
}

module.exports = { initializeDb };