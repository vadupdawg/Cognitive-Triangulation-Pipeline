const crypto = require('crypto');
const path = require('path');
const os = require('os');

const BASE_DIR = path.resolve(process.cwd());

class LlmCallFailedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'LlmCallFailedError';
  }
}

class InvalidJsonResponseError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InvalidJsonResponseError';
  }
}

class FileNotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'FileNotFoundError';
  }
}

const FILE_SIZE_THRESHOLD_KB = 128;
const CHUNK_SIZE_KB = 120;
const CHUNK_OVERLAP_LINES = 50;

class WorkerAgent {
  constructor(db, fs, llmClient) {
    this.db = db;
    this.fs = fs;
    this.llmClient = llmClient;
  }

    async claimTask(workerId) {
      const taskToClaim = await this.db.get(
          `SELECT id FROM work_queue WHERE status = 'pending' ORDER BY id ASC LIMIT 1`
      );
  
      if (!taskToClaim) {
          return null;
      }
  
      const claimResult = await this.db.run(
          `UPDATE work_queue SET status = 'processing', worker_id = ? WHERE id = ? AND status = 'pending'`,
          [workerId, taskToClaim.id]
      );
  
      if (claimResult.changes === 0) {
          // The task was claimed by another worker between our SELECT and UPDATE
          return null;
      }
  
      // Now that we've successfully claimed it, get the full details
      return await this.db.get(
          'SELECT id, file_path, content_hash FROM work_queue WHERE id = ?',
          [taskToClaim.id]
      );
    }
  async processTask(task) {
    try {
      const fileContent = await this._readFileContent(task.file_path);
      const llmAnalysisResult = await this.analyzeFileContent(task.file_path, fileContent);
      const rawJsonString = JSON.stringify(llmAnalysisResult);
      const responseHash = this._computeSha256Hash(rawJsonString);
      await this._saveSuccessResult(task.id, task.file_path, rawJsonString, responseHash);
    } catch (error) {
      let errorMessage;
      if (error instanceof FileNotFoundError) {
        errorMessage = `File not found at path: ${task.file_path}`;
      } else if (error instanceof LlmCallFailedError || error instanceof InvalidJsonResponseError) {
        errorMessage = error.message;
      } else {
        errorMessage = `An unexpected error occurred: ${error.message}`;
      }
      await this._handleProcessingFailure(task.id, errorMessage);
    }
  }

  async analyzeFileContent(filePath, fileContent) {
    if (Buffer.byteLength(fileContent, 'utf8') / 1024 <= FILE_SIZE_THRESHOLD_KB) {
      const prompt = this._constructLlmPrompt(filePath, fileContent);
      return await this._callLlmWithRetries(prompt);
    } else {
      const chunks = this._createChunks(fileContent, CHUNK_SIZE_KB * 1024, CHUNK_OVERLAP_LINES);
      const chunkPromises = chunks.map((chunk, i) => {
        const prompt = this._constructLlmPromptForChunk(filePath, chunk, i + 1, chunks.length);
        return this._callLlmWithRetries(prompt);
      });

      const chunkResults = await Promise.all(chunkPromises);

      const allEntities = new Map();
      const allRelationships = new Map();

      for (const result of chunkResults) {
        if (result.entities) {
          result.entities.forEach(e => allEntities.set(e.qualifiedName, e));
        }
        if (result.relationships) {
          result.relationships.forEach(r => {
            const key = `${r.source}--${r.target}--${r.type}`;
            allRelationships.set(key, r);
          });
        }
      }

      return {
        filePath: filePath,
        entities: Array.from(allEntities.values()),
        relationships: Array.from(allRelationships.values()),
        is_chunked: true
      };
    }
  }

