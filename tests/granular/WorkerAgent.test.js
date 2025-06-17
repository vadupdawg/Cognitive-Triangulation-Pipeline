// @ts-check
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
require('dotenv').config();
const ProductionAgentFactory = require('../../src/utils/productionAgentFactory');
const { FileNotFoundError, LlmCallFailedError, InvalidJsonResponseError } = require('../../src/agents/WorkerAgent');

describe('WorkerAgent Production Tests', () => {
    let factory;
    let tempTestPath;
    let workerAgent;
    let connections;

    beforeAll(async () => {
        // Initialize production factory
        factory = new ProductionAgentFactory();
        
        // Test connections
        console.log('\n=== Testing Production Connections ===');
        connections = await factory.testConnections();
        
        if (!connections.sqlite) {
            throw new Error('SQLite is required for WorkerAgent tests');
        }
        
        if (!connections.deepseek) {
            console.warn('⚠️  DeepSeek API not available - some tests may be skipped');
        }

        // Initialize database with schema
        await factory.initializeDatabase();
        console.log('Production WorkerAgent environment ready');
    }, 60000);

    afterAll(async () => {
        if (factory) {
            await factory.cleanup();
        }
    });

    beforeEach(async () => {
        tempTestPath = await fs.mkdtemp(path.join(os.tmpdir(), 'worker-prod-test-'));
        
        // Create production WorkerAgent with DeepSeek
        workerAgent = await factory.createWorkerAgent();

        // Clean database before each test
        const db = await factory.getSqliteConnection();
        try {
            await db.exec('DELETE FROM work_queue');
            await db.exec('DELETE FROM analysis_results');
            await db.exec('DELETE FROM failed_work');
        } finally {
            await db.close();
        }
    });

    afterEach(async () => {
        if (tempTestPath) {
            await fs.rm(tempTestPath, { recursive: true, force: true });
        }
    });

    async function setupTask(filePath, contentHash = 'test-hash') {
        const db = await factory.getSqliteConnection();
        try {
            const result = await db.run(
                'INSERT INTO work_queue (file_path, content_hash, status) VALUES (?, ?, ?)',
                [filePath, contentHash, 'pending']
            );
            return { id: result.lastID, file_path: filePath, content_hash: contentHash };
        } finally {
            await db.close();
        }
    }

    describe('Successful Task Processing', () => {
        test('WORKER-PROD-001: Processes a task with DeepSeek LLM and real file', async () => {
            if (!connections.deepseek) {
                console.log('Skipping DeepSeek test - API not available');
                return;
            }

            // Create a real test file
            const filePath = path.join(tempTestPath, 'test.js');
            const fileContent = `
// Test JavaScript file for DeepSeek analysis
class TestClass {
    constructor(name) {
        this.name = name;
    }
    
    greet() {
        return \`Hello, \${this.name}!\`;
    }
}

function processData(data) {
    return data.map(item => item.toUpperCase());
}

module.exports = { TestClass, processData };
            `.trim();
            
            await fs.writeFile(filePath, fileContent);
            
            const task = await setupTask(filePath);
            console.log(`Processing file with DeepSeek: ${filePath}`);

            // Claim and process the task with actual DeepSeek LLM
            const claimedTask = await workerAgent.claimTask('test-worker');
            expect(claimedTask).not.toBeNull();
            expect(claimedTask.id).toBe(task.id);

            await workerAgent.processTask(claimedTask);

            // Verify the analysis result was created with DeepSeek output
            const db = await factory.getSqliteConnection();
            try {
                const analysisResult = await db.get('SELECT * FROM analysis_results WHERE work_item_id = ?', [claimedTask.id]);
                const failedWork = await db.get('SELECT * FROM failed_work WHERE work_item_id = ?', [claimedTask.id]);
                const workItemStatus = await db.get('SELECT * FROM work_queue WHERE id = ?', [claimedTask.id]);
                
                console.log('Analysis result:', analysisResult);
                console.log('Failed work:', failedWork);
                console.log('Work item status:', workItemStatus?.status);
                
                expect(analysisResult).toBeDefined();
                expect(analysisResult.llm_output).toBeTruthy();
                
                // Parse and validate DeepSeek's analysis
                const llmOutput = JSON.parse(analysisResult.llm_output);
                expect(llmOutput).toHaveProperty('filePath');
                expect(llmOutput).toHaveProperty('entities');
                expect(llmOutput).toHaveProperty('relationships');
                expect(Array.isArray(llmOutput.entities)).toBe(true);
                expect(Array.isArray(llmOutput.relationships)).toBe(true);
                
                console.log(`✅ DeepSeek found: ${llmOutput.entities.length} entities, ${llmOutput.relationships.length} relationships`);

                const workItem = await db.get('SELECT * FROM work_queue WHERE id = ?', [task.id]);
                expect(workItem).toBeDefined();
                expect(workItem.status).toBe('completed');
            } finally {
                await db.close();
            }
        }, 120000); // 2 minute timeout for LLM processing
    });

    describe('Error Handling', () => {
        test('WORKER-PROD-002: Handles a file that does not exist', async () => {
            const filePath = path.join(tempTestPath, 'nonexistent.js');
            const task = await setupTask(filePath);

            await workerAgent.processTask(task);

            const db = await factory.getSqliteConnection();
            try {
                const failedWork = await db.get('SELECT * FROM failed_work WHERE work_item_id = ?', [task.id]);
                expect(failedWork).toBeDefined();
                expect(failedWork.error_message).toContain('File not found');
            } finally {
                await db.close();
            }
        });

        test('WORKER-PROD-003: Handles invalid file path (path traversal)', async () => {
            const maliciousPath = '../../../etc/passwd';
            const task = await setupTask(maliciousPath);

            await workerAgent.processTask(task);

            const db = await factory.getSqliteConnection();
            try {
                const failedWork = await db.get('SELECT * FROM failed_work WHERE work_item_id = ?', [task.id]);
                expect(failedWork).toBeDefined();
                expect(failedWork.error_message).toContain('Path traversal attempt detected');
            } finally {
                await db.close();
            }
        });

        test('WORKER-PROD-004: Handles DeepSeek API failure gracefully', async () => {
            if (!connections.deepseek) {
                console.log('Skipping DeepSeek error test - API not available');
                return;
            }

            // Create a file that might cause DeepSeek issues (very large or malformed)
            const filePath = path.join(tempTestPath, 'problematic.js');
            const problematicContent = 'a'.repeat(100000); // Very large file
            await fs.writeFile(filePath, problematicContent);
            
            const task = await setupTask(filePath);

            // This might fail due to size limits or other API issues
            await workerAgent.processTask(task);

            const db = await factory.getSqliteConnection();
            try {
                // Check if it either succeeded or failed gracefully
                const analysisResult = await db.get('SELECT * FROM analysis_results WHERE work_item_id = ?', [task.id]);
                const failedWork = await db.get('SELECT * FROM failed_work WHERE work_item_id = ?', [task.id]);
                
                // Either should succeed or fail gracefully, but not crash
                expect(analysisResult || failedWork).toBeTruthy();
                
                if (failedWork) {
                    console.log(`Expected failure handled: ${failedWork.error_message}`);
                }
            } finally {
                await db.close();
            }
        }, 60000);
    });
});