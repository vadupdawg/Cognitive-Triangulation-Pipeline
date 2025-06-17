const fs = require('fs').promises;
const path = require('path');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');

const { ScoutAgent, RepositoryScanner, ChangeAnalyzer, QueuePopulator, StatePersistor } = require('../agents/ScoutAgent');
const { WorkerAgent } = require('../agents/WorkerAgent');
const { processBatch } = require('../agents/GraphIngestorAgent');

const DeepSeekClient = require('./deepseekClient');
const neo4jDriver = require('./neo4jDriver');
const sqliteDb = require('./sqliteDb');

/**
 * Production Agent Factory
 * Creates production-ready agents with DeepSeek LLM integration
 */
class ProductionAgentFactory {
    constructor() {
        this.deepseekClient = new DeepSeekClient();
        this.dbPath = path.join(process.cwd(), 'db.sqlite');
    }

    /**
     * Test all connections (DeepSeek, Neo4j, SQLite)
     */
    async testConnections() {
        const results = {
            deepseek: false,
            neo4j: false,
            sqlite: false
        };

        try {
            // Test DeepSeek connection
            console.log('Testing DeepSeek connection...');
            results.deepseek = await this.deepseekClient.testConnection();
            console.log(`DeepSeek: ${results.deepseek ? 'Connected' : 'Failed'}`);

            // Test Neo4j connection
            console.log('Testing Neo4j connection...');
            await neo4jDriver.verifyConnectivity();
            results.neo4j = true;
            console.log('Neo4j: Connected');

            // Test SQLite connection
            console.log('Testing SQLite connection...');
            const db = await this.getSqliteConnection();
            await db.get('SELECT 1');
            await db.close();
            results.sqlite = true;
            console.log('SQLite: Connected');

        } catch (error) {
            console.error('Connection test failed:', error.message);
        }

        return results;
    }

    /**
     * Get a SQLite database connection
     */
    async getSqliteConnection() {
        const db = await open({
            filename: this.dbPath,
            driver: sqlite3.Database
        });
        return db;
    }

    /**
     * Create a production ScoutAgent
     * @param {string} repoPath - Path to the repository to scan
     */
    async createScoutAgent(repoPath) {
        const db = await this.getSqliteConnection();
        
        // Create a database connector wrapper for ScoutAgent
        const dbConnector = {
            execute: async (query, params = []) => {
                if (query.trim().toUpperCase().startsWith('SELECT')) {
                    return await db.all(query, params);
                } else {
                    return await db.run(query, params);
                }
            },
            beginTransaction: async () => {
                await db.exec('BEGIN TRANSACTION');
            },
            commit: async () => {
                await db.exec('COMMIT');
            },
            rollback: async () => {
                await db.exec('ROLLBACK');
            }
        };

        const repositoryScanner = new RepositoryScanner(repoPath);
        const changeAnalyzer = new ChangeAnalyzer();
        const queuePopulator = new QueuePopulator(dbConnector);
        
        return new ScoutAgent(repositoryScanner, changeAnalyzer, queuePopulator, dbConnector);
    }

    /**
     * Create a production WorkerAgent with DeepSeek integration
     */
    async createWorkerAgent() {
        const db = await this.getSqliteConnection();
        return new WorkerAgent(db, fs, this.deepseekClient);
    }

    /**
     * Create a production GraphIngestorAgent function
     */
    createGraphIngestorAgent() {
        return {
            processBatch: async (analysisBatch, refactoringBatch) => {
                const db = await this.getSqliteConnection();
                try {
                    await processBatch(analysisBatch, refactoringBatch, db);
                } finally {
                    await db.close();
                }
            }
        };
    }

    /**
     * Initialize the database with the schema
     */
    async initializeDatabase() {
        const db = await this.getSqliteConnection();
        try {
            const schemaPath = path.join(__dirname, 'schema.sql');
            const schema = await fs.readFile(schemaPath, 'utf8');
            await db.exec(schema);
            console.log('Database initialized with schema');
        } finally {
            await db.close();
        }
    }

    /**
     * Clean up all connections
     */
    async cleanup() {
        try {
            await neo4jDriver.close();
            console.log('Cleaned up database connections');
        } catch (error) {
            console.error('Cleanup error:', error.message);
        }
    }
}

module.exports = ProductionAgentFactory; 