const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const { SQLITE_DB_PATH } = require('../../config');
let db;

const getDb = (path = SQLITE_DB_PATH) => {
    if (!db) {
        db = new Database(path);
        db.pragma('journal_mode = WAL');
        db.pragma('foreign_keys = ON');
    }
    return db;
};

const initializeDb = () => {
    const db = getDb();
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
    db.exec(schema);
}

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