const path = require('path');
const fs = require('fs-extra');
const EntityScout = require('../../src/agents/EntityScout');
const QueueManager = require('../../src/utils/queueManager');

jest.mock('../../src/utils/queueManager');

describe('EntityScout Special File Identification', () => {
    let queueManager;
    let entityScout;
    const TEST_DIR = path.join(__dirname, 'test_special_files');

    beforeEach(() => {
        fs.ensureDirSync(TEST_DIR);
        queueManager = new QueueManager();
        entityScout = new EntityScout(queueManager, TEST_DIR);
    });

    afterEach(() => {
        fs.removeSync(TEST_DIR);
    });

    const createTestFile = (fileName, content = '') => {
        const filePath = path.join(TEST_DIR, fileName);
        fs.writeFileSync(filePath, content);
        return filePath;
    };
    
    test('SFA-INT-001: Should identify package.json as "manifest" due to high priority', async () => {
        createTestFile('package.json', '{"name": "test-project"}');
        const fileType = await entityScout._getSpecialFileType('package.json');
        expect(fileType).toBe('manifest');
    });

    test('SFA-INT-002: Should classify my_component.js with a NULL type', async () => {
        createTestFile('my_component.js');
        const fileType = await entityScout._getSpecialFileType('my_component.js');
        expect(fileType).toBeNull();
    });

    test('SFA-INT-003: Should identify server.js as "entrypoint"', async () => {
        createTestFile('server.js');
        const fileType = await entityScout._getSpecialFileType('server.js');
        expect(fileType).toBe('entrypoint');
    });

    test('SFA-INT-004: Should identify prod.config.js as "config"', async () => {
        createTestFile('prod.config.js');
        const fileType = await entityScout._getSpecialFileType('prod.config.js');
        expect(fileType).toBe('config');
    });

    test('SFA-INT-005: Should identify settings.yml as "config"', async () => {
        createTestFile('settings.yml');
        const fileType = await entityScout._getSpecialFileType('settings.yml');
        expect(fileType).toBe('config');
    });

    test('SFA-INT-006: Should identify generic data.json as "config"', async () => {
        createTestFile('data.json');
        const fileType = await entityScout._getSpecialFileType('data.json');
        expect(fileType).toBe('config');
    });

    test('SFA-INT-007: Should correctly identify special files in sub-directories', async () => {
        const subDir = path.join(TEST_DIR, 'src');
        fs.ensureDirSync(subDir);
        createTestFile('src/index.js');
        const fileType = await entityScout._getSpecialFileType('src/index.js');
        expect(fileType).toBe('entrypoint');
    });

    test('SFA-INT-008: Should handle README.md correctly', async () => {
        createTestFile('README.md');
        const fileType = await entityScout._getSpecialFileType('README.md');
        expect(fileType).toBe('documentation');
    });
});