module.exports = {
  globalSetup: './jest.globalSetup.js',
  setupFilesAfterEnv: ['<rootDir>/tests/jest.setup.js'],
  testTimeout: 30000,
  testMatch: [
    '<rootDir>/tests/functional/high_performance_pipeline_v2/relationshipExtractionWorker.test.js',
  ],
};