const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const EntityScout = require('../../src/agents/EntityScout');

const TEST_DIR = path.join(__dirname, '..', 'temp-test-files');
const DB_PATH = path.join(TEST_DIR, 'test-db.sqlite');
const CONFIG_PATH = path.join(TEST_DIR, 'config');
const SPECIAL_FILES_CONFIG_PATH = path.join(CONFIG_PATH, 'special_files.json');

const SPECIAL_FILES_CONFIG = {
  patterns: [
    { type: 'manifest', pattern: '^package\\.json$' },
    { type: 'manifest', pattern: '^requirements\\.txt$' },
    { type: 'entrypoint', pattern: '^(server|main|index|app)\\.js$' },
    { type: 'config', pattern: '\\.config\\.js$' },
    { type: 'config', pattern: '\\.ya?ml$' },
    { type: 'config', pattern: '\\.json$' },
  ],
};

const TEST_FILES = {
  'package.json': '',
  'server.js': '',
  'prod.config.js': '',
  'settings.yml': '',
  'data.json': '',
  'my_component.js': '',
  'README.md': '',
  'sub-folder': {
    'nested.config.js': '',
    'another.json': '',
  },
};

function createTestFiles(baseDir, files) {
  for (const [name, content] of Object.entries(files)) {
    const fullPath = path.join(baseDir, name);
    if (typeof content === 'object') {
      fs.mkdirSync(fullPath, { recursive: true });
      createTestFiles(fullPath, content);
    } else {
      fs.writeFileSync(fullPath, content);
    }
  }
}

describe('EntityScout Special File Identification', () => {
  let db;

  beforeAll(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TEST_DIR, { recursive: true });
    fs.mkdirSync(CONFIG_PATH, { recursive: true });

    fs.writeFileSync(SPECIAL_FILES_CONFIG_PATH, JSON.stringify(SPECIAL_FILES_CONFIG, null, 2));
    createTestFiles(TEST_DIR, TEST_FILES);
  });

  beforeEach(() => {
    db = new Database(DB_PATH);
    db.exec(`
      CREATE TABLE IF NOT EXISTS files (
        id TEXT PRIMARY KEY,
        file_path TEXT UNIQUE,
        checksum TEXT,
        language TEXT,
        special_file_type TEXT,
        status TEXT DEFAULT 'pending',
        last_processed TIMESTAMP
      );
    `);
    db.exec('DELETE FROM files');
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(DB_PATH)) {
        fs.unlinkSync(DB_PATH);
    }
  });

  afterAll(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  const getSpecialFileType = (filePath) => {
    const result = db.prepare('SELECT special_file_type FROM files WHERE file_path LIKE ?').get(`%${filePath}`);
    return result ? result.special_file_type : null;
  };

  test('SFA-INT-001: Should identify package.json as "manifest" due to high priority', async () => {
    const scout = new EntityScout(db, null, TEST_DIR, { configPath: CONFIG_PATH });
    await scout.run();
    expect(getSpecialFileType('package.json')).toBe('manifest');
  });

  test('SFA-INT-002: Should classify my_component.js with a NULL type', async () => {
    const scout = new EntityScout(db, null, TEST_DIR, { configPath: CONFIG_PATH });
    await scout.run();
    expect(getSpecialFileType('my_component.js')).toBeNull();
  });

  test('SFA-INT-003: Should identify server.js as "entrypoint"', async () => {
    const scout = new EntityScout(db, null, TEST_DIR, { configPath: CONFIG_PATH });
    await scout.run();
    expect(getSpecialFileType('server.js')).toBe('entrypoint');
  });

  test('SFA-INT-004: Should identify prod.config.js as "config"', async () => {
    const scout = new EntityScout(db, null, TEST_DIR, { configPath: CONFIG_PATH });
    await scout.run();
    expect(getSpecialFileType('prod.config.js')).toBe('config');
  });

  test('SFA-INT-005: Should identify settings.yml as "config"', async () => {
    const scout = new EntityScout(db, null, TEST_DIR, { configPath: CONFIG_PATH });
    await scout.run();
    expect(getSpecialFileType('settings.yml')).toBe('config');
  });

  test('SFA-INT-006: Should identify generic data.json as "config"', async () => {
    const scout = new EntityScout(db, null, TEST_DIR, { configPath: CONFIG_PATH });
    await scout.run();
    expect(getSpecialFileType('data.json')).toBe('config');
  });

  test('SFA-INT-007: Should correctly identify special files in sub-directories', async () => {
    const scout = new EntityScout(db, null, TEST_DIR, { configPath: CONFIG_PATH });
    await scout.run();
    expect(getSpecialFileType('nested.config.js')).toBe('config');
    expect(getSpecialFileType('another.json')).toBe('config');
  });

  test('SFA-INT-008: Should handle README.md correctly', async () => {
    const scout = new EntityScout(db, null, TEST_DIR, { configPath: CONFIG_PATH });
    await scout.run();
    expect(getSpecialFileType('README.md')).toBeNull();
  });
});