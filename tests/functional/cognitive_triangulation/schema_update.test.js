const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const schemaPath = path.join(__dirname, '../../../src/utils/schema.sql');
const initialSchema = fs.readFileSync(schemaPath, 'utf-8');

describe('Cognitive Triangulation v2: Schema Update', () => {
    let db;
    const dbPath = path.join(__dirname, 'schema_update.test.db');

    beforeAll(() => {
        // 1. Create a temporary database
        if (fs.existsSync(dbPath)) {
            fs.unlinkSync(dbPath);
        }
        db = new Database(dbPath);

        // 2. Initialize with the base schema
        db.exec(initialSchema);

        // 3. Update the schema according to v2 specifications
        db.exec(`
            ALTER TABLE relationships ADD COLUMN status TEXT;
            ALTER TABLE relationships ADD COLUMN confidenceScore REAL;
        `);

        db.exec(`
            CREATE TABLE IF NOT EXISTS relationship_evidence (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                relationshipId INTEGER NOT NULL,
                runId TEXT NOT NULL,
                evidencePayload TEXT NOT NULL,
                FOREIGN KEY (relationshipId) REFERENCES relationships (id) ON DELETE CASCADE
            );
        `);
    });

    afterAll(() => {
        // 6. Ensure the test cleans up the temporary database file
        if (db) {
            db.close();
        }
        if (fs.existsSync(dbPath)) {
            fs.unlinkSync(dbPath);
        }
    });

    test('SU-001: should add status and confidenceScore columns to the relationships table', () => {
        const columns = db.pragma('table_info(relationships)');
        const columnNames = columns.map(col => col.name);

        // 4. Assert that the relationships table contains the new columns
        expect(columnNames).toContain('status');
        expect(columnNames).toContain('confidenceScore');

        const statusColumn = columns.find(c => c.name === 'status');
        expect(statusColumn.type).toBe('TEXT');

        const confidenceScoreColumn = columns.find(c => c.name === 'confidenceScore');
        expect(confidenceScoreColumn.type).toBe('REAL');
    });

    test('SU-002: should create the relationship_evidence table with the correct schema', () => {
        const columns = db.pragma('table_info(relationship_evidence)');
        const columnMap = new Map(columns.map(c => [c.name, c]));

        // 5. Assert that the relationship_evidence table exists and has the correct columns
        expect(columnMap.has('id')).toBe(true);
        expect(columnMap.get('id').type).toBe('INTEGER');
        expect(columnMap.get('id').pk).toBe(1);

        expect(columnMap.has('relationshipId')).toBe(true);
        expect(columnMap.get('relationshipId').type).toBe('INTEGER');
        
        expect(columnMap.has('runId')).toBe(true);
        expect(columnMap.get('runId').type).toBe('TEXT');

        expect(columnMap.has('evidencePayload')).toBe(true);
        expect(columnMap.get('evidencePayload').type).toBe('TEXT');
    });
});