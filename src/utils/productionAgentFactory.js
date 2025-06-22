const fs = require('fs').promises;
const path = require('path');

const { ScoutAgent, RepositoryScanner, ChangeAnalyzer, QueuePopulator, StatePersistor } = require('../agents/ScoutAgent');
const { WorkerAgent } = require('../agents/WorkerAgent');
const { processBatch } = require('../agents/GraphIngestorAgent');

const DeepSeekClient = require('./deepseekClient');
const neo4jDriver = require('./neo4jDriver');
const sqliteDb = require('./sqliteDb');
const { getBatchProcessor } = require('./batchProcessor');

/**
 * Production Agent Factory
 * Creates production-ready agents with high-performance batch processing
 */
class ProductionAgentFactory {
    constructor() {
        this.deepseekClient = new DeepSeekClient();
        this.batchProcessor = null;
    }

    /**
     * Initializes the batch processor for high-concurrency operations
     */
    async initializeBatchProcessor() {
        if (!this.batchProcessor) {
            this.batchProcessor = getBatchProcessor();
            await this.batchProcessor.startWorkers();
            console.log('Batch processor initialized for high-concurrency operations');
        }
        return this.batchProcessor;
    }

    /**
     * Creates a ScoutAgent with production configuration
     */
    async createScoutAgent(targetDirectory) {
        // Create database connector for ScoutAgent using the new interface
        const dbConnector = {
            execute: async (query, params = []) => {
                return await sqliteDb.execute(query, params);
            },
            querySingle: async (query, params = []) => {
                return await sqliteDb.querySingle(query, params);
            },
            beginTransaction: async () => {
                await sqliteDb.beginTransaction();
            },
            commit: async () => {
                await sqliteDb.commit();
            },
            rollback: async () => {
                await sqliteDb.rollback();
            }
        };

        const repositoryScanner = new RepositoryScanner(targetDirectory);
        const changeAnalyzer = new ChangeAnalyzer();
        const queuePopulator = new QueuePopulator(dbConnector, targetDirectory);
        
        return new ScoutAgent(repositoryScanner, changeAnalyzer, queuePopulator, dbConnector, targetDirectory);
    }

    /**
     * Creates a WorkerAgent with high-performance batch processing
     */
    async createWorkerAgent(targetDirectory = null) {
        // Ensure batch processor is initialized
        await this.initializeBatchProcessor();
        
        // Create a lightweight database interface for the worker
        const dbInterface = {
            execute: async (query, params = []) => await sqliteDb.execute(query, params),
            querySingle: async (query, params = []) => await sqliteDb.querySingle(query, params),
        };
        
        return new WorkerAgent(dbInterface, this.deepseekClient, targetDirectory);
    }

    /**
     * Processes a batch of completed analysis results and ingests them into Neo4j
     */
    async processAnalysisResults() {
        return await processBatch();
    }

    /**
     * Tests database and API connections
     */
    async testConnections() {
        const results = {
            deepseek: false,
            neo4j: false,
            sqlite: false,
            redis: false
        };

        // Test DeepSeek connection
        try {
            console.log('Testing DeepSeek connection...');
            const testResponse = await this.deepseekClient.call({
                system: "You are a test assistant.",
                user: "Respond with exactly: 'Connection test successful'"
            });
            
            if (testResponse && testResponse.body) {
                results.deepseek = true;
                console.log('DeepSeek: Connected');
            }
        } catch (error) {
            console.error('DeepSeek connection failed:', error.message);
        }

        // Test Neo4j connection
        try {
            console.log('Testing Neo4j connection...');
            const session = neo4jDriver.session();
            await session.run('RETURN 1 as test');
            await session.close();
            results.neo4j = true;
            console.log('Neo4j: Connected');
        } catch (error) {
            console.error('Neo4j connection failed:', error.message);
        }

        // Test SQLite connection
        try {
            console.log('Testing SQLite connection...');
            const testResult = await sqliteDb.querySingle('SELECT 1 as test');
            if (testResult && testResult.test === 1) {
                results.sqlite = true;
                console.log('SQLite: Connected');
            }
        } catch (error) {
            console.error('SQLite connection failed:', error.message);
        }

        // Test in-memory batch processor
        try {
            console.log('Testing in-memory batch processor...');
            const batchProcessor = getBatchProcessor();
            const stats = await batchProcessor.getQueueStats();
            results.redis = true; // Keep same field name for compatibility
            console.log('In-memory batch processor: Ready');
        } catch (error) {
            console.error('Batch processor initialization failed:', error.message);
        }

        return results;
    }

