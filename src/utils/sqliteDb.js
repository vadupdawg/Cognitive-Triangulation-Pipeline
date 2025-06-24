const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

/**
 * Manages a connection to a SQLite database.
 * This class removes the singleton pattern, allowing for multiple, isolated
 * database connections, which is crucial for testing and modularity.
 */
class DatabaseManager {
    /**
     * @param {string} dbPath - The path to the SQLite database file.
     */
    constructor(dbPath) {
        if (!dbPath) {
            throw new Error('Database path is required.');
        }
        this.dbPath = dbPath;
        this.db = null;
    }

    /**
     * Establishes and returns the database connection.
     * @returns {Database} The better-sqlite3 database instance.
     */
    getDb() {
        if (!this.db) {
            this.db = new Database(this.dbPath);
            this.db.pragma('journal_mode = WAL');
            this.db.pragma('foreign_keys = ON');
        }
        return this.db;
    }

    /**
     * Initializes the database with the schema.
     */
    initializeDb() {
        const db = this.getDb();
        const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
        db.exec(schema);
    }

    /**
     * Closes the database connection.
     */
    close() {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }
}

// Global database manager instance
let globalDbManager = null;

/**
 * Initialize the global database connection
 */
async function initializeDb() {
    const dbPath = process.env.SQLITE_DB_PATH || './database.db';
    globalDbManager = new DatabaseManager(dbPath);
    globalDbManager.initializeDb();
}

/**
 * Get the global database connection
 */
async function getDb() {
    if (!globalDbManager) {
        throw new Error('Database not initialized. Call initializeDb() first.');
    }
    return globalDbManager.getDb();
}

module.exports = {
    DatabaseManager,
    initializeDb,
    getDb
};