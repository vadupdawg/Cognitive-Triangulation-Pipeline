const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { getDeepseekClient } = require('../utils/deepseekClient');
const { getDb } = require('../utils/sqliteDb');

class RelationshipResolver {
    constructor(db, apiKey) {
        this.db = db;
        this.apiKey = apiKey;
        this.llmClient = getDeepseekClient();
    }

    async _getDirectories() {
        const rows = this.db.prepare(`
            SELECT DISTINCT f.path
            FROM files f
            JOIN pois p ON f.id = p.file_id
        `).all();

        const dirs = new Set(rows.map(r => path.dirname(r.path)));
        return Array.from(dirs);
    }

    async _loadPoisForDirectory(directory) {
        // This query is illustrative. You might need to adjust it based on your exact schema and needs.
        // It assumes that paths are stored in a way that allows for efficient directory-based filtering.
        // For example, using LIKE with a wildcard. Ensure your 'files.path' column is indexed.
        const pois = this.db.prepare(`
            SELECT p.*, f.path as path
            FROM pois p
            JOIN files f ON p.file_id = f.id
            WHERE f.path LIKE ?
        `).all(`${directory}${path.sep}%`);
        return pois;
    }

    async _runIntraFilePass(poisInFile) {
        if (poisInFile.length < 2) {
            return [];
        }

        const context = poisInFile.map(p => `ID: ${p.id}, Type: ${p.type}, Name: ${p.name}, Content: ${p.description}`).join('\n');
        const prompt = `Analyze the following points of interest (POIs) from a single file and identify any relationships between them. Context:\n${context}\n\nRespond with a JSON object containing a 'relationships' array.`;

        const response = await this._queryLlmWithRetry(prompt);
        return response.relationships || [];
    }

    async _runIntraDirectoryPass(directory, poisByFile) {
        const allPoisInDir = Array.from(poisByFile.values()).flat();
        const exports = allPoisInDir.filter(p => p.is_exported);

        const context = `Directory: ${directory}\n\n` +
            Array.from(poisByFile.entries())
                .map(([filePath, pois]) => `File: ${filePath}\nPOIs:\n${pois.map(p => `  ID: ${p.id}, Type: ${p.type}, Name: ${p.name}, Content: "${p.description}"`).join('\n')}`)
                .join('\n\n');

        const prompt = `Analyze the following POIs from the directory "${directory}" and identify relationships between them. Focus on imports and calls between files.\n\n${context}\n\nRespond with a JSON object containing a 'relationships' array.`;

        const response = await this._queryLlmWithRetry(prompt);
        
        return {
            relationships: response.relationships || [],
            exports: exports
        };
    }

    async _runGlobalPass() {
        const allExports = this.db.prepare(`
            SELECT p.*, f.path as path
            FROM pois p
            JOIN files f ON p.file_id = f.id
            WHERE p.is_exported = 1
        `).all();

        if (allExports.length < 2) {
            return [];
        }

        const exportsByDir = new Map();
        for (const poi of allExports) {
            const dir = path.dirname(poi.path);
            if (!exportsByDir.has(dir)) {
                exportsByDir.set(dir, []);
            }
            exportsByDir.get(dir).push(poi);
        }

        const context = 'Analyze the following exported POIs from all directories and identify any global relationships (e.g., a route in one directory using a service from another).\n\n' +
            Array.from(exportsByDir.entries())
                .map(([dir, exports]) => `Directory: ${dir}\nExports:\n${exports.map(p => `  ID: ${p.id}, Type: ${p.type}, Name: ${p.name}, Content: "${p.description}"`).join('\n')}`)
                .join('\n\n');

        const prompt = `${context}\n\nRespond with a JSON object containing a 'relationships' array.`;

        const response = await this._queryLlmWithRetry(prompt);
        return response.relationships || [];
    }
    
