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
  SQLITE_DB_PATH: process.env.SQLITE_DB_PATH,

  // Neo4j Database Configuration
  NEO4J_URI: process.env.NEO4J_URI,
  NEO4J_USER: process.env.NEO4J_USER,
  NEO4J_PASSWORD: process.env.NEO4J_PASSWORD,
  NEO4J_DATABASE: process.env.NEO4J_DATABASE || 'backend',

  // Agent-specific Configuration
  INGESTOR_BATCH_SIZE: parseInt(process.env.INGESTOR_BATCH_SIZE, 10),
  INGESTOR_INTERVAL_MS: parseInt(process.env.INGESTOR_INTERVAL_MS, 10),

  // API Configuration
  API_PORT: process.env.API_PORT,

  // Redis Configuration
  REDIS_ENABLED: process.env.REDIS_ENABLED === 'true',
  REDIS_URL: process.env.REDIS_URL,
  REDIS_PASSWORD: process.env.REDIS_PASSWORD,

  // AI Service Configuration
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,

  // Environment
  NODE_ENV: process.env.NODE_ENV
};

// Security Hardening: Check for missing essential configurations
const required_configs = [
    'SQLITE_DB_PATH',
    'NEO4J_URI',
    'NEO4J_USER',
    'NEO4J_PASSWORD',
    'DEEPSEEK_API_KEY',
    'REDIS_URL'
];

if (config.NODE_ENV === 'production') {
    required_configs.push('REDIS_PASSWORD');
}

const missing_configs = required_configs.filter(key => !config[key]);

if (missing_configs.length > 0) {
    console.error('FATAL ERROR: The following environment variables are not set:');
    missing_configs.forEach(config => console.error(`- ${config}`));
    console.error('Please set them in your .env file before starting.');
    process.exit(1);
}

module.exports = config;