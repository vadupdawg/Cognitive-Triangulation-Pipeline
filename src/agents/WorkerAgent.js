const path = require('path');
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
    const claimResult = await this.db.execute(
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
    const task = await this.db.querySingle(
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
    const claimResult = await this.db.execute(
        `UPDATE work_queue SET status = 'processing', worker_id = ? WHERE id = ? AND status = 'pending'`,
        [workerId, taskId]
    );

    if (claimResult.changes === 0) {
        return null;
    }

    return await this.db.querySingle(
        'SELECT id, file_path, content_hash FROM work_queue WHERE id = ?',
        [taskId]
    );
  }

  async processTask(task) {
    try {
      console.log(`[WorkerAgent] Processing task ${task.id} for file: ${task.file_path}`);
      
      // Convert to absolute path for the LLM
      const absoluteFilePath = path.resolve(this.targetDirectory || '', task.file_path);
      console.log(`[WorkerAgent] Absolute file path: ${absoluteFilePath}`);
      
      // Let the LLM read and analyze the file directly
      console.log(`[WorkerAgent] Creating guardrail prompt...`);
      const prompt = this.validator.createGuardrailPrompt(absoluteFilePath);
      console.log(`[WorkerAgent] Prompt created successfully`);
      
      console.log(`[WorkerAgent] Calling LLM with retries...`);
      const llmAnalysisResult = await this._callLlmWithRetries(prompt, absoluteFilePath);
      console.log(`[WorkerAgent] LLM analysis completed`);
      
      // Queue the result for batch processing instead of immediate database write
      await this._queueSuccessResult(task.id, task.file_path, absoluteFilePath, JSON.stringify(llmAnalysisResult));
      console.log(`[WorkerAgent] Success result queued for task ${task.id}`);
    } catch (error) {
      console.error(`[WorkerAgent] Error processing task ${task.id}:`, error);
      console.error(`[WorkerAgent] Error stack:`, error.stack);
      
      const errorMessage = error instanceof LlmCallFailedError || error instanceof ValidationError 
        ? error.message 
        : `Unexpected error: ${error.message}`;
      
      // Queue the failure for batch processing instead of immediate database write
      await this._queueProcessingFailure(task.id, errorMessage);
      console.log(`[WorkerAgent] Failure queued for task ${task.id}: ${errorMessage}`);
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
    // For now, write directly to database to ensure data is stored
    // TODO: Fix batch processor later
    try {
      // Insert into analysis_results with correct column name (work_item_id, not task_id)
      await this.db.execute(
        `INSERT INTO analysis_results (work_item_id, file_path, absolute_file_path, llm_output, status, validation_passed, created_at) 
         VALUES (?, ?, ?, ?, 'completed', 1, datetime('now'))`,
        [taskId, filePath, absoluteFilePath, rawJsonString]
      );
      
      // Also update work_queue status
      await this.db.execute(
        `UPDATE work_queue SET status = 'completed' WHERE id = ?`,
        [taskId]
      );
      
      console.log(`[WorkerAgent] Result stored directly in database for task ${taskId}`);
    } catch (error) {
      console.error(`[WorkerAgent] Failed to store result for task ${taskId}:`, error);
      // Fallback to batch processor
      await this.batchProcessor.queueAnalysisResult(taskId, filePath, absoluteFilePath, rawJsonString);
    }
  }

  async _queueProcessingFailure(taskId, errorMessage) {
    // Queue the failure for batch processing - no direct database access
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