const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { SQLITE_DB_PATH } = require('../../config');

let dbPromise;

const initializeDb = async () => {
    const db = await getDb();
    await db.exec(`
        CREATE TABLE IF NOT EXISTS files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_path TEXT NOT NULL UNIQUE,
            checksum TEXT NOT NULL,
            language TEXT,
            status TEXT DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS analysis_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_id INTEGER,
            file_path TEXT,
            absolute_file_path TEXT,
            status TEXT DEFAULT 'pending',
            llm_output TEXT,
            validation_errors TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (file_id) REFERENCES files (id)
        );
        CREATE TABLE IF NOT EXISTS work_queue (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_id INTEGER,
            file_path TEXT NOT NULL,
            content_hash TEXT,
            status TEXT DEFAULT 'pending',
            worker_id TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (file_id) REFERENCES files(id)
        );
        CREATE TABLE IF NOT EXISTS failed_work (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            work_item_id INTEGER,
            error_message TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (work_item_id) REFERENCES work_queue(id)
        );
    `);
};

const getDb = () => {
    if (!dbPromise) {
        dbPromise = open({
            filename: SQLITE_DB_PATH,
            driver: sqlite3.Database,
        }).then(async (db) => {
            await db.exec('PRAGMA journal_mode = WAL');
            await db.exec('PRAGMA synchronous = NORMAL');
            await db.exec('PRAGMA busy_timeout = 10000');
            await db.exec('PRAGMA foreign_keys = ON');
            return db;
        }).catch(error => {
            console.error("Failed to connect to the database:", error);
            dbPromise = null;
            throw error;
        });
    }
    return dbPromise;
};

const createTransaction = async (callback) => {
    const db = await getDb();
    try {
        await db.run('BEGIN');
        await callback(db);
        await db.run('COMMIT');
    } catch (error) {
        console.error('Transaction failed, rolling back:', error);
        await db.run('ROLLBACK');
        throw error;
    }
};

module.exports = {
    getDb,
    initializeDb,
    createTransaction,
};