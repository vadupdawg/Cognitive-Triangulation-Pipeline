// @ts-check
const { Readable } = require('stream');

// Mock Implementations per docs/test-plans/ScoutAgent_test_plan.md

/**
 * @typedef {import('../../src/agents/ScoutAgent').RepositoryScanner} RepositoryScanner
 * @typedef {import('../../src/agents/ScoutAgent').ChangeAnalyzer} ChangeAnalyzer
 * @typedef {import('../../src/agents/ScoutAgent').QueuePopulator} QueuePopulator
 * @typedef {import('../../src/agents/ScoutAgent').StatePersistor} StatePersistor
 * @typedef {import('../../src/agents/ScoutAgent').ScoutAgent} ScoutAgent
 */

/**
 * Mock file system to simulate repository states.
 */
class MockFileSystem {
    /** @type {Map<string, string>} */
    files = new Map();
    /** @type {Set<string>} */
    accessedFiles = new Set();
    /** @type {Error | null} */
    errorOnAccess = null;

    /**
     * @param {Record<string, string>} layout
     */
    setLayout(layout) {
        this.files = new Map(Object.entries(layout));
    }

    /**
     * @param {string} filePath
     * @returns {string}
     */
    readFile(filePath) {
        this.accessedFiles.add(filePath);
        if (this.errorOnAccess && this.files.has(filePath)) {
            throw this.errorOnAccess;
        }
        if (!this.files.has(filePath)) {
            throw new Error(`File not found: ${filePath}`);
        }
        return this.files.get(filePath) || '';
    }

    /**
     * @param {string} filePath
     * @returns {Readable}
     */
    createReadStream(filePath) {
        this.accessedFiles.add(filePath);
        const stream = new Readable({
            read() {}
        });

        const fileContent = this.files.get(filePath);

        if (this.errorOnAccess && filePath.includes('unreadable')) {
            // Defer the error event to better simulate real-world async errors
            process.nextTick(() => stream.emit('error', this.errorOnAccess));
        } else if (fileContent === undefined) {
            process.nextTick(() => stream.emit('error', new Error(`File not found: ${filePath}`)));
        } else {
            stream.push(fileContent);
            stream.push(null); // End of stream
        }
        
        return stream;
    }

    /**
     * @returns {string[]}
     */
    getAllFiles() {
        return Array.from(this.files.keys());
    }
}

/**
 * Mock database connector to track SQL queries and transactions.
 */
class MockDatabaseConnector {
    /** @type {any[]} */
    queries = [];
    /** @type {boolean} */
    inTransaction = false;
    /** @type {any[]} */
    preloadedData = [];
    /** @type {Error | null} */
    errorOnInsert = null;
    insertCount = 0;

    /**
     * @param {string} sql
     * @param {any[]} params
     * @returns {any[]}
     */
    execute(sql, params = []) {
        this.queries.push({ sql, params });

        if (this.errorOnInsert && sql.startsWith('INSERT')) {
            this.insertCount++;
            if (this.insertCount >= 2) {
                throw this.errorOnInsert;
            }
        }
        
        if (sql.startsWith('SELECT')) {
            return this.preloadedData;
        }

        return [];
    }

    beginTransaction() {
        this.inTransaction = true;
        this.queries.push({ sql: 'BEGIN TRANSACTION', params: [] });
    }

    commit() {
        if (!this.inTransaction) throw new Error("Cannot commit outside a transaction.");
        this.inTransaction = false;
        this.queries.push({ sql: 'COMMIT TRANSACTION', params: [] });
    }

    rollback() {
        if (!this.inTransaction) throw new Error("Cannot rollback outside a transaction.");
        this.inTransaction = false;
        this.queries.push({ sql: 'ROLLBACK TRANSACTION', params: [] });
    }

    /**
     * @param {any[]} data
     */
    preload(data) {
        this.preloadedData = data;
    }

    clear() {
        this.queries = [];
        this.inTransaction = false;
        this.preloadedData = [];
        this.errorOnInsert = null;
        this.insertCount = 0;
    }
}

// Placeholder for the actual agent - assuming it will be in this location
const { 
    ScoutAgent: ActualScoutAgent, 
    RepositoryScanner: ActualRepositoryScanner,
    ChangeAnalyzer: ActualChangeAnalyzer,
    QueuePopulator: ActualQueuePopulator
} = require('../../src/agents/ScoutAgent');


