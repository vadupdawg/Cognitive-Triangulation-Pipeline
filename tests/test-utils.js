const fs = require('fs-extra');
const path = require('path');
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');

const TEST_DB_PATH = path.join(__dirname, 'test.db');

function createDb() {
    if (fs.existsSync(TEST_DB_PATH)) {
        fs.unlinkSync(TEST_DB_PATH);
    }
    const db = new Database(TEST_DB_PATH);
    const schema = fs.readFileSync(path.join(__dirname, '../src/utils/schema.sql'), 'utf-8');
    db.exec(schema);
    return { db, dbPath: TEST_DB_PATH };
}

function seedData(db, data) {
    const insertFile = db.prepare('INSERT INTO files (id, path, checksum, language) VALUES (?, ?, ?, ?)');
    const insertPoi = db.prepare('INSERT INTO pois (id, file_id, name, type, description, line_number) VALUES (?, ?, ?, ?, ?, ?)');

    db.transaction(() => {
        if (data.files) {
            for (const file of data.files) {
                insertFile.run(file.id, file.path, file.checksum, file.language);
            }
        }
        if (data.pois) {
            for (const poi of data.pois) {
                insertPoi.run(poi.id, poi.file_id, poi.name, poi.type, poi.description, poi.line_number);
            }
        }
    })();
}

function cleanup(db, dbPath) {
    if (db) {
        db.close();
    }
    if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
    }
}

module.exports = {
    createDb,
    seedData,
    cleanup,
    TEST_DB_PATH
};