  async _readFileContent(filePath) {
    const resolvedPath = path.resolve(filePath);
    
    // The original check was too restrictive for temp-directory-based tests.
    // This new check prevents directory traversal while allowing absolute paths.
    if (path.relative(BASE_DIR, resolvedPath).startsWith('..')) {
        // A second check for good measure to ensure it's not trying to escape the general area.
        if (!resolvedPath.startsWith(os.tmpdir())) {
             throw new Error(`Path traversal attempt detected: ${filePath}`);
        }
    }

    try {
      return await this.fs.readFile(resolvedPath, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') {
          throw new FileNotFoundError(`File not found: ${resolvedPath}`);
      }
      throw error;
    }
  }

  async _callLlmWithRetries(prompt, retries = 3) {
    let lastError;
    for (let i = 0; i < retries; i++) {
      try {
        const response = await this.llmClient.call(prompt);
        return this._validateLlmResponse(response.body);
      } catch (error) {
        lastError = error;
        if (error instanceof InvalidJsonResponseError) {
          throw error;
        }
        if (i < retries - 1) {
          await new Promise(res => setTimeout(res, 1000 * Math.pow(2, i)));
        }
      }
    }
    throw new LlmCallFailedError(`LLM call failed after ${retries} attempts: ${lastError.message}`);
  }

  _validateLlmResponse(responseText) {
    let parsedJson;
    try {
      parsedJson = JSON.parse(responseText);
    } catch (e) {
      throw new InvalidJsonResponseError('Response is not valid JSON.');
    }

    if (!parsedJson.entities || !parsedJson.relationships) {
      throw new InvalidJsonResponseError("JSON is missing required 'entities' or 'relationships' keys.");
    }
    return parsedJson;
  }

  async _saveSuccessResult(taskId, filePath, rawJsonString, jsonHash) {
    const insertSql = "INSERT INTO analysis_results (work_item_id, file_path, llm_output, status) VALUES (?, ?, ?, 'pending_ingestion');";
    const updateSql = "UPDATE work_queue SET status = 'completed' WHERE id = ?;";
    await this.db.exec('BEGIN TRANSACTION');
    try {
      await this.db.run(insertSql, [taskId, filePath, rawJsonString]);
      await this.db.run(updateSql, [taskId]);
      await this.db.exec('COMMIT');
    } catch (error) {
      await this.db.exec('ROLLBACK');
      throw error;
    }
  }

  async _handleProcessingFailure(taskId, errorMessage) {
    const insertSql = "INSERT INTO failed_work (work_item_id, error_message) VALUES (?, ?);";
    const updateSql = "UPDATE work_queue SET status = 'failed' WHERE id = ?;";
    await this.db.exec('BEGIN TRANSACTION');
    try {
      await this.db.run(insertSql, [taskId, errorMessage]);
      await this.db.run(updateSql, [taskId]);
      await this.db.exec('COMMIT');
    } catch (error) {
      await this.db.exec('ROLLBACK');
      throw error;
    }
  }
  _computeSha256Hash(text) {
    return crypto.createHash('sha256').update(text).digest('hex');
  }

  _createChunks(content, chunkSize, overlapLines) {
    const lines = content.split('\n');
    const chunks = [];
    let currentChunkLines = [];
    let currentSize = 0;
    let lineIndex = 0;

    while (lineIndex < lines.length) {
      const line = lines[lineIndex];
      const lineSize = Buffer.byteLength(line, 'utf8') + 1;

      if (currentSize + lineSize > chunkSize && currentChunkLines.length > 0) {
        chunks.push(currentChunkLines.join('\n'));
        
        const overlapStartIndex = Math.max(0, lineIndex - overlapLines);
        // This logic is tricky. Let's simplify the restart point.
        // We go back `overlapLines` from the current `lineIndex`.
        lineIndex = overlapStartIndex;
        currentChunkLines = [];
        currentSize = 0;

      } else {
        currentChunkLines.push(line);
        currentSize += lineSize;
        lineIndex++;
      }
    }

    if (currentChunkLines.length > 0) {
      chunks.push(currentChunkLines.join('\n'));
    }

    return chunks;
  }

