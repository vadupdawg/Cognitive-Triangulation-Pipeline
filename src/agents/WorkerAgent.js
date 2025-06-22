const path = require('path');
const fs = require('fs/promises');
const { JsonSchemaValidator, ValidationError } = require('../utils/jsonSchemaValidator');
const { getBatchProcessor } = require('../utils/batchProcessor');

class LlmCallFailedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'LlmCallFailedError';
  }
}

class WorkerAgent {
  constructor(db, llmClient, targetDirectory = null) {
    this.db = db;
    this.llmClient = llmClient;
    this.targetDirectory = targetDirectory;
    this.validator = new JsonSchemaValidator();
    this.batchProcessor = getBatchProcessor();
  }

  async claimTask(workerId) {
    // Use SQLite's WAL mode and immediate update to avoid race conditions
    // This is more efficient than transactions for this simple operation
    
    // Try to claim a task atomically with a single UPDATE statement
    const claimResult = await this.db.run(
        `UPDATE work_queue
         SET status = 'processing', worker_id = ?
         WHERE id = (
           SELECT id FROM work_queue
           WHERE status = 'pending'
           ORDER BY id ASC
           LIMIT 1
         ) AND status = 'pending'`,
        [workerId]
    );

    if (claimResult.changes === 0) {
        return null; // No pending tasks available
    }

    // Get the task that was just claimed by this worker (most recent)
    const task = await this.db.get(
        `SELECT id, file_path, content_hash
         FROM work_queue
         WHERE worker_id = ? AND status = 'processing'
         ORDER BY id DESC
         LIMIT 1`,
        [workerId]
    );

    return task;
  }

  async claimSpecificTask(taskId, workerId) {
    const claimResult = await this.db.run(
        `UPDATE work_queue SET status = 'processing', worker_id = ? WHERE id = ? AND status = 'pending'`,
        [workerId, taskId]
    );

    if (claimResult.changes === 0) {
        return null;
    }

    return await this.db.get(
        'SELECT id, file_path, content_hash FROM work_queue WHERE id = ?',
        [taskId]
    );
  }

  async processTask(task) {
    try {
      console.log(`[WorkerAgent] Processing task ${task.id} for file: ${task.file_path}`);
      
      // VULN-001: Path Traversal Fix
      const safeTargetDirectory = path.resolve(this.targetDirectory || '.');
      const intendedFilePath = path.resolve(safeTargetDirectory, task.file_path);

      if (!intendedFilePath.startsWith(safeTargetDirectory + path.sep)) {
          const errorMessage = `Path traversal attempt detected for file path: ${task.file_path}`;
          console.error(`[WorkerAgent] Security Alert: ${errorMessage}`);
          await this._queueProcessingFailure(task.id, 'Invalid file path specified.');
          return;
      }

             const absoluteFilePath = intendedFilePath; // Use the validated path
             console.log(`[WorkerAgent] Absolute file path: ${absoluteFilePath}`);
      
            // Check file size to warn about potential memory issues
            const stats = await fs.stat(absoluteFilePath);
            const fileSizeInMB = stats.size / (1024 * 1024);
            if (fileSizeInMB > 10) { // 10 MB threshold
              console.warn(`[WorkerAgent] File ${task.file_path} is large (${fileSizeInMB.toFixed(2)}MB). Reading entire file into memory.`);
            }
             
             // Read file content to be passed to the LLM
             const fileContent = await fs.readFile(absoluteFilePath, 'utf-8');
      // Let the LLM read and analyze the file directly
      console.log(`[WorkerAgent] Creating guardrail prompt...`);
      const prompt = this.validator.createGuardrailPrompt(fileContent);
      console.log(`[WorkerAgent] Prompt created successfully`);
      
      console.log(`[WorkerAgent] Calling LLM with retries...`);
      const llmAnalysisResult = await this._callLlmWithRetries(prompt, absoluteFilePath);
      console.log(`[WorkerAgent] LLM analysis completed`);
      
      // Queue the result for batch processing instead of immediate database write
      await this._queueSuccessResult(task.id, task.file_path, absoluteFilePath, JSON.stringify(llmAnalysisResult));
      console.log(`[WorkerAgent] Success result queued for task ${task.id}`);
    } catch (error) {
      // VULN-002: Information Leakage Fix
      console.error(`[WorkerAgent] Error processing task ${task.id}:`, error);
      
      let errorMessageForDb;
      if (error instanceof LlmCallFailedError || error instanceof ValidationError) {
        errorMessageForDb = error.message;
      } else {
        // For all other errors, use a generic message for the database.
        errorMessageForDb = 'An unexpected error occurred while processing the file.';
      }
      
      // Queue the failure for batch processing instead of immediate database write
      await this._queueProcessingFailure(task.id, errorMessageForDb);
      console.log(`[WorkerAgent] Failure queued for task ${task.id}: ${errorMessageForDb}`);
    }
  }

  async _callLlmWithRetries(prompt, filePath, retries = 3) {
    let lastError;
    for (let i = 0; i < retries; i++) {
      try {
        const formattedPrompt = {
          system: prompt.systemPrompt,
          user: prompt.userPrompt
        };
        
        const response = await this.llmClient.call(formattedPrompt);
        return this.validator.validateAndNormalize(response.body, filePath);
      } catch (error) {
        lastError = error;
        
        if (error instanceof ValidationError && i < retries - 1) {
          console.warn(`Validation failed for ${filePath}, attempt ${i + 1}/${retries}: ${error.message}`);
          await new Promise(res => setTimeout(res, 1000 * Math.pow(2, i)));
          continue;
        }
        
        if (i < retries - 1) {
          await new Promise(res => setTimeout(res, 1000 * Math.pow(2, i)));
        }
      }
    }
    throw new LlmCallFailedError(`LLM call failed after ${retries} attempts: ${lastError.message}`);
  }
   async _queueSuccessResult(taskId, filePath, absoluteFilePath, rawJsonString) {
    // The batch processor is designed to handle both storing the analysis result
    // and updating the work queue status in an optimized manner.
    await this.batchProcessor.queueAnalysisResult(
      taskId,
      filePath,
      absoluteFilePath,
      rawJsonString
    );
    console.log(`[WorkerAgent] Success result queued for batch processing for task ${taskId}`);
  }
   async _queueProcessingFailure(taskId, errorMessage) {
    // Queue the failure for batch processing.
    await this.batchProcessor.queueFailedWork(taskId, errorMessage);
  }

  // Legacy methods for backward compatibility (now use batch processing)
  async _saveSuccessResult(taskId, filePath, rawJsonString) {
    const absoluteFilePath = path.resolve(filePath);
    await this._queueSuccessResult(taskId, filePath, absoluteFilePath, rawJsonString);
  }

  async _handleProcessingFailure(taskId, errorMessage) {
    await this._queueProcessingFailure(taskId, errorMessage);
  }
}

module.exports = { 
    WorkerAgent,
    LlmCallFailedError
};