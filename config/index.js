require('dotenv').config();

module.exports = {
    REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
    QUEUE_NAMES: [
        'file-analysis-queue',
        'directory-aggregation-queue',
        'directory-resolution-queue',
        'relationship-resolution-queue',
        'reconciliation-queue',
        'analysis-findings-queue',
        'global-resolution-queue',
        'relationship-validated-queue',
        'llm-analysis-queue', // Added for the new pipeline
        'graph-ingestion-queue', // Added for the new pipeline
    ],
};