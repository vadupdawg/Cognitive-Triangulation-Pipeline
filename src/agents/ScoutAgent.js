// @ts-check

const crypto = require('crypto');
const path = require('path');
const fs = require('fs').promises;

const EXCLUSION_PATTERNS = [
    // Standard .gitignore patterns
    /node_modules/,
    /\.git/,
    /dist/,
    /build/,
    /coverage/,
    /\.next/,
    /\.nuxt/,
    /\.cache/,
    /\.temp/,
    /\.tmp/,
    /logs/,
    /\.log$/,
    /\.env$/,
    /\.env\./,
    
    // Binary and compiled files
    /\.o$/,
    /\.pyc$/,
    /\.class$/,
    /\.jar$/,
    /\.war$/,
    /\.exe$/,
    /\.dll$/,
    /\.so$/,
    /\.dylib$/,
    
    // IDE and editor files
    /\.vscode/,
    /\.idea/,
    /\.vs/,
    /\.DS_Store$/,
    /Thumbs\.db$/,
    
    // Package manager files
    /package-lock\.json$/,
    /yarn\.lock$/,
    /composer\.lock$/,
    /Pipfile\.lock$/,
    
    // Documentation and README files
    /README\.md$/i,
    /CHANGELOG\.md$/i,
    /LICENSE$/i,
    /\.md$/i,
    
    // Test files and directories (comprehensive test exclusion)
    // Any file with "test" in the name
    /test/i,
    /spec/i,
    /\.test\./i,
    /\.spec\./i,
    /test_/i,
    /_test/i,
    /tests\//i,
    /test\//i,
    /spec\//i,
    /specs\//i,
    /__tests__\//i,
    /\.tests\//i,
    /\.test\//i,
    /\.spec\//i,
    /\.specs\//i,
    
    // Exclude any path that contains test-related folder names
    /\/test\//i,
    /\/tests\//i,
    /\/spec\//i,
    /\/specs\//i,
    /\/__tests__\//i,
    /\/\.test\//i,
    /\/\.tests\//i,
    /\/\.spec\//i,
    /\/\.specs\//i,
];

/**
 * Calculates the SHA-256 hash of a file's content using streams.
 * @param {import('fs').ReadStream} stream - A readable stream of the file content.
 * @returns {Promise<string>} A promise that resolves with the hex-encoded hash.
 */
function calculateHash(stream) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        stream.on('data', (chunk) => hash.update(chunk));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', (err) => reject(err));
    });
}

class RepositoryScanner {
    /**
     * @param {string} repoPath - The absolute path to the repository.
     */
    constructor(repoPath) {
        this.repoPath = repoPath;
    }

    /**
     * Recursively gets all file paths from the repository, returning relative paths.
     * Excludes directories that match exclusion patterns early for efficiency.
     * @param {string} dir - The directory to scan.
     * @returns {Promise<string[]>} A list of relative file paths.
     */
    async getAllFiles(dir = this.repoPath) {
        const dirents = await fs.readdir(dir, { withFileTypes: true });
        const files = await Promise.all(dirents.map(async (dirent) => {
            const res = path.resolve(dir, dirent.name);
            const relativePath = path.relative(this.repoPath, res);
            
            // Check if this directory/file should be excluded
            if (EXCLUSION_PATTERNS.some(pattern => pattern.test(relativePath))) {
                return []; // Skip this entire directory/file
            }
            
            if (dirent.isDirectory()) {
                // Additional check for test directories by name
                const dirName = dirent.name.toLowerCase();
                if (dirName.includes('test') || dirName.includes('spec') || dirName === '__tests__') {
                    return []; // Skip entire test directories
                }
                return this.getAllFiles(res);
            } else {
                return relativePath;
            }
        }));
        return Array.prototype.concat(...files).flat().filter(f => f !== '');
    }

    /**
     * Scans the repository, filters files, and returns the current state.
     * @returns {Promise<Map<string, string>>}
     */
    async scan() {
        const currentState = new Map();
        const allFiles = await this.getAllFiles();
        const processingPromises = [];

        for (const filePath of allFiles) {
            if (EXCLUSION_PATTERNS.some(pattern => pattern.test(filePath))) {
                continue;
            }

            const promise = (async () => {
                try {
                    const fullPath = path.join(this.repoPath, filePath);
                    const stream = require('fs').createReadStream(fullPath);
                    const hash = await calculateHash(stream);
                    currentState.set(filePath, hash);
                } catch (error) {
                    console.error(`Skipping unreadable file: ${filePath}`, error);
                }
            })();
            processingPromises.push(promise);
        }
        
        await Promise.all(processingPromises);
        return currentState;
    }
}

