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
        console.log(`ScoutAgent scanning directory: ${this.repoPath}`);
        try {
            const files = await this.discoverFiles(this.repoPath);
            console.log(`ScoutAgent discovered ${files.length} files:`);
            files.forEach(file => {
                console.log(`  - ${file.filePath} (${file.language})`);
            });
            
            // Generate project context (file tree manifest)
            console.log("ScoutAgent generating project context...");
            const projectContext = await this.generateFileTree();
            console.log(`ScoutAgent generated project context with ${projectContext.split('\n').length} lines`);
            
            await this.saveFilesToDb(files, projectContext);
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
                if (item.name.toLowerCase() === 'readme.md') {
                    continue;
                }
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
     * Generates a file tree manifest of the entire project for cross-file analysis context.
     * @returns {Promise<string>} A string representation of the project file tree.
     */
    async generateFileTree() {
        const fileTree = [];
        
        const buildTree = async (directory, prefix = '') => {
            try {
                const items = await fsp.readdir(directory, { withFileTypes: true });
                
                for (const item of items) {
                    const fullPath = path.join(directory, item.name);
                    const relativePath = path.relative(this.repoPath, fullPath);
                    
                    if (item.isDirectory()) {
                        // Skip common directories that don't contain source code
                        if (!/(\.git|node_modules|\.vscode|\.idea)/.test(relativePath)) {
                            fileTree.push(`${prefix}📁 ${relativePath}/`);
                            await buildTree(fullPath, prefix + '  ');
                        }
                    } else if (item.isFile()) {
                        const language = this.detectLanguage(fullPath);
                        if (language !== 'unknown') {
                            fileTree.push(`${prefix}📄 ${relativePath} (${language})`);
                        }
                    }
                }
            } catch (error) {
                console.warn(`Warning: Could not read directory ${directory}: ${error.message}`);
            }
        };
        
        await buildTree(this.repoPath);
        return fileTree.join('\n');
    }

    /**
     * Inserts or updates file records in the `files` table.
     * @param {Array<Object>} files - An array of file objects to save.
     * @param {string} projectContext - The project context (file tree manifest) to include with each work item.
     * @returns {Promise<void>}
     */
    async saveFilesToDb(files, projectContext) {
        console.log(`ScoutAgent saving ${files.length} files to database...`);
        await this.db.run('BEGIN TRANSACTION');
        try {
            let newFiles = 0;
            let updatedFiles = 0;
            let skippedFiles = 0;
            
            for (const file of files) {
                let fileId;
                const existingFile = await this.db.get('SELECT id, checksum FROM files WHERE file_path = ?', file.filePath);
                if (existingFile) {
                    fileId = existingFile.id;
                    if (existingFile.checksum !== file.checksum) {
                        console.log(`  Updating existing file: ${file.filePath} (checksum changed)`);
                        await this.db.run('UPDATE files SET checksum = ?, updated_at = CURRENT_TIMESTAMP, status = "pending" WHERE id = ?', file.checksum, fileId);
                        await this.db.run('INSERT INTO work_queue (file_id, file_path, content_hash, status, project_context) VALUES (?, ?, ?, ?, ?)', fileId, file.filePath, file.checksum, 'pending', projectContext);
                        updatedFiles++;
                    } else {
                        console.log(`  Skipping existing file (unchanged): ${file.filePath}`);
                        skippedFiles++;
                    }
                } else {
                    console.log(`  Adding new file: ${file.filePath}`);
                    const result = await this.db.run('INSERT INTO files (file_path, language, checksum, status) VALUES (?, ?, ?, ?)', file.filePath, file.language, file.checksum, 'pending');
                    fileId = result.lastID;
                    await this.db.run('INSERT INTO work_queue (file_id, file_path, content_hash, status, project_context) VALUES (?, ?, ?, ?, ?)', fileId, file.filePath, file.checksum, 'pending', projectContext);
                    newFiles++;
                }
            }
            await this.db.run('COMMIT');
            console.log(`ScoutAgent database save completed: ${newFiles} new, ${updatedFiles} updated, ${skippedFiles} skipped`);
            
            // Verify work_queue has items
            const workQueueCount = await this.db.get('SELECT COUNT(*) as count FROM work_queue WHERE status = "pending"');
            console.log(`Work queue now has ${workQueueCount.count} pending items`);
        } catch (error) {
            await this.db.run('ROLLBACK');
            console.error("Failed to save files to the database:", error);
            throw error;
        }
    }
}

module.exports = ScoutAgent;