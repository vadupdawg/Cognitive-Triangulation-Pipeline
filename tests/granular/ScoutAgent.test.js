// @ts-check
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
require('dotenv').config();
const ProductionAgentFactory = require('../../src/utils/productionAgentFactory');

describe('ScoutAgent Production Tests', () => {
    let factory;
    let tempRepoPath;
    let scoutAgent;
    let connections;

    beforeAll(async () => {
        // Initialize production factory
        factory = new ProductionAgentFactory();
        
        // Test connections
        console.log('\n=== Testing Production Connections ===');
        connections = await factory.testConnections();
        
        if (!connections.sqlite) {
            throw new Error('SQLite is required for ScoutAgent tests');
        }

        // Initialize database with schema
        await factory.initializeDatabase();
        console.log('Production ScoutAgent environment ready');
    }, 30000);

    afterAll(async () => {
        if (factory) {
            await factory.cleanup();
        }
    });

    beforeEach(async () => {
        tempRepoPath = await fs.mkdtemp(path.join(os.tmpdir(), 'scout-prod-test-'));
        
        // Create production ScoutAgent
        scoutAgent = await factory.createScoutAgent(tempRepoPath);

        // Clean database before each test
        const db = await factory.getSqliteConnection();
        try {
            await db.exec('DELETE FROM work_queue');
            await db.exec('DELETE FROM refactoring_tasks');
            await db.exec('DELETE FROM file_state');
        } finally {
            await db.close();
        }
    });

    afterEach(async () => {
        if (tempRepoPath) {
            await fs.rm(tempRepoPath, { recursive: true, force: true });
        }
    });

    async function createRepoLayout(layout) {
        for (const [filePath, content] of Object.entries(layout)) {
            const fullPath = path.join(tempRepoPath, filePath);
            await fs.mkdir(path.dirname(fullPath), { recursive: true });
            await fs.writeFile(fullPath, content);
        }
    }

    test('SCOUT-PROD-001: Agent processes a repository with several new files on the first run.', async () => {
        await createRepoLayout({
            'file1.js': 'content1',
            'src/file2.js': 'content2'
        });

        await scoutAgent.run();
        
        const db = await factory.getSqliteConnection();
        try {
            const workQueue = await db.all('SELECT * FROM work_queue');
            expect(workQueue).toHaveLength(2);
            expect(workQueue.map(i => i.file_path)).toContain('file1.js');
            expect(workQueue.map(i => i.file_path)).toContain(path.join('src', 'file2.js'));

            const fileState = await db.all('SELECT * FROM file_state');
            expect(fileState).toHaveLength(2);
            expect(fileState.map(i => i.file_path)).toContain('file1.js');
            expect(fileState.map(i => i.file_path)).toContain(path.join('src', 'file2.js'));
        } finally {
            await db.close();
        }
    });

    test('SCOUT-PROD-002: Agent correctly ignores files based on exclusion patterns.', async () => {
        await createRepoLayout({
            'src/app.js': 'content',
            'node_modules/lib.js': 'content',
            'README.md': 'content',
            'app.test.js': 'content'
        });

        await scoutAgent.run();

        const db = await factory.getSqliteConnection();
        try {
            const workQueue = await db.all('SELECT * FROM work_queue');
            expect(workQueue).toHaveLength(1);
            expect(workQueue[0].file_path).toBe(path.join('src', 'app.js'));
        } finally {
            await db.close();
        }
    });

    test('SCOUT-PROD-003: Agent correctly identifies and queues a single new file.', async () => {
        await createRepoLayout({ 'a.js': 'content1' });
        await scoutAgent.run(); 

        await createRepoLayout({ 'b.js': 'content2' });
        await scoutAgent.run();

        const db = await factory.getSqliteConnection();
        try {
            const workQueue = await db.all("SELECT * FROM work_queue WHERE file_path = 'b.js'");
            expect(workQueue).toHaveLength(1);
            expect(workQueue[0].status).toBe('pending');
        } finally {
            await db.close();
        }
    });

    test('SCOUT-PROD-004: Agent correctly identifies and queues a single modified file.', async () => {
        await createRepoLayout({ 'a.js': 'content1' });
        await scoutAgent.run();

        await createRepoLayout({ 'a.js': 'content_modified' });
        await scoutAgent.run();

        const db = await factory.getSqliteConnection();
        try {
            const workQueue = await db.all("SELECT * FROM work_queue WHERE file_path = 'a.js' ORDER BY id DESC");
            // It will be added twice, once for the initial scan, once for the modification
            expect(workQueue).toHaveLength(2);
            expect(workQueue[1].status).toBe('pending');
        } finally {
            await db.close();
        }
    });

    test('SCOUT-PROD-005: Agent correctly identifies and queues a single deleted file.', async () => {
        await createRepoLayout({ 'a.js': 'content1', 'b.js': 'content2' });
        await scoutAgent.run();

        await fs.unlink(path.join(tempRepoPath, 'b.js'));
        await scoutAgent.run();

        const db = await factory.getSqliteConnection();
        try {
            const refactoringTasks = await db.all("SELECT * FROM refactoring_tasks WHERE task_type = 'DELETE'");
            expect(refactoringTasks).toHaveLength(1);
            expect(refactoringTasks[0].old_path).toBe('b.js');
        } finally {
            await db.close();
        }
    });
});