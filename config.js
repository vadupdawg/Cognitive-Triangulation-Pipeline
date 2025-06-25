//
// config.js
//
// This file centralizes the configuration management for the application.
// It reads environment variables, providing default values for local development
// and ensuring that critical settings are available to all modules.
//

require('dotenv').config();

const config = {
  // SQLite Database Configuration
  SQLITE_DB_PATH: process.env.SQLITE_DB_PATH || './db.sqlite',

  // Neo4j Database Configuration
  NEO4J_URI: process.env.NEO4J_URI || 'bolt://127.0.0.1:7687',
  NEO4J_USER: process.env.NEO4J_USER || 'neo4j',
  NEO4J_PASSWORD: process.env.NEO4J_PASSWORD || 'test1234',
  NEO4J_DATABASE: process.env.NEO4J_DATABASE || 'neo4j',

  // Agent-specific Configuration
  INGESTOR_BATCH_SIZE: parseInt(process.env.INGESTOR_BATCH_SIZE, 10) || 100,
  INGESTOR_INTERVAL_MS: parseInt(process.env.INGESTOR_INTERVAL_MS, 10) || 10000,

  // API Configuration
  API_PORT: process.env.API_PORT || 3001,

  // Redis Configuration
  REDIS_ENABLED: process.env.REDIS_ENABLED === 'true',
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',

  // AI Service Configuration
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,

  // Environment
  NODE_ENV: process.env.NODE_ENV || 'development'
};

// Security Hardening: Prevent startup with default password in production
if (process.env.NODE_ENV === 'production' && config.NEO4J_PASSWORD === 'password') {
  console.error('FATAL ERROR: Default Neo4j password is being used in a production environment.');
  console.error('Set the NEO4J_PASSWORD environment variable to a secure password before starting.');
  process.exit(1);
}

module.exports = config;