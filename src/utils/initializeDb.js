import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const require = createRequire(import.meta.url);
const { DatabaseManager } = require('./sqliteDb.js');
const logger = require('./logger.js');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function initializeDatabase() {
  try {
    logger.info('Initializing database...');
    
    const dbPath = process.env.SQLITE_DB_PATH || './database.db';
    const dbManager = new DatabaseManager(dbPath);
    
    // Initialize the database with schema
    dbManager.initializeDb();
    
    logger.info('Database initialized successfully');
    
    // Verify tables were created
    const db = dbManager.getDb();
    const tables = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' 
      ORDER BY name
    `).all();
    
    logger.info('Created tables:', tables.map(t => t.name));
    
    dbManager.close();
  } catch (error) {
    logger.error('Failed to initialize database:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  initializeDatabase();
}

export default initializeDatabase;