class ChangeAnalyzer {
    /**
     * Analyzes the difference between the previous and current state.
     * @param {Map<string, string>} previousState
     * @param {Map<string, string>} currentState
     * @returns {{newFiles: Map<string, string>, modifiedFiles: Map<string, string>, deletedFiles: string[], renamedFiles: {oldPath: string, newPath: string}[]}}
     */
    analyze(previousState, currentState) {
        const newFiles = new Map();
        const modifiedFiles = new Map();
        const deletedFiles = [];
        const renamedFiles = [];

        const previousPaths = new Set(previousState.keys());
        const currentPaths = new Set(currentState.keys());
        const previousHashes = new Map();
        previousState.forEach((hash, path) => previousHashes.set(hash, path));

        // Identify new and modified files
        for (const [path, hash] of currentState.entries()) {
            if (!previousPaths.has(path)) {
                // If the hash exists in the previous state under a different path, it's a rename.
                if (previousHashes.has(hash)) {
                    const oldPath = previousHashes.get(hash);
                    // To be a rename, the old path must no longer exist in the current state.
                    if (oldPath && !currentPaths.has(oldPath)) {
                         renamedFiles.push({ oldPath, newPath: path });
                         // Remove from previousHashes to prevent multiple renames for the same hash
                         previousHashes.delete(hash);
                    } else {
                        newFiles.set(path, hash);
                    }
                } else {
                    newFiles.set(path, hash);
                }
            } else if (previousState.get(path) !== hash) {
                modifiedFiles.set(path, hash);
            }
        }

        // Identify deleted files
        const renamedOldPaths = new Set(renamedFiles.map(r => r.oldPath));
        for (const path of previousPaths) {
            if (!currentPaths.has(path) && !renamedOldPaths.has(path)) {
                deletedFiles.push(path);
            }
        }

        return { newFiles, modifiedFiles, deletedFiles, renamedFiles };
    }
}

class QueuePopulator {
    /**
     * @param {any} dbConnector
     */
    constructor(dbConnector) {
        this.dbConnector = dbConnector;
    }

    /**
     * Populates the database queues with detected changes.
     * @param {ReturnType<ChangeAnalyzer['analyze']>} changes
     */
    async populate(changes) {
        const filesToProcess = new Map([...changes.newFiles, ...changes.modifiedFiles]);

        // Process work queue items sequentially to avoid database locking issues
        for (const [filePath, contentHash] of filesToProcess) {
            await this.dbConnector.execute(
                'INSERT INTO work_queue (file_path, content_hash, status) VALUES (?, ?, ?)',
                [filePath, contentHash, 'pending']
            );
        }

        // Process refactoring tasks sequentially
        for (const filePath of changes.deletedFiles) {
            await this.dbConnector.execute(
                'INSERT INTO refactoring_tasks (task_type, old_path, new_path) VALUES (?, ?, ?)',
                ['DELETE', filePath, null]
            );
        }

        for (const { oldPath, newPath } of changes.renamedFiles) {
            await this.dbConnector.execute(
                'INSERT INTO refactoring_tasks (task_type, old_path, new_path) VALUES (?, ?, ?)',
                ['RENAME', oldPath, newPath]
            );
        }
    }
}

class StatePersistor {
    /**
     * @param {any} dbConnector
     */
    constructor(dbConnector) {
        this.dbConnector = dbConnector;
    }

    /**
     * Persists the current repository state to the database.
     * @param {Map<string, string>} state
     */
    async persist(state) {
        await this.dbConnector.execute('DELETE FROM file_state', []);
        // Process state persistence sequentially to avoid database locking issues
        for (const [filePath, contentHash] of state) {
            await this.dbConnector.execute(
                'INSERT INTO file_state (file_path, content_hash) VALUES (?, ?)',
                [filePath, contentHash]
            );
        }
    }
}

class ScoutAgent {
    /**
     * @param {RepositoryScanner} repositoryScanner
     * @param {ChangeAnalyzer} changeAnalyzer
     * @param {QueuePopulator} queuePopulator
     * @param {any} dbConnector
     */
    constructor(repositoryScanner, changeAnalyzer, queuePopulator, dbConnector) {
        this.repositoryScanner = repositoryScanner;
        this.changeAnalyzer = changeAnalyzer;
        this.queuePopulator = queuePopulator;
        this.dbConnector = dbConnector;
        this.statePersistor = new StatePersistor(dbConnector);
    }

    /**
     * Loads the previous state from the database.
     * @returns {Promise<Map<string, string>>}
     */
    async loadPreviousState() {
        const previousState = new Map();
        const rows = await this.dbConnector.execute('SELECT * FROM file_state', []);
        for (const row of rows) {
            previousState.set(row.file_path, row.content_hash);
        }
        return previousState;
    }

    /**
     * Main execution method for the agent.
     */
    async run() {
        await this.dbConnector.beginTransaction();
        try {
            const previousState = await this.loadPreviousState();
            const currentState = await this.repositoryScanner.scan();
            const changes = this.changeAnalyzer.analyze(previousState, currentState);
            
            await this.queuePopulator.populate(changes);
            await this.statePersistor.persist(currentState);

            await this.dbConnector.commit();
        } catch (error) {
            await this.dbConnector.rollback();
            throw error;
        }
    }
}

module.exports = {
    RepositoryScanner,
    ChangeAnalyzer,
    QueuePopulator,
    StatePersistor,
    ScoutAgent,
};