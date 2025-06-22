const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { SQLITE_DB_PATH } = require('../../config');

let dbPromise;

const getDb = () => {
    if (!dbPromise) {
        dbPromise = (async () => {
            try {
                const db = await open({
                    filename: SQLITE_DB_PATH,
                    driver: sqlite3.Database,
                });

                await db.exec('PRAGMA journal_mode = WAL');
                await db.exec('PRAGMA synchronous = NORMAL');
                await db.exec('PRAGMA busy_timeout = 10000');
                await db.exec('PRAGMA foreign_keys = ON');

                // Create schema if it doesn't exist
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
                `);

                return db;
            } catch (error) {
                console.error("Failed to connect to the database:", error);
                dbPromise = null; // Reset promise on failure
                throw error;
            }
        })();
    }
    return dbPromise;
};

module.exports = {
    getDb,
};