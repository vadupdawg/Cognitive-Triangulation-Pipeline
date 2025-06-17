module.exports = {
    testEnvironment: 'jsdom',
    transform: {
        '^.+\\.(js|jsx)$': ['babel-jest', {
            presets: ['@babel/preset-env', '@babel/preset-react']
        }],
    },
    testMatch: [
        '**/tests/granular/**/*.test.js',
        '**/tests/acceptance/**/*.test.js',
        '**/tests/production/**/*.test.js',
        '**/src/visualization-ui/src/**/*.test.js',
    ],
    moduleNameMapper: {
        '\\.(css|less)$': 'identity-obj-proxy',
    },
    setupFiles: ['<rootDir>/jest.polyfills.js'],
    setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
};