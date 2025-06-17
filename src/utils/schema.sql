CREATE TABLE IF NOT EXISTS work_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT NOT NULL, -- Relative path (legacy)
  absolute_file_path TEXT, -- New: Absolute path for robust identification
  content_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
  worker_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS refactoring_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_type TEXT NOT NULL, -- DELETE, RENAME
  old_path TEXT, -- Relative path (legacy)
  new_path TEXT, -- Relative path (legacy)
  absolute_old_path TEXT, -- New: Absolute path for robust identification
  absolute_new_path TEXT, -- New: Absolute path for robust identification
  status TEXT NOT NULL DEFAULT 'pending', -- pending, completed
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS analysis_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_item_id INTEGER NOT NULL,
  file_path TEXT NOT NULL, -- Relative path (legacy)
  absolute_file_path TEXT, -- New: Absolute path for robust identification
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
  file_path TEXT NOT NULL UNIQUE, -- Relative path (legacy)
  absolute_file_path TEXT UNIQUE, -- New: Absolute path for robust identification
  content_hash TEXT NOT NULL,
  last_scanned DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes for performance on absolute paths
CREATE INDEX IF NOT EXISTS idx_work_queue_absolute_path ON work_queue(absolute_file_path);
CREATE INDEX IF NOT EXISTS idx_analysis_results_absolute_path ON analysis_results(absolute_file_path);
CREATE INDEX IF NOT EXISTS idx_file_state_absolute_path ON file_state(absolute_file_path);