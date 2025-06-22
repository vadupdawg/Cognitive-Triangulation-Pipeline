const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class ScoutAgent {
    /**
     * @param {any} db - The database client instance.
     * @param {string} repoPath - The path to the repository.
     */
    constructor(db, repoPath) {
        if (!db) {
            throw new Error("A database instance is required.");
        }
        if (!repoPath) {
            throw new Error("A repository path is required.");
        }
        this.db = db;
        this.repoPath = repoPath;
    }

    /**
     * The main execution method for the agent.
     * @returns {Promise<void>}
     */
    async run() {
        console.log("ScoutAgent run started.");
        try {
            const files = await this.discoverFiles(this.repoPath);
            await this.saveFilesToDb(files);
            console.log("ScoutAgent run finished successfully.");
        } catch (error) {
            console.error("Error during ScoutAgent run:", error.message);
            throw error;
        }
    }

    /**
     * Recursively scans a directory to find all files asynchronously.
     * @param {string} directory - The directory to scan.
     * @returns {Promise<Array<Object>>} A promise that resolves to an array of file objects.
     */
    async discoverFiles(directory) {
        let allFiles = [];
        const items = await fsp.readdir(directory, { withFileTypes: true });

        for (const item of items) {
            const fullPath = path.join(directory, item.name);
            const relativePath = path.relative(this.repoPath, fullPath);

            if (item.isDirectory()) {
                if (!/(\.git|node_modules)/.test(relativePath)) {
                    const subFiles = await this.discoverFiles(fullPath);
                    allFiles = allFiles.concat(subFiles);
                }
            } else if (item.isFile()) {
                const language = this.detectLanguage(fullPath);
                if (language !== 'unknown') {
                    const content = await fsp.readFile(fullPath);
                    const checksum = this.calculateChecksum(content);
                    allFiles.push({ filePath: fullPath, language, checksum });
                }
            }
        }
        return allFiles;
    }

    /**
     * Determines the programming language of a file based on its extension.
     * @param {string} filePath - The path to the file.
     * @returns {string} The detected programming language.
     */
    detectLanguage(filePath) {
        const extension = path.extname(filePath).toLowerCase();
        switch (extension) {
            case '.js':
                return 'JavaScript';
            case '.py':
                return 'Python';
            case '.java':
                return 'Java';
            case '.sql':
                return 'SQL';
            default:
                return 'unknown';
        }
    }

    /**
     * Calculates the SHA-256 checksum of the file content.
     * @param {Buffer | string} content - The content of the file.
     * @returns {string} The SHA-256 checksum.
     */
    calculateChecksum(content) {
        return crypto.createHash('sha256').update(content).digest('hex');
    }

    /**
     * Inserts or updates file records in the `files` table.
     * @param {Array<Object>} files - An array of file objects to save.
     * @returns {Promise<void>}
     */
    async saveFilesToDb(files) {
        await this.db.run('BEGIN TRANSACTION');
        try {
            for (const file of files) {
                const existingFile = await this.db.get('SELECT id, checksum FROM files WHERE file_path = ?', file.filePath);
                if (existingFile) {
                    if (existingFile.checksum !== file.checksum) {
                        await this.db.run('UPDATE files SET checksum = ?, updated_at = CURRENT_TIMESTAMP, status = "pending" WHERE id = ?', file.checksum, existingFile.id);
                    }
                } else {
                    await this.db.run('INSERT INTO files (file_path, language, checksum, status) VALUES (?, ?, ?, ?)', file.filePath, file.language, file.checksum, 'pending');
                }
            }
            await this.db.run('COMMIT');
        } catch (error) {
            await this.db.run('ROLLBACK');
            console.error("Failed to save files to the database:", error);
            throw error;
        }
    }
}

module.exports = ScoutAgent;