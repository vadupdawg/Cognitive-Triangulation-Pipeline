const fs = require('fs').promises;
const path = require('path');

const EntityScout = require('../agents/EntityScout');
const GraphBuilder = require('../agents/GraphBuilder');
const RelationshipResolver = require('../agents/RelationshipResolver');

const DeepSeekClient = require('./deepseekClient');
const neo4jDriver = require('./neo4jDriver');
const sqliteDb = require('./sqliteDb');

/**
 * Production Agent Factory
 * Creates production-ready agents with cognitive triangulation architecture
 */
class ProductionAgentFactory {
    constructor() {
        this.deepseekClient = new DeepSeekClient();
    }

    /**
     * Creates an EntityScout agent with production configuration
     */
    async createEntityScout(targetDirectory) {
        const db = await sqliteDb.getDb();
        const llmClient = this.deepseekClient;
        return new EntityScout(db, llmClient, targetDirectory);
    }

    /**
     * Creates a GraphBuilder agent with production configuration
     */
    async createGraphBuilder() {
        const db = await sqliteDb.getDb();
        const driver = neo4jDriver.getNeo4jDriver();
        return new GraphBuilder(db, driver);
    }

    /**
     * Creates a RelationshipResolver agent with production configuration
     */
    async createRelationshipResolver() {
        const db = await sqliteDb.getDb();
        const llmClient = this.deepseekClient;
        return new RelationshipResolver(db, llmClient);
    }

    /**
     * Tests database and API connections
     */
    async testConnections() {
        const results = {
            deepseek: false,
            neo4j: false,
            sqlite: false
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

        return results;
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
     * Clears all SQLite database tables for a fresh start
     */
    async clearSqliteDatabase() {
        try {
            console.log('Clearing SQLite database tables...');
            
            // Get database connection
            const db = await sqliteDb.getDb();
            
            // Clear entity reports and files tables
            await db.run('DELETE FROM entity_reports');
            await db.run('DELETE FROM files');
            
            // Reset auto-increment counters
            await db.run('DELETE FROM sqlite_sequence WHERE name IN ("files", "entity_reports")');
            
            console.log('SQLite database cleared successfully');
        } catch (error) {
            console.error('Error clearing SQLite database:', error.message);
            throw error;
        }
    }

    /**
     * Clears all Neo4j database nodes and relationships for a fresh start
     */
    async clearNeo4jDatabase() {
        let session;
        try {
            console.log('Clearing Neo4j database...');
            session = neo4jDriver.session();
            await session.run('MATCH (n) DETACH DELETE n');
            console.log('Neo4j database cleared successfully');
        } catch (error) {
            console.error('Error clearing Neo4j database:', error.message);
            throw error;
        } finally {
            if (session) {
                await session.close();
            }
        }
    }

    /**
     * Get SQLite database connection
     */
    async getSqliteConnection() {
        return await sqliteDb.getDb();
    }

    /**
     * Cleanup resources
     */
    async cleanup() {
        try {
            // Close Neo4j driver if needed
            const driver = neo4jDriver.getNeo4jDriver();
            if (driver) {
                await driver.close();
            }
            console.log('Cleanup completed successfully');
        } catch (error) {
            console.error('Error during cleanup:', error.message);
        }
    }
}

module.exports = ProductionAgentFactory; 