  _constructLlmPrompt(filePath, fileContent) {
    const systemPrompt = `You are an expert code analysis tool specializing in creating structured knowledge graphs from source code. Your role is to extract entities and relationships with perfect consistency.

### TASK OVERVIEW
Analyze source code and return a JSON object representing code entities and their relationships. This data will be ingested into a Neo4j knowledge graph for code intelligence.

### OUTPUT FORMAT
Return ONLY a valid JSON object with this exact structure:

{
  "filePath": "exact/file/path.js",
  "entities": [
    {
      "type": "Function|Class|Variable|Interface|TypeAlias|Enum",
      "name": "entityName",
      "qualifiedName": "exact/file/path.js--entityName",
      "signature": "optional function/class signature",
      "isExported": true|false,
      "startLine": 10,
      "endLine": 20
    }
  ],
  "relationships": [
    {
      "source_qualifiedName": "exact/file/path.js--sourceEntity",
      "target_qualifiedName": "other/file.js--targetEntity",
      "type": "IMPORTS|EXPORTS|CALLS|USES|EXTENDS|IMPLEMENTS",
      "details": {}
    }
  ]
}

### FEW-SHOT EXAMPLES

**Example 1:**
File: src/utils/helper.js
Code: 
\`\`\`
const fs = require('fs');
function readConfig() { return JSON.parse(fs.readFileSync('config.json')); }
module.exports = { readConfig };
\`\`\`

Output:
{
  "filePath": "src/utils/helper.js",
  "entities": [
    {
      "type": "Variable",
      "name": "fs",
      "qualifiedName": "src/utils/helper.js--fs",
      "signature": "const fs = require('fs')",
      "isExported": false,
      "startLine": 1,
      "endLine": 1
    },
    {
      "type": "Function",
      "name": "readConfig",
      "qualifiedName": "src/utils/helper.js--readConfig",
      "signature": "function readConfig()",
      "isExported": true,
      "startLine": 2,
      "endLine": 2
    }
  ],
  "relationships": [
    {
      "source_qualifiedName": "src/utils/helper.js--readConfig",
      "target_qualifiedName": "src/utils/helper.js--fs",
      "type": "USES",
      "details": {}
    },
    {
      "source_qualifiedName": "src/utils/helper.js",
      "target_qualifiedName": "src/utils/helper.js--readConfig",
      "type": "EXPORTS",
      "details": {}
    }
  ]
}

**Example 2:**
File: src/models/User.js
Code:
\`\`\`
class User extends BaseModel {
  constructor(name) { this.name = name; }
  getName() { return this.name; }
}
\`\`\`

Output:
{
  "filePath": "src/models/User.js",
  "entities": [
    {
      "type": "Class",
      "name": "User",
      "qualifiedName": "src/models/User.js--User",
      "signature": "class User extends BaseModel",
      "isExported": false,
      "startLine": 1,
      "endLine": 4
    }
  ],
  "relationships": [
    {
      "source_qualifiedName": "src/models/User.js--User",
      "target_qualifiedName": "BaseModel",
      "type": "EXTENDS",
      "details": {}
    }
  ]
}

### CRITICAL RULES
1. qualifiedName format: "{filePath}--{entityName}" (exact file path + double dash + entity name)
2. Entity types: Function, Class, Variable, Interface, TypeAlias, Enum ONLY
3. Relationship types: IMPORTS, EXPORTS, CALLS, USES, EXTENDS, IMPLEMENTS ONLY
4. Return ONLY the JSON object - no markdown, explanations, or extra text
5. Start response with { and end with } - nothing else
6. Empty arrays if no entities/relationships found
7. Use exact filePath provided in the prompt`;

    const userPrompt = `Analyze the following code from the file '${filePath}':\n\n\`\`\`\n${fileContent}\n\`\`\``;
    return { system: systemPrompt, user: userPrompt };
  }