describe('ScoutAgent Tests', () => {
    /** @type {ScoutAgent} */
    let scoutAgent;
    /** @type {MockFileSystem} */
    let mockFileSystem;
    /** @type {MockDatabaseConnector} */
    let mockDbConnector;
    /** @type {RepositoryScanner} */
    let repositoryScanner;
    /** @type {ChangeAnalyzer} */
    let changeAnalyzer;
    /** @type {QueuePopulator} */
    let queuePopulator;


    beforeEach(() => {
        mockFileSystem = new MockFileSystem();
        mockDbConnector = new MockDatabaseConnector();
        
        // These would be the actual implementations passed to the agent
        repositoryScanner = new ActualRepositoryScanner(mockFileSystem);
        changeAnalyzer = new ActualChangeAnalyzer();
        queuePopulator = new ActualQueuePopulator(mockDbConnector);
        
        scoutAgent = new ActualScoutAgent(repositoryScanner, changeAnalyzer, queuePopulator, mockDbConnector);
    });

    describe('5.1. Initial Repository Scan (First Run)', () => {
        test('SCOUT-001: Agent successfully processes an empty directory on the first run.', async () => {
            mockFileSystem.setLayout({});
            mockDbConnector.preload([]); // No previous state

            await scoutAgent.run();

            expect(mockDbConnector.queries).toContainEqual({ sql: 'BEGIN TRANSACTION', params: [] });
            expect(mockDbConnector.queries).toContainEqual({ sql: 'SELECT * FROM file_state', params: [] });
            expect(mockDbConnector.queries.filter(q => q.sql.startsWith('INSERT'))).toHaveLength(0);
            expect(mockDbConnector.queries).toContainEqual({ sql: 'DELETE FROM file_state', params: [] });
            expect(mockDbConnector.queries).toContainEqual({ sql: 'COMMIT TRANSACTION', params: [] });
        });

        test('SCOUT-002: Agent processes a repository with several new files on the first run.', async () => {
            mockFileSystem.setLayout({
                'file1.js': 'content1',
                'src/file2.js': 'content2'
            });
            mockDbConnector.preload([]);

            await scoutAgent.run();
            
            const workQueueInserts = mockDbConnector.queries.filter(q => q.sql.includes('INSERT INTO work_queue'));
            expect(workQueueInserts).toHaveLength(2);
            expect(workQueueInserts).toContainEqual(expect.objectContaining({ params: ['file1.js', expect.any(String), 'pending'] }));
            expect(workQueueInserts).toContainEqual(expect.objectContaining({ params: ['src/file2.js', expect.any(String), 'pending'] }));

            const fileStateInserts = mockDbConnector.queries.filter(q => q.sql.includes('INSERT INTO file_state'));
            expect(fileStateInserts).toHaveLength(2);
            expect(fileStateInserts).toContainEqual(expect.objectContaining({ params: ['file1.js', expect.any(String)] }));
            expect(fileStateInserts).toContainEqual(expect.objectContaining({ params: ['src/file2.js', expect.any(String)] }));

            expect(mockDbConnector.queries[0].sql).toBe('BEGIN TRANSACTION');
            expect(mockDbConnector.queries[mockDbConnector.queries.length - 1].sql).toBe('COMMIT TRANSACTION');
        });

        test('SCOUT-003: Agent correctly ignores files and directories based on exclusion patterns.', async () => {
            mockFileSystem.setLayout({
                'src/app.js': 'content',
                'node_modules/lib.js': 'content',
                'README.md': 'content',
                'app.test.js': 'content'
            });

            const currentState = await repositoryScanner.scan();
            expect(currentState.has('src/app.js')).toBe(true);
            expect(currentState.has('node_modules/lib.js')).toBe(false);
            expect(currentState.has('README.md')).toBe(false);
            expect(currentState.has('app.test.js')).toBe(false);
        });
    });

    describe('5.2. Incremental Updates', () => {
        test('SCOUT-004: Agent correctly identifies and queues a single new file.', async () => {
            const previousState = new Map([['a.js', 'hash1']]);
            const currentState = new Map([['a.js', 'hash1'], ['b.js', 'hash2']]);
            
            const changes = changeAnalyzer.analyze(previousState, currentState);
            await queuePopulator.populate(changes);

            const workQueueInserts = mockDbConnector.queries.filter(q => q.sql.includes('INSERT INTO work_queue'));
            expect(workQueueInserts).toHaveLength(1);
            expect(workQueueInserts[0].params).toEqual(['b.js', 'hash2', 'pending']);
        });

        test('SCOUT-005: Agent correctly identifies and queues a single modified file.', async () => {
            const previousState = new Map([['a.js', 'hash1']]);
            const currentState = new Map([['a.js', 'hash2_modified']]);

            const changes = changeAnalyzer.analyze(previousState, currentState);
            await queuePopulator.populate(changes);

            const workQueueInserts = mockDbConnector.queries.filter(q => q.sql.includes('INSERT INTO work_queue'));
            expect(workQueueInserts).toHaveLength(1);
            expect(workQueueInserts[0].params).toEqual(['a.js', 'hash2_modified', 'pending']);
        });

        test('SCOUT-006: Agent correctly identifies and queues a single deleted file.', async () => {
            const previousState = new Map([['a.js', 'hash1'], ['b.js', 'hash2']]);
            const currentState = new Map([['a.js', 'hash1']]);

            const changes = changeAnalyzer.analyze(previousState, currentState);
            await queuePopulator.populate(changes);

            const refactoringQueueInserts = mockDbConnector.queries.filter(q => q.sql.includes('INSERT INTO refactoring_tasks'));
            expect(refactoringQueueInserts).toHaveLength(1);
            expect(refactoringQueueInserts[0].params).toEqual(['DELETE', 'b.js', null]);
        });

        test('SCOUT-007: Agent correctly identifies and queues a single renamed file.', async () => {
            const previousState = new Map([['old_name.js', 'hash123']]);
            const currentState = new Map([['new_name.js', 'hash123']]);

            const changes = changeAnalyzer.analyze(previousState, currentState);
            await queuePopulator.populate(changes);

            const refactoringQueueInserts = mockDbConnector.queries.filter(q => q.sql.includes('INSERT INTO refactoring_tasks'));
            expect(refactoringQueueInserts).toHaveLength(1);
            expect(refactoringQueueInserts[0].params).toEqual(['RENAME', 'old_name.js', 'new_name.js']);
            
            const workQueueInserts = mockDbConnector.queries.filter(q => q.sql.includes('INSERT INTO work_queue'));
            expect(workQueueInserts).toHaveLength(0);
        });

        test('SCOUT-008: Agent correctly handles a run with no file changes.', async () => {
            const previousState = new Map([['a.js', 'hash1']]);
            const currentState = new Map([['a.js', 'hash1']]);

            const changes = changeAnalyzer.analyze(previousState, currentState);
            await queuePopulator.populate(changes);
            
            expect(mockDbConnector.queries.filter(q => q.sql.startsWith('INSERT'))).toHaveLength(0);
        });
    });

    describe('5.3. Error Handling and Resilience', () => {
        test('SCOUT-009: Agent correctly rolls back DB transaction on failure.', async () => {
            mockFileSystem.setLayout({ 'a.js': 'content1', 'b.js': 'content2' });
            mockDbConnector.preload([]);
            mockDbConnector.errorOnInsert = new Error('DB write failure');

            await expect(scoutAgent.run()).rejects.toThrow('DB write failure');

            expect(mockDbConnector.queries).toContainEqual({ sql: 'BEGIN TRANSACTION', params: [] });
            expect(mockDbConnector.queries.filter(q => q.sql.startsWith('INSERT'))).not.toHaveLength(0);
            expect(mockDbConnector.queries).toContainEqual({ sql: 'ROLLBACK TRANSACTION', params: [] });
            expect(mockDbConnector.queries).not.toContainEqual({ sql: 'COMMIT TRANSACTION', params: [] });
        });

        test('SCOUT-010: Agent skips an unreadable file and continues the scan.', async () => {
            mockFileSystem.setLayout({
                'readable.js': 'content',
                'unreadable.js': 'content'
            });
            mockFileSystem.errorOnAccess = new Error('File access error');
            // The mock's createReadStream will now throw an error for 'unreadable.js'

            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

            const currentState = await repositoryScanner.scan();
            
            expect(currentState.has('readable.js')).toBe(true);
            expect(currentState.has('unreadable.js')).toBe(false);
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                'Skipping unreadable file: unreadable.js',
                expect.any(Error)
            );

            consoleErrorSpy.mockRestore();
        });
    });
});