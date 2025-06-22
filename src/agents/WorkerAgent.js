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
        `SELECT id, file_id, file_path, content_hash, project_context
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
        'SELECT id, file_id, file_path, content_hash, project_context FROM work_queue WHERE id = ?',
        [taskId]
    );
  }

  async processTask(task) {
    try {
      console.log(`[WorkerAgent] Processing task ${task.id} for file: ${task.file_path}`);
      
      // VULN-001: Path Traversal Fix
      const safeTargetDirectory = path.resolve(this.targetDirectory || '.');
      const intendedFilePath = path.resolve(task.file_path);

      if (!intendedFilePath.startsWith(safeTargetDirectory + path.sep)) {
          const errorMessage = `Path traversal attempt detected for file path: ${task.file_path}`;
          console.error(`[WorkerAgent] Security Alert: ${errorMessage}`);
          await this._queueProcessingFailure(task.id, 'Invalid file path specified.');
          return;
      }

      const absoluteFilePath = intendedFilePath; // Use the validated path
      console.log(`[WorkerAgent] Absolute file path: ${absoluteFilePath}`);
      
      // CRITICAL FIX: Read the actual file content
      console.log(`[WorkerAgent] Reading file content...`);
      let fileContent;
      try {
        fileContent = await fs.readFile(absoluteFilePath, 'utf8');
        console.log(`[WorkerAgent] File content read successfully (${fileContent.length} characters)`);
      } catch (fileError) {
        const errorMessage = `Failed to read file: ${fileError.message}`;
        console.error(`[WorkerAgent] ${errorMessage}`);
        await this._queueProcessingFailure(task.id, errorMessage);
        return;
      }
      
      // Create prompt with actual file content and project context
      console.log(`[WorkerAgent] Creating guardrail prompt with file content and project context...`);
      const prompt = this.validator.createGuardrailPrompt(absoluteFilePath, fileContent, task.project_context);
      console.log(`[WorkerAgent] Prompt created successfully`);
      
      console.log(`[WorkerAgent] Calling LLM with retries for file: ${task.file_path} (${fileContent.length} chars)...`);
      const startTime = Date.now();
      const llmAnalysisResult = await this._callLlmWithRetries(prompt, absoluteFilePath);
      const endTime = Date.now();
      console.log(`[WorkerAgent] LLM analysis completed for ${task.file_path} in ${endTime - startTime}ms`);
      
      // Queue the result for batch processing instead of immediate database write
      await this._queueSuccessResult(task.id, task.file_id, task.file_path, absoluteFilePath, JSON.stringify(llmAnalysisResult));
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

  async _callLlmWithRetries(prompt, filePath, retries = 5) {
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
        
        // Handle rate limiting with longer delays
        if (error.message.includes('rate limit') && i < retries - 1) {
          const delay = 5000 * Math.pow(2, i); // 5s, 10s, 20s, 40s
          console.warn(`Rate limit hit for ${filePath}, attempt ${i + 1}/${retries}, waiting ${delay}ms: ${error.message}`);
          await new Promise(res => setTimeout(res, delay));
          continue;
        }
        
        // Handle validation errors
        if (error instanceof ValidationError && i < retries - 1) {
          console.warn(`Validation failed for ${filePath}, attempt ${i + 1}/${retries}: ${error.message}`);
          await new Promise(res => setTimeout(res, 2000 * Math.pow(2, i)));
          continue;
        }
        
        // Handle network/timeout errors
        if ((error.message.includes('timeout') || error.message.includes('network')) && i < retries - 1) {
          const delay = 3000 * Math.pow(2, i);
          console.warn(`Network/timeout error for ${filePath}, attempt ${i + 1}/${retries}, waiting ${delay}ms: ${error.message}`);
          await new Promise(res => setTimeout(res, delay));
          continue;
        }
        
        // General retry with exponential backoff
        if (i < retries - 1) {
          const delay = 1000 * Math.pow(2, i);
          console.warn(`Error for ${filePath}, attempt ${i + 1}/${retries}, waiting ${delay}ms: ${error.message}`);
          await new Promise(res => setTimeout(res, delay));
        }
      }
    }
    throw new LlmCallFailedError(`LLM call failed after ${retries} attempts: ${lastError.message}`);
  }
   async _queueSuccessResult(taskId, fileId, filePath, absoluteFilePath, rawJsonString) {
     // The batch processor is designed to handle both storing the analysis result
     // and updating the work queue status in an optimized manner.
     await this.batchProcessor.queueAnalysisResult(
       taskId,
       fileId,
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
  async _saveSuccessResult(taskId, fileId, filePath, rawJsonString) {
    const absoluteFilePath = path.resolve(filePath);
    await this._queueSuccessResult(taskId, fileId, filePath, absoluteFilePath, rawJsonString);
  }

  async _handleProcessingFailure(taskId, errorMessage) {
    await this._queueProcessingFailure(taskId, errorMessage);
  }
}

module.exports = { 
    WorkerAgent,
    LlmCallFailedError
};