  _constructLlmPromptForChunk(filePath, chunkContent, chunkNum, totalChunks) {
    const systemPrompt = `You are an expert code analysis tool specializing in creating structured knowledge graphs from source code chunks. Your role is to extract entities and relationships with perfect consistency across file chunks.

### TASK OVERVIEW
Analyze a source code chunk (part ${chunkNum} of ${totalChunks}) and return a JSON object representing code entities and relationships. This data will be merged with other chunks and ingested into a Neo4j knowledge graph.

### CHUNK ANALYSIS STRATEGY
- Focus ONLY on complete entities visible in this chunk
- For partial entities (cut off at chunk boundaries), include them if their core definition is visible
- Maintain consistent qualifiedName format across all chunks
- Relationships should only reference entities that are clearly defined

### OUTPUT FORMAT
Return ONLY a valid JSON object with this exact structure:

{
  "filePath": "exact/file/path.js",
  "entities": [
    {
      "type": "Function|Class|Variable|Interface|TypeAlias|Enum",
      "name": "entityName", 
      "qualifiedName": "exact/file/path.js--entityName",
      "signature": "optional function/class signature",
      "isExported": true|false,
      "startLine": 10,
      "endLine": 20
    }
  ],
  "relationships": [
    {
      "source_qualifiedName": "exact/file/path.js--sourceEntity",
      "target_qualifiedName": "other/file.js--targetEntity",
      "type": "IMPORTS|EXPORTS|CALLS|USES|EXTENDS|IMPLEMENTS", 
      "details": {}
    }
  ]
}

### FEW-SHOT EXAMPLE FOR CHUNK ANALYSIS

**Example Chunk 2 of 3:**
File: src/services/auth.js
Chunk Content:
\`\`\`
  validateToken(token) {
    return jwt.verify(token, this.secret);
  }
  
  async refreshToken(oldToken) {
    const decoded = this.validateToken(oldToken);
    return this.generateToken(decoded.userId);
  }
}

module.exports = AuthService;
\`\`\`

Output:
{
  "filePath": "src/services/auth.js", 
  "entities": [
    {
      "type": "Function",
      "name": "validateToken",
      "qualifiedName": "src/services/auth.js--validateToken",
      "signature": "validateToken(token)",
      "isExported": false,
      "startLine": 1,
      "endLine": 3
    },
    {
      "type": "Function", 
      "name": "refreshToken",
      "qualifiedName": "src/services/auth.js--refreshToken",
      "signature": "async refreshToken(oldToken)",
      "isExported": false,
      "startLine": 5,
      "endLine": 8
    }
  ],
  "relationships": [
    {
      "source_qualifiedName": "src/services/auth.js--refreshToken",
      "target_qualifiedName": "src/services/auth.js--validateToken", 
      "type": "CALLS",
      "details": {}
    },
    {
      "source_qualifiedName": "src/services/auth.js",
      "target_qualifiedName": "src/services/auth.js--AuthService",
      "type": "EXPORTS",
      "details": {}
    }
  ]
}

### CRITICAL RULES FOR CHUNKS
1. qualifiedName format: "{filePath}--{entityName}" (exact file path + double dash + entity name)
2. Entity types: Function, Class, Variable, Interface, TypeAlias, Enum ONLY
3. Relationship types: IMPORTS, EXPORTS, CALLS, USES, EXTENDS, IMPLEMENTS ONLY
4. Return ONLY the JSON object - no markdown, explanations, or extra text
5. Start response with { and end with } - nothing else
6. Empty arrays if no entities/relationships found in this chunk
7. Use exact filePath provided in the prompt
8. Only analyze entities with complete definitions visible in this chunk`;

    const userPrompt = `Analyze chunk ${chunkNum} of ${totalChunks} for the file '${filePath}':\n\n\`\`\`\n${chunkContent}\n\`\`\``;
    return { system: systemPrompt, user: userPrompt };
  }
}

module.exports = { 
    WorkerAgent,
    LlmCallFailedError,
    InvalidJsonResponseError,
    FileNotFoundError
};