    async run() {
        console.log('Starting relationship resolution...');
        const directories = await this._getDirectories();
        let totalRelationshipsFound = 0;
        const pass1Results = { relationshipsFound: 0 };
        const pass2Results = { relationshipsFound: 0 };

        for (const dir of directories) {
            console.log(`Processing directory: ${dir}`);
            const poisInDir = await this._loadPoisForDirectory(dir);

            // Pass 1: Intra-file analysis for the current directory
            const poisByFile = new Map();
            for (const poi of poisInDir) {
                if (!poisByFile.has(poi.file_id)) {
                    poisByFile.set(poi.file_id, []);
                }
                poisByFile.get(poi.file_id).push(poi);
            }
            for (const poisInFile of poisByFile.values()) {
                const relationships = await this._runIntraFilePass(poisInFile);
                if (relationships.length > 0) {
                    this.persistRelationships(relationships);
                    pass1Results.relationshipsFound += relationships.length;
                }
            }

            // Pass 2: Intra-directory analysis for the current directory
            const poisByFilePath = new Map();
             for (const poi of poisInDir) {
                if (!poisByFilePath.has(poi.path)) {
                    poisByFilePath.set(poi.path, []);
                }
                poisByFilePath.get(poi.path).push(poi);
            }
            const { relationships } = await this._runIntraDirectoryPass(dir, poisByFilePath);
            if (relationships.length > 0) {
                this.persistRelationships(relationships);
                pass2Results.relationshipsFound += relationships.length;
            }
        }
        
        totalRelationshipsFound += pass1Results.relationshipsFound + pass2Results.relationshipsFound;

        // Pass 3: Global pass
        console.log('Running global relationship pass...');
        const pass3Results = { relationshipsFound: 0 };
        const globalRelationships = await this._runGlobalPass();
        if (globalRelationships.length > 0) {
            this.persistRelationships(globalRelationships);
            pass3Results.relationshipsFound = globalRelationships.length;
        }
        totalRelationshipsFound += pass3Results.relationshipsFound;

        const summary = {
            totalRelationshipsFound,
            pass1: pass1Results,
            pass2: pass2Results,
            pass3: pass3Results,
        };
        console.log('Relationship resolution finished.', summary);
        return summary;
    }

    async _queryLlmWithRetry(prompt, schema = { type: 'object' }, retries = 3) {
        let lastError = null;
        for (let i = 0; i < retries; i++) {
            try {
                const response = await this.llmClient.createChatCompletion({
                    model: 'deepseek-chat',
                    messages: [
                        { 
                            role: 'system', 
                            content: 'You are a code analysis expert. Analyze the provided code and identify relationships between components. Always respond with valid JSON in the format: {"relationships": [{"source_poi_id": "id1", "target_poi_id": "id2", "type": "CALLS|IMPORTS|EXTENDS|IMPLEMENTS", "reason": "explanation"}]}'
                        },
                        { role: 'user', content: prompt }
                    ],
                    response_format: { type: 'json_object' },
                });
                const content = JSON.parse(response.choices[0].message.content);
                // Basic validation
                if (content && typeof content === 'object' && Array.isArray(content.relationships)) {
                    return content;
                }
                throw new Error('Invalid JSON structure in LLM response');
            } catch (error) {
                lastError = error;
                console.warn(`LLM query attempt ${i + 1} failed. Retrying...`, error.message);
            }
        }
        console.error('LLM query failed after all retries.', lastError);
        return { relationships: [] }; // Return empty on failure
    }

    persistRelationships(relationships) {
        const insert = this.db.prepare('INSERT INTO relationships (id, source_poi_id, target_poi_id, type, reason) VALUES (?, ?, ?, ?, ?)');
        this.db.transaction((rels) => {
            for (const rel of rels) {
                insert.run(uuidv4(), rel.source_poi_id, rel.target_poi_id, rel.type, rel.reason);
            }
        })(relationships);
    }
}

module.exports = RelationshipResolver;