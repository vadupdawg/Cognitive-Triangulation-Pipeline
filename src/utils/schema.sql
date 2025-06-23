CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    path TEXT NOT NULL UNIQUE,
    checksum TEXT,
    language TEXT
);

CREATE TABLE IF NOT EXISTS pois (
    id TEXT PRIMARY KEY,
    file_id TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    description TEXT,
    line_number INTEGER,
    is_exported BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (file_id) REFERENCES files (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS relationships (
    id TEXT PRIMARY KEY,
    source_poi_id TEXT NOT NULL,
    target_poi_id TEXT NOT NULL,
    type TEXT NOT NULL,
    reason TEXT,
    FOREIGN KEY (source_poi_id) REFERENCES pois (id) ON DELETE CASCADE,
    FOREIGN KEY (target_poi_id) REFERENCES pois (id) ON DELETE CASCADE
);