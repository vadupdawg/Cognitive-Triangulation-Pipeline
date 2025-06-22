const { initialize } = require('./src/utils/initializeDb');

beforeAll(async () => {
    await initialize();
});