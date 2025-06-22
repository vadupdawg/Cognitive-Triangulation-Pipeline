const fs = require('fs');
const path = require('path');
const { getConnection } = require('../../src/utils/sqliteDb');
const ScoutAgent = require('../../src/agents/ScoutAgent');

describe('ScoutAgent - Production-Focused Tests', () => {
    let db;
    let scoutAgent;
    const repoPath = './polyglot-test';
    const utilsJsPath = path.join(repoPath, 'js', 'utils.js');
    let originalUtilsContent = '';

    beforeAll(() => {
        if (fs.existsSync(utilsJsPath)) {
            originalUtilsContent = fs.readFileSync(utilsJsPath, 'utf-8');
        }
    });

    afterAll(() => {
        if (fs.existsSync(utilsJsPath)) {
            fs.writeFileSync(utilsJsPath, originalUtilsContent);
        }
    });

    beforeEach(async () => {
        db = await getConnection();
        await db.run('DELETE FROM files');
        scoutAgent = new ScoutAgent(db, repoPath);
    });

    describe('constructor(db, repoPath)', () => {
        it('should initialize the agent with a database connection and repository path', () => {
            expect(scoutAgent.db).toBe(db);
            expect(scoutAgent.repoPath).toBe(repoPath);
        });
    });

    describe('detectLanguage(filePath)', () => {
        it('should return "JavaScript" for .js files', () => {
            expect(scoutAgent.detectLanguage('test.js')).toBe('JavaScript');
        });
        it('should return "Python" for .py files', () => {
            expect(scoutAgent.detectLanguage('test.py')).toBe('Python');
        });
        it('should return "Java" for .java files', () => {
            expect(scoutAgent.detectLanguage('test.java')).toBe('Java');
        });
        it('should return "SQL" for .sql files', () => {
            expect(scoutAgent.detectLanguage('test.sql')).toBe('SQL');
        });
        it('should return "unknown" for unsupported file types', () => {
            expect(scoutAgent.detectLanguage('test.txt')).toBe('unknown');
        });
        it('should return "unknown" for files with no extension', () => {
            expect(scoutAgent.detectLanguage('test')).toBe('unknown');
        });
    });

    describe('calculateChecksum(content)', () => {
        it('should return the correct SHA-256 checksum for a known string', () => {
            const checksum = scoutAgent.calculateChecksum('hello world');
            expect(checksum).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
        });
        it('should return the correct SHA-256 checksum for an empty string', () => {
            const checksum = scoutAgent.calculateChecksum('');
            expect(checksum).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
        });
        it('should produce the same hash for the same content', () => {
            const checksum1 = scoutAgent.calculateChecksum('content');
            const checksum2 = scoutAgent.calculateChecksum('content');
            expect(checksum1).toBe(checksum2);
        });
        it('should produce different hashes for different content', () => {
            const checksum1 = scoutAgent.calculateChecksum('content1');
            const checksum2 = scoutAgent.calculateChecksum('content2');
            expect(checksum1).not.toBe(checksum2);
        });
    });

    describe('discoverFiles(directory)', () => {
        it('should find all 15 source files and ignore excluded directories', () => {
            const tempGitDir = path.join(repoPath, '.git');
            const tempNodeModulesDir = path.join(repoPath, 'node_modules');
            if (!fs.existsSync(tempGitDir)) fs.mkdirSync(tempGitDir, { recursive: true });
            if (!fs.existsSync(tempNodeModulesDir)) fs.mkdirSync(tempNodeModulesDir, { recursive: true });

            const files = scoutAgent.discoverFiles(repoPath);
            expect(files.length).toBe(15);
            const serverJsFile = files.find(f => f.filePath.endsWith(path.join('js', 'server.js')));
            expect(serverJsFile).toBeDefined();
            expect(serverJsFile.language).toBe('JavaScript');
            expect(serverJsFile.checksum).toMatch(/^[a-f0-9]{64}$/);

            fs.rmdirSync(tempGitDir, { recursive: true });
            fs.rmdirSync(tempNodeModulesDir, { recursive: true });
        });
    });

    describe('run() and saveFilesToDb(files)', () => {
        it('should populate the database with 15 file records on the first run', async () => {
            await scoutAgent.run();
            const result = await db.get('SELECT COUNT(*) as count FROM files');
            expect(result.count).toBe(15);

            const serverJsFile = await db.get("SELECT * FROM files WHERE file_path LIKE ?", ['%server.js']);
            expect(serverJsFile).toBeDefined();
            expect(serverJsFile.language).toBe('JavaScript');
            expect(serverJsFile.checksum).toMatch(/^[a-f0-9]{64}$/);
        });
    });

    describe('Idempotency', () => {
        it('should not create duplicate records when run multiple times', async () => {
            await scoutAgent.run();
            let result = await db.get('SELECT COUNT(*) as count FROM files');
            expect(result.count).toBe(15);

            await scoutAgent.run();
            result = await db.get('SELECT COUNT(*) as count FROM files');
            expect(result.count).toBe(15);
        });

        it('should update the checksum and status of a modified file', async () => {
            await scoutAgent.run();
            const originalFile = await db.get("SELECT * FROM files WHERE file_path = ?", [utilsJsPath]);
            
            fs.appendFileSync(utilsJsPath, '\n// modified');
            const newContent = fs.readFileSync(utilsJsPath);
            const newChecksum = scoutAgent.calculateChecksum(newContent);

            await scoutAgent.run();

            const updatedFile = await db.get("SELECT * FROM files WHERE file_path = ?", [utilsJsPath]);
            expect(updatedFile.checksum).not.toBe(originalFile.checksum);
            expect(updatedFile.checksum).toBe(newChecksum);
            expect(updatedFile.status).toBe('pending');

            const result = await db.get('SELECT COUNT(*) as count FROM files');
            expect(result.count).toBe(15);
        });
    });
});