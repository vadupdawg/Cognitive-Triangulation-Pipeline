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
    testTimeout: 30000, // 30 seconds for integration tests
};