    /**
     * Create a production GraphIngestorAgent function
     */
    createGraphIngestorAgent() {
        return {
            processBatch: async (analysisBatch, refactoringBatch) => {
                await processBatch(analysisBatch, refactoringBatch);
            }
        };
    }

    /**
     * Initialize the database with the schema
     */
    async initializeDatabase() {
        try {
            const schemaPath = path.join(__dirname, 'schema.sql');
            const schema = await fs.readFile(schemaPath, 'utf8');
            await sqliteDb.execute(schema);
            console.log('Database initialized with schema');
        } catch (error) {
            console.error('Failed to initialize database:', error);
            throw error;
        }
    }

    /**
     * Clear all databases (SQLite and Neo4j) for a fresh pipeline start
     */
    async clearAllDatabases() {
        console.log('🗑️  Clearing all databases for fresh pipeline start...');
        
        try {
            // Clear SQLite database and immediately apply new schema
            await this.clearSqliteDatabase();
            await this.initializeDatabase(); // Apply schema immediately after clearing
            
            // Clear Neo4j database
            await this.clearNeo4jDatabase();
            
            console.log('✅ All databases cleared successfully');
        } catch (error) {
            console.error('❌ Error clearing databases:', error.message);
            throw error;
        }
    }

    /**
     * Clear all SQLite tables using optimized DELETE statements
     */
    async clearSqliteDatabase() {
        console.log('  📊 Clearing SQLite database...');
        
        try {
            // Use DELETE statements instead of DROP/CREATE for better WAL mode compatibility
            const tables = ['analysis_results', 'failed_work', 'work_queue', 'file_state'];
            
            await sqliteDb.createTransaction(async (db) => {
                for (const table of tables) {
                    try {
                        await db.run(`DELETE FROM ${table}`);
                        console.log(`    ✅ Cleared table: ${table}`);
                    } catch (error) {
                        // Table might not exist yet, which is fine
                        console.log(`    ⚠️  Table ${table} does not exist (will be created by schema)`);
                    }
                }
            });
            
            console.log('  ✅ SQLite database cleared');
        } catch (error) {
            console.error('  ❌ Error clearing SQLite database:', error.message);
            throw error;
        }
    }

    /**
     * Clear Neo4j database
     */
    async clearNeo4jDatabase() {
        console.log('  🔗 Clearing Neo4j database...');
        
        try {
            const session = neo4jDriver.session();
            await session.run('MATCH (n) DETACH DELETE n');
            await session.close();
            console.log('  ✅ Neo4j database cleared');
        } catch (error) {
            console.error('  ❌ Error clearing Neo4j database:', error.message);
            throw error;
        }
    }

    /**
     * Get SQLite connection using the new high-performance interface
     */
    async getSqliteConnection() {
        // Return a connection-like interface for backward compatibility
        return {
            execute: async (query, params = []) => await sqliteDb.execute(query, params),
            all: async (query, params = []) => await sqliteDb.execute(query, params),
            get: async (query, params = []) => await sqliteDb.querySingle(query, params),
            run: async (query, params = []) => await sqliteDb.execute(query, params),
            exec: async (query) => await sqliteDb.execute(query),
            close: () => {
                // No-op since we use a singleton connection
            }
        };
    }

    /**
     * Gets batch processor statistics for monitoring
     */
    async getBatchStats() {
        if (this.batchProcessor) {
            return await this.batchProcessor.getQueueStats();
        }
        return null;
    }

    /**
     * Cleanup resources
     */
    async cleanup() {
        console.log('Cleaning up production agent factory...');
        
        if (this.batchProcessor) {
            await this.batchProcessor.shutdown();
        }
        
        sqliteDb.close();
        await neo4jDriver.close();
        
        console.log('Production agent factory cleanup complete');
    }
}

module.exports = { ProductionAgentFactory }; 