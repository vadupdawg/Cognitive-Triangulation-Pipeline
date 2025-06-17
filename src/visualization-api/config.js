//
// config.js
//
// Configuration settings for the visualization API
//

require('dotenv').config();

module.exports = {
  // Neo4j Database Configuration
  NEO4J_URI: process.env.NEO4J_URI || 'bolt://localhost:7687',
  NEO4J_USER: process.env.NEO4J_USER || 'neo4j',
  NEO4J_PASSWORD: process.env.NEO4J_PASSWORD || 'test1234',
  NEO4J_DATABASE: process.env.NEO4J_DATABASE || 'backend',
  
  // API Configuration
  API_PORT: process.env.API_PORT || 3001,
  
  // Database Configuration
  DB_PATH: process.env.DB_PATH || './db.sqlite',
  DB_HOST: process.env.DB_HOST || 'localhost',
  DB_PORT: process.env.DB_PORT || 5432,
  DB_NAME: process.env.DB_NAME || 'testdb',
  DB_USER: process.env.DB_USER || 'testuser',
  DB_PASSWORD: process.env.DB_PASSWORD || 'testpassword',
  
  // Redis Configuration
  REDIS_ENABLED: process.env.REDIS_ENABLED === 'true',
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
  
  // AI Service Configuration
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
  
  // Environment
  NODE_ENV: process.env.NODE_ENV || 'development'
};