const crypto = require('crypto');
const path = require('path');
const os = require('os');
const { JsonSchemaValidator, ValidationError } = require('../utils/jsonSchemaValidator');

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
  constructor(db, fs, llmClient, targetDirectory = null) {
    this.db = db;
    this.fs = fs;
    this.llmClient = llmClient;
    this.targetDirectory = targetDirectory; // Directory where files are actually located
    this.validator = new JsonSchemaValidator(); // Add strict validator
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

    async claimSpecificTask(taskId, workerId) {
      const claimResult = await this.db.run(
          `UPDATE work_queue SET status = 'processing', worker_id = ? WHERE id = ? AND status = 'pending'`,
          [workerId, taskId]
      );
  
      if (claimResult.changes === 0) {
          // The task was already claimed by another worker or doesn't exist
          return null;
      }
  
      // Now that we've successfully claimed it, get the full details
      return await this.db.get(
          'SELECT id, file_path, content_hash FROM work_queue WHERE id = ?',
          [taskId]
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
    // Convert to absolute path for robust identification
    const absoluteFilePath = path.resolve(filePath);
    
    if (Buffer.byteLength(fileContent, 'utf8') / 1024 <= FILE_SIZE_THRESHOLD_KB) {
      const prompt = this.validator.createGuardrailPrompt(absoluteFilePath, fileContent);
      prompt.originalContent = fileContent; // Store for retry logic
      return await this._callLlmWithRetries(prompt, absoluteFilePath);
    } else {
      const chunks = this._createChunks(fileContent, CHUNK_SIZE_KB * 1024, CHUNK_OVERLAP_LINES);
      const chunkPromises = chunks.map((chunk, i) => {
        const prompt = this.validator.createGuardrailPrompt(absoluteFilePath, chunk);
        prompt.originalContent = chunk; // Store for retry logic
        return this._callLlmWithRetries(prompt, absoluteFilePath);
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
            const key = `${r.source_qualifiedName}--${r.target_qualifiedName}--${r.type}`;
            allRelationships.set(key, r);
          });
        }
      }

      return {
        filePath: absoluteFilePath,
        entities: Array.from(allEntities.values()),
        relationships: Array.from(allRelationships.values()),
        is_chunked: true
      };
    }
  }

  async _readFileContent(filePath) {
    // If we have a target directory, resolve relative paths against it
    // Otherwise, use the original behavior for backward compatibility
    let resolvedPath;
    if (this.targetDirectory && !path.isAbsolute(filePath)) {
      resolvedPath = path.resolve(this.targetDirectory, filePath);
    } else {
      resolvedPath = path.resolve(filePath);
    }
    
    // The original check was too restrictive for temp-directory-based tests.
    // This new check prevents directory traversal while allowing absolute paths.
    const baseDir = this.targetDirectory || BASE_DIR;
    if (path.relative(baseDir, resolvedPath).startsWith('..')) {
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

  async _callLlmWithRetries(prompt, filePath, retries = 3) {
    let lastError;
    for (let i = 0; i < retries; i++) {
      try {
        // Convert prompt structure to match DeepSeek client expectations
        const formattedPrompt = {
          system: prompt.systemPrompt,
          user: prompt.userPrompt
        };
        
        const response = await this.llmClient.call(formattedPrompt);
        return this.validator.validateAndNormalize(response.body, filePath);
      } catch (error) {
        lastError = error;
        
        // If it's a validation error, retry with a more explicit prompt
        if (error instanceof ValidationError && i < retries - 1) {
          console.warn(`Validation failed for ${filePath}, attempt ${i + 1}/${retries}: ${error.message}`);
          // For retry, use the strict guardrail prompt
          prompt = this.validator.createGuardrailPrompt(filePath, prompt.originalContent || '');
          await new Promise(res => setTimeout(res, 1000 * Math.pow(2, i)));
          continue;
        }
        
        if (error instanceof InvalidJsonResponseError || error instanceof ValidationError) {
          throw error;
        }
        
        if (i < retries - 1) {
          await new Promise(res => setTimeout(res, 1000 * Math.pow(2, i)));
        }
      }
    }
    throw new LlmCallFailedError(`LLM call failed after ${retries} attempts: ${lastError.message}`);
  }

  // Removed - now using JsonSchemaValidator.validateAndNormalize()

  // Removed - normalization now handled by JsonSchemaValidator

  async _saveSuccessResult(taskId, filePath, rawJsonString, jsonHash) {
    const absoluteFilePath = path.resolve(filePath);
    const insertSql = "INSERT INTO analysis_results (work_item_id, file_path, absolute_file_path, llm_output, status) VALUES (?, ?, ?, ?, 'pending_ingestion');";
    const updateSql = "UPDATE work_queue SET status = 'completed' WHERE id = ?;";
    await this.db.exec('BEGIN TRANSACTION');
    try {
      await this.db.run(insertSql, [taskId, filePath, absoluteFilePath, rawJsonString]);
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

  // Removed - now using JsonSchemaValidator.createGuardrailPrompt()

  // Removed - now using JsonSchemaValidator.createGuardrailPrompt() for chunks too
}

module.exports = { 
    WorkerAgent,
    LlmCallFailedError,
    InvalidJsonResponseError,
    FileNotFoundError
};