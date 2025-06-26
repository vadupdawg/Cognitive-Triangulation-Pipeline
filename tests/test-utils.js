const fs = require('fs-extra');
const path = require('path');
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');

function createDb() {
    const dbPath = path.join(__dirname, `${uuidv4()}.sqlite`);
    const db = new Database(dbPath);
    const schema = fs.readFileSync(path.join(__dirname, '../src/utils/schema.sql'), 'utf-8');
    db.exec(schema);
    return { db, dbPath };
}

function seedData(db, { files, pois, relationships }) {
    if (files) {
        const insert = db.prepare('INSERT INTO files (id, file_path, checksum, language) VALUES (?, ?, ?, ?)');
        db.transaction(() => {
            files.forEach(f => insert.run(f.id, f.file_path, f.checksum, f.language));
        })();
    }
    if (pois) {
        const insert = db.prepare('INSERT INTO pois (id, file_id, type, name, description, line_number, is_exported) VALUES (?, ?, ?, ?, ?, ?, ?)');
        db.transaction(() => {
            pois.forEach(p => insert.run(p.id, p.file_id, p.type, p.name, p.description, p.line_number, p.is_exported ? 1 : 0));
        })();
    }
    if (relationships) {
        const insert = db.prepare('INSERT INTO relationships (id, source_poi_id, target_poi_id, type, reason) VALUES (?, ?, ?, ?, ?)');
        db.transaction(() => {
            relationships.forEach(r => insert.run(uuidv4(), r.source_poi_id, r.target_poi_id, r.type, r.reason));
        })();
    }
}

function cleanup(db, dbPath) {
    if (db) {
        db.close();
    }
    if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
    }
}

const neo4j = require('neo4j-driver');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

function getDriver() {
    return neo4j.driver(
        process.env.NEO4J_URI,
        neo4j.auth.basic(process.env.NEO4J_USER, process.env.NEO4J_PASSWORD)
    );
}

module.exports = { createDb, seedData, cleanup, getDriver };