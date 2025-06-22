//
// batchProcessor.js
//
// High-performance in-memory batch processing system for SQLite
// Designed to handle hundreds of concurrent workers without database locking issues
// Uses in-memory queues and batching strategies from research
//

const { executeBatch, createTransaction } = require('./sqliteDb');
const EventEmitter = require('events');

class InMemoryBatchProcessor extends EventEmitter {
  constructor() {
    super();
    
    // Batch configuration based on research findings
    this.BATCH_SIZE = 50; // Process 50 items per batch for optimal performance
    this.BATCH_TIMEOUT = 1000; // 1 second max wait time
    this.MAX_QUEUE_SIZE = 1000; // Prevent memory overflow
    
    // In-memory batch buffers
    this.analysisResultBuffer = [];
    this.failedWorkBuffer = [];
    
    // Processing state
    this.isProcessing = false;
    this.batchTimer = null;
    this.stats = {
      totalProcessed: 0,
      totalFailed: 0,
      batchesProcessed: 0,
      averageBatchSize: 0
    };
    
    console.log('InMemoryBatchProcessor initialized for high-concurrency operations');
  }

  /**
   * Starts the batch processing system
   */
  async startWorkers() {
    console.log('Starting in-memory batch processing...');
    
    // Start periodic batch flushing
    this.startBatchTimer();
    
    console.log('In-memory batch processing started successfully');
  }

  /**
   * Adds an analysis result to the processing queue
   */
  async queueAnalysisResult(taskId, filePath, absoluteFilePath, llmOutput) {
    // Check queue size to prevent memory overflow
    if (this.analysisResultBuffer.length >= this.MAX_QUEUE_SIZE) {
      console.warn('Analysis result queue full, forcing flush...');
      await this.flushAnalysisResults();
    }
    
    this.analysisResultBuffer.push({
      taskId,
      filePath,
      absoluteFilePath,
      llmOutput,
      status: 'completed',
      timestamp: new Date().toISOString()
    });
    
    // Trigger immediate batch processing if buffer is full
    if (this.analysisResultBuffer.length >= this.BATCH_SIZE) {
      await this.flushAnalysisResults();
    }
  }

  /**
   * Adds a failed work item to the processing queue
   */
  async queueFailedWork(taskId, errorMessage) {
    // Check queue size to prevent memory overflow
    if (this.failedWorkBuffer.length >= this.MAX_QUEUE_SIZE) {
      console.warn('Failed work queue full, forcing flush...');
      await this.flushFailedWork();
    }
    
    this.failedWorkBuffer.push({
      taskId,
      errorMessage,
      timestamp: new Date().toISOString()
    });
    
    // Trigger immediate batch processing if buffer is full
    if (this.failedWorkBuffer.length >= this.BATCH_SIZE) {
      await this.flushFailedWork();
    }
  }

  /**
   * Flushes analysis results buffer to database in a single transaction
   */
  async flushAnalysisResults() {
    if (this.analysisResultBuffer.length === 0 || this.isProcessing) return;
    
    const batch = [...this.analysisResultBuffer];
    this.analysisResultBuffer = [];
    
    try {
      await this.writeBatchAnalysisResults(batch);
    } catch (error) {
      console.error('Failed to flush analysis results:', error);
      // Re-queue the failed items for retry
      this.analysisResultBuffer.unshift(...batch);
      throw error;
    }
  }

  /**
   * Flushes failed work buffer to database in a single transaction
   */
  async flushFailedWork() {
    if (this.failedWorkBuffer.length === 0 || this.isProcessing) return;
    
    const batch = [...this.failedWorkBuffer];
    this.failedWorkBuffer = [];
    
    try {
      await this.writeBatchFailedWork(batch);
    } catch (error) {
      console.error('Failed to flush failed work:', error);
      // Re-queue the failed items for retry
      this.failedWorkBuffer.unshift(...batch);
      throw error;
    }
  }

