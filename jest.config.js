module.exports = {
    testEnvironment: 'node',
    testMatch: [
        '**/tests/granular/**/*.test.js',
        '**/tests/acceptance/**/*.test.js',
        '**/tests/unit/**/*.test.js',
        '**/tests/integration/**/*.test.js',
        '**/tests/functional/**/*.test.js',
    ],
    globalSetup: './jest.globalSetup.js',
    globalTeardown: './jest.globalTeardown.js',
    testTimeout: 600000, // 10 minutes timeout for long-running tests
};