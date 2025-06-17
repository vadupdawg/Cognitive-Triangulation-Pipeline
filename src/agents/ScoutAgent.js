// @ts-check

const crypto = require('crypto');
const path = require('path');

const EXCLUSION_PATTERNS = [
    /node_modules/,
    /\.git/,
    /dist/,
    /\.o$/,
    /\.pyc$/,
    /test/i,
    /spec/i,
    /README\.md/i,
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
     * @param {any} fileSystem - A mock or real file system object.
     */
    constructor(fileSystem) {
        this.fileSystem = fileSystem;
    }

    /**
     * Scans the repository, filters files, and returns the current state.
     * @returns {Promise<Map<string, string>>}
     */
    async scan() {
        const currentState = new Map();
        const allFiles = this.fileSystem.getAllFiles();
        const processingPromises = [];

        for (const filePath of allFiles) {
            if (EXCLUSION_PATTERNS.some(pattern => pattern.test(filePath))) {
                continue;
            }

            const promise = (async () => {
                try {
                    // Assumes the fileSystem object can provide a stream
                    const stream = this.fileSystem.createReadStream(filePath);
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

        // Identify modified files
        for (const path of previousPaths) {
            if (currentPaths.has(path)) {
                if (previousState.get(path) !== currentState.get(path)) {
                    modifiedFiles.set(path, currentState.get(path) || '');
                }
            }
        }

        const addedPaths = new Set([...currentPaths].filter(p => !previousPaths.has(p)));
        const potentiallyDeletedPaths = new Set([...previousPaths].filter(p => !currentPaths.has(p)));

        const addedFileHashes = new Map();
        for (const path of addedPaths) {
            addedFileHashes.set(currentState.get(path) || '', path);
        }

        for (const oldPath of potentiallyDeletedPaths) {
            const oldHash = previousState.get(oldPath);
            if (oldHash && addedFileHashes.has(oldHash)) {
                const newPath = addedFileHashes.get(oldHash);
                if (newPath) {
                    renamedFiles.push({ oldPath, newPath });
                    addedPaths.delete(newPath);
                    addedFileHashes.delete(oldHash);
                }
            } else {
                deletedFiles.push(oldPath);
            }
        }

        for (const path of addedPaths) {
            newFiles.set(path, currentState.get(path) || '');
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

        for (const [filePath, contentHash] of filesToProcess) {
            this.dbConnector.execute(
                'INSERT INTO work_queue (file_path, content_hash, status) VALUES (?, ?, ?)',
                [filePath, contentHash, 'pending']
            );
        }

        for (const filePath of changes.deletedFiles) {
            this.dbConnector.execute(
                'INSERT INTO refactoring_tasks (task_type, old_path, new_path) VALUES (?, ?, ?)',
                ['DELETE', filePath, null]
            );
        }

        for (const { oldPath, newPath } of changes.renamedFiles) {
            this.dbConnector.execute(
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
        this.dbConnector.execute('DELETE FROM file_state', []);
        for (const [filePath, contentHash] of state) {
            this.dbConnector.execute(
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
        const rows = this.dbConnector.execute('SELECT * FROM file_state', []);
        for (const row of rows) {
            previousState.set(row.file_path, row.content_hash);
        }
        return previousState;
    }

    /**
     * Main execution method for the agent.
     */
    async run() {
        this.dbConnector.beginTransaction();
        try {
            const previousState = await this.loadPreviousState();
            const currentState = await this.repositoryScanner.scan();
            const changes = this.changeAnalyzer.analyze(previousState, currentState);
            
            await this.queuePopulator.populate(changes);
            await this.statePersistor.persist(currentState);

            this.dbConnector.commit();
        } catch (error) {
            this.dbConnector.rollback();
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