  /**
   * Writes analysis results to database in a single transaction using optimal batching
   */
  async writeBatchAnalysisResults(batch) {
    if (batch.length === 0) return;
    
    this.isProcessing = true;
    
    try {
      // Use createTransaction for atomic batch processing
      await createTransaction(async (db) => {
        // Prepare bulk operations
        const insertResultStmt = await db.prepare(`
          INSERT INTO analysis_results (work_item_id, file_path, absolute_file_path, llm_output, status) 
          VALUES (?, ?, ?, ?, ?)
        `);
        
        const updateWorkQueueStmt = await db.prepare(`
          UPDATE work_queue SET status = 'completed' WHERE id = ?
        `);
        
        // Execute all operations in the transaction
        for (const item of batch) {
          await insertResultStmt.run(item.taskId, item.filePath, item.absoluteFilePath, item.llmOutput, item.status);
          await updateWorkQueueStmt.run(item.taskId);
        }
        
        await insertResultStmt.finalize();
        await updateWorkQueueStmt.finalize();
        
        return batch.length;
      });
      
      // Update statistics
      this.stats.totalProcessed += batch.length;
      this.stats.batchesProcessed++;
      this.stats.averageBatchSize = this.stats.totalProcessed / this.stats.batchesProcessed;
      
      console.log(`✅ Batch processed: ${batch.length} analysis results written to database (total: ${this.stats.totalProcessed})`);
      this.emit('batchProcessed', { type: 'analysis', count: batch.length });
      
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Writes failed work items to database in a single transaction using optimal batching
   */
  async writeBatchFailedWork(batch) {
    if (batch.length === 0) return;
    
    this.isProcessing = true;
    
    try {
      // Use createTransaction for atomic batch processing
      await createTransaction(async (db) => {
        // Prepare bulk operations
        const insertFailedStmt = await db.prepare(`
          INSERT INTO failed_work (work_item_id, error_message) VALUES (?, ?)
        `);
        
        const updateWorkQueueStmt = await db.prepare(`
          UPDATE work_queue SET status = 'failed' WHERE id = ?
        `);
        
        // Execute all operations in the transaction
        for (const item of batch) {
          await insertFailedStmt.run(item.taskId, item.errorMessage);
          await updateWorkQueueStmt.run(item.taskId);
        }
        
        await insertFailedStmt.finalize();
        await updateWorkQueueStmt.finalize();
        
        return batch.length;
      });
      
      // Update statistics
      this.stats.totalFailed += batch.length;
      this.stats.batchesProcessed++;
      this.stats.averageBatchSize = (this.stats.totalProcessed + this.stats.totalFailed) / this.stats.batchesProcessed;
      
      console.log(`❌ Batch processed: ${batch.length} failed work items written to database (total failed: ${this.stats.totalFailed})`);
      this.emit('batchProcessed', { type: 'failed', count: batch.length });
      
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Starts the periodic batch timer to flush buffers
   */
  startBatchTimer() {
    this.batchTimer = setInterval(async () => {
      try {
        if (!this.isProcessing) {
          await Promise.all([
            this.flushAnalysisResults(),
            this.flushFailedWork()
          ]);
        }
      } catch (error) {
        console.error('Batch timer flush error:', error);
      }
    }, this.BATCH_TIMEOUT);
  }

  /**
   * Forces immediate flush of all buffers
   */
  async forceFlush() {
    console.log('Forcing flush of all buffers...');
    await Promise.all([
      this.flushAnalysisResults(),
      this.flushFailedWork()
    ]);
    console.log('Force flush completed');
  }

  /**
   * Gets queue statistics for monitoring
   */
  async getQueueStats() {
    return {
      analysisResultBuffer: this.analysisResultBuffer.length,
      failedWorkBuffer: this.failedWorkBuffer.length,
      isProcessing: this.isProcessing,
      maxQueueSize: this.MAX_QUEUE_SIZE,
      batchSize: this.BATCH_SIZE,
      // Flatten stats to top level for easier access
      totalProcessed: this.stats.totalProcessed,
      totalFailed: this.stats.totalFailed,
      batchesProcessed: this.stats.batchesProcessed,
      averageBatchSize: this.stats.averageBatchSize
    };
  }

  /**
   * Gracefully shuts down the batch processor
   */
  async shutdown() {
    console.log('Shutting down in-memory batch processor...');
    
    // Clear timer
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
    }
    
    // Force flush remaining buffers
    await this.forceFlush();
    
    console.log('In-memory batch processor shutdown complete');
    console.log('Final stats:', this.stats);
  }
}

// Singleton instance
let batchProcessor = null;

/**
 * Gets the singleton batch processor instance
 */
function getBatchProcessor() {
  if (!batchProcessor) {
    batchProcessor = new InMemoryBatchProcessor();
  }
  return batchProcessor;
}

module.exports = {
  InMemoryBatchProcessor,
  getBatchProcessor
}; 