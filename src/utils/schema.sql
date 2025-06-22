CREATE TABLE IF NOT EXISTS work_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT NOT NULL, -- Relative path (legacy)
  absolute_file_path TEXT NOT NULL, -- Absolute path for robust identification (now required)
  content_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
  worker_id TEXT,
  file_size_bytes INTEGER, -- File size for optimization decisions
  language_detected TEXT, -- Programming language detected from extension
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS refactoring_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_type TEXT NOT NULL, -- DELETE, RENAME
  old_path TEXT, -- Relative path (legacy)
  new_path TEXT, -- Relative path (legacy)
  absolute_old_path TEXT NOT NULL, -- Absolute path for robust identification (now required)
  absolute_new_path TEXT, -- Required for RENAME, NULL for DELETE
  status TEXT NOT NULL DEFAULT 'pending', -- pending, completed
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS analysis_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_item_id INTEGER NOT NULL,
  file_path TEXT NOT NULL, -- Relative path (legacy)
  absolute_file_path TEXT NOT NULL, -- Absolute path for robust identification (now required)
  llm_output TEXT NOT NULL, -- Validated JSON from LLM
  status TEXT NOT NULL DEFAULT 'completed', -- completed, validation_failed
  
  -- Validation and Quality Metrics
  validation_passed BOOLEAN DEFAULT FALSE, -- Whether JSON schema validation passed
  validation_errors TEXT, -- JSON array of validation error messages
  entities_count INTEGER DEFAULT 0, -- Number of entities extracted
  relationships_count INTEGER DEFAULT 0, -- Number of relationships extracted
  confidence_score REAL, -- Overall confidence score (0.0-1.0) if calculated
  
  -- Processing Metadata
  processing_duration_ms INTEGER, -- Time taken to process the file
  token_count_estimated INTEGER, -- Estimated token count of the file content
  was_truncated BOOLEAN DEFAULT FALSE, -- Whether content was truncated for token limits
  retry_count INTEGER DEFAULT 0, -- Number of retries for this analysis
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (work_item_id) REFERENCES work_queue (id)
);

CREATE TABLE IF NOT EXISTS failed_work (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_item_id INTEGER,
  error_message TEXT NOT NULL,
  error_type TEXT, -- validation_error, llm_error, parsing_error, timeout_error
  retry_count INTEGER DEFAULT 0,
  last_retry_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (work_item_id) REFERENCES work_queue (id)
);

CREATE TABLE IF NOT EXISTS file_state (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT NOT NULL UNIQUE, -- Relative path (legacy)
  absolute_file_path TEXT UNIQUE NOT NULL, -- Absolute path for robust identification (now required)
  content_hash TEXT NOT NULL,
  file_size_bytes INTEGER,
  language_detected TEXT,
  last_scanned DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Enhanced validation tracking table for detailed guardrail monitoring
CREATE TABLE IF NOT EXISTS validation_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  analysis_result_id INTEGER,
  validation_step TEXT NOT NULL, -- json_parse, schema_validation, entity_validation, relationship_validation
  passed BOOLEAN NOT NULL,
  error_message TEXT,
  details TEXT, -- JSON with additional validation details
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (analysis_result_id) REFERENCES analysis_results (id)
);

-- Add indexes for performance on absolute paths and new fields
CREATE INDEX IF NOT EXISTS idx_work_queue_absolute_path ON work_queue(absolute_file_path);
CREATE INDEX IF NOT EXISTS idx_work_queue_status ON work_queue(status);
CREATE INDEX IF NOT EXISTS idx_analysis_results_absolute_path ON analysis_results(absolute_file_path);
CREATE INDEX IF NOT EXISTS idx_analysis_results_status ON analysis_results(status);
CREATE INDEX IF NOT EXISTS idx_analysis_results_validation ON analysis_results(validation_passed);
CREATE INDEX IF NOT EXISTS idx_file_state_absolute_path ON file_state(absolute_file_path);
CREATE INDEX IF NOT EXISTS idx_failed_work_error_type ON failed_work(error_type);
CREATE INDEX IF NOT EXISTS idx_validation_logs_result_id ON validation_logs(analysis_result_id);

-- Add constraints to ensure data integrity
CREATE TRIGGER IF NOT EXISTS validate_refactoring_task_paths
BEFORE INSERT ON refactoring_tasks
FOR EACH ROW
WHEN (NEW.task_type = 'RENAME' AND NEW.absolute_new_path IS NULL)
BEGIN
  SELECT RAISE(FAIL, 'RENAME tasks must have absolute_new_path');
END;