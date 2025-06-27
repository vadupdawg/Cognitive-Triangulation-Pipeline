module.exports = {
  globalSetup: './jest.globalSetup.js',
  setupFilesAfterEnv: ['<rootDir>/tests/jest.setup.js'],
  testTimeout: 90000,
  testMatch: [
    '<rootDir>/tests/acceptance/**/*.spec.js',
    '<rootDir>/tests/functional/**/*.test.js'
  ],
};