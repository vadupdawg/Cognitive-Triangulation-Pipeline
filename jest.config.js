module.exports = {
    testEnvironment: 'node',
    testMatch: [
        '**/tests/granular/**/*.test.js',
        '**/tests/acceptance/**/*.test.js',
        '**/tests/unit/**/*.test.js',
        '**/tests/integration/**/*.test.js',
    ],
    setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
    globalSetup: '<rootDir>/jest.globalSetup.js',
    globalTeardown: '<rootDir>/jest.globalTeardown.js',
    testTimeout: 30000, // 30 seconds for integration tests
};