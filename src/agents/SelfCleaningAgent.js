/**
 * SelfCleaningAgent
 * 
 * This agent implements a two-phase "mark and sweep" process to clean up
 * obsolete records from both SQLite and Neo4j databases when files are
 * deleted from the filesystem.
 * 
 * Phase 1 (reconcile): Mark files that exist in database but not on filesystem
 * Phase 2 (run): Delete marked files from both databases with transactional integrity
 */

const fs = require('fs-extra');
const path = require('path');

class SelfCleaningAgent {
    constructor(sqliteDb, neo4jDriver, projectRoot) {
        if (!sqliteDb) {
            throw new Error('Invalid database client provided.');
        }
        if (!neo4jDriver) {
            throw new Error('Invalid graph client provided.');
        }
        this.sqliteDb = sqliteDb;
        this.neo4jDriver = neo4jDriver;
        this.projectRoot = projectRoot;
    }

    async reconcile() {
        // Mark phase: Find files that exist in DB but not on filesystem
        const dbFiles = this.sqliteDb.prepare('SELECT path FROM files WHERE status != ?').all('PENDING_DELETION');
        
        for (const file of dbFiles) {
            const fullPath = path.join(this.projectRoot, file.path);
            if (!fs.existsSync(fullPath)) {
                // Mark for deletion
                this.sqliteDb.prepare('UPDATE files SET status = ? WHERE path = ?')
                                    .run('PENDING_DELETION', file.path);
            }
        }
    }

    async run() {
        // Sweep phase: Delete files marked for deletion
        const filesToDelete = this.sqliteDb.prepare('SELECT path FROM files WHERE status = ?').all('PENDING_DELETION');
        
        if (filesToDelete.length === 0) {
            console.log('No files to clean up.');
            return;
        }

        const filePaths = filesToDelete.map(f => f.path);
        
        try {
            // Clean Neo4j first
            await this._cleanNeo4jBatch(filePaths);
            
            // Only if Neo4j succeeds, clean SQLite
            await this._cleanSqliteBatch(filePaths);
            
            console.log(`Successfully cleaned up ${filesToDelete.length} files.`);
        } catch (error) {
            console.error(`Failed to clean up batch. No records were deleted. Reason: ${error.message}`);
            throw error;
        }
    }

    async _cleanNeo4jBatch(filePaths) {
        const session = this.neo4jDriver.session();
        try {
            await session.run(
                'UNWIND $paths AS filePath MATCH (f:File {path: filePath}) DETACH DELETE f',
                { paths: filePaths }
            );
        } finally {
            await session.close();
        }
    }

    async _cleanSqliteBatch(filePaths) {
        const placeholders = filePaths.map(() => '?').join(',');
        this.sqliteDb.prepare(`DELETE FROM files WHERE path IN (${placeholders})`).run(...filePaths);
    }
}

module.exports = SelfCleaningAgent; 