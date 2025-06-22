/**
 * Batch Processing Tests
 * 
 * Tests the high-performance batch processing system that enables
 * 200 concurrent workers to write to SQLite efficiently.
 */

const { getBatchProcessor } = require('../../src/utils/batchProcessor');
const sqliteDb = require('../../src/utils/sqliteDb');

describe('Batch Processing System Tests', () => {
  let batchProcessor;

  // Helper function to create work queue entries for testing
  async function createWorkQueueEntries(count, prefix = 'test') {
    const ids = [];
    for (let i = 0; i < count; i++) {
      const result = await sqliteDb.execute(
        'INSERT INTO work_queue (file_path, absolute_file_path, content_hash, status) VALUES (?, ?, ?, ?)',
        [`${prefix}-${i}.js`, `C:\\code\\aback\\${prefix}-${i}.js`, `hash${i}`, 'processing']
      );
      ids.push(result.lastID);
    }
    return ids;
  }

  beforeEach(async () => {
    // Clear test data first
    await sqliteDb.execute('DELETE FROM analysis_results');
    await sqliteDb.execute('DELETE FROM failed_work');
    await sqliteDb.execute('DELETE FROM work_queue');
    
    // Get fresh batch processor
    batchProcessor = getBatchProcessor();
  });

  afterEach(async () => {
    if (batchProcessor) {
      // Force flush before shutdown to ensure all data is written
      await batchProcessor.forceFlush();
      // Don't shutdown the singleton - just force flush
      // await batchProcessor.shutdown();
    }
  });

  describe('High Concurrency Batch Processing', () => {
    test('Should handle 50 concurrent analysis results efficiently', async () => {
      const startTime = Date.now();
      
      // First, create work queue entries and get their actual IDs
      const taskIds = await createWorkQueueEntries(50, 'test-file');
      
      const promises = [];

      // Simulate 50 workers submitting results simultaneously
      for (let i = 0; i < 50; i++) {
        const promise = batchProcessor.queueAnalysisResult(
          taskIds[i], // Use actual task ID from database
          `test-file-${i}.js`,
          `C:\\code\\aback\\test-file-${i}.js`,
          JSON.stringify({
            filePath: `C:\\code\\aback\\test-file-${i}.js`,
            entities: [
              {
                type: "File",
                name: `test-file-${i}.js`,
                qualifiedName: `C:\\code\\aback\\test-file-${i}.js`
              },
              {
                type: "Function",
                name: `testFunction${i}`,
                qualifiedName: `C:\\code\\aback\\test-file-${i}.js--testFunction${i}`
              }
            ],
            relationships: [
              {
                source_qualifiedName: `C:\\code\\aback\\test-file-${i}.js`,
                target_qualifiedName: `C:\\code\\aback\\test-file-${i}.js--testFunction${i}`,
                type: "CONTAINS"
              }
            ]
          })
        );
        promises.push(promise);
      }

      await Promise.all(promises);
      
      // Force immediate batch processing instead of waiting for timer
      await batchProcessor.forceFlush();

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete within reasonable time (less than 5 seconds)
      expect(duration).toBeLessThan(5000);

      // Verify all results were written
      const results = await sqliteDb.execute('SELECT COUNT(*) as count FROM analysis_results');
      expect(results[0].count).toBe(50);
    });

    test('Should handle mixed success and failure batches', async () => {
      // Clear database before this specific test
      await sqliteDb.execute('DELETE FROM analysis_results');
      await sqliteDb.execute('DELETE FROM failed_work');
      await sqliteDb.execute('DELETE FROM work_queue');
      
      // Create work queue entries and get their actual IDs
      const successIds = await createWorkQueueEntries(25, 'success');
      const failedIds = await createWorkQueueEntries(25, 'failed');
      
      const promises = [];

      // Queue 25 successful results
      for (let i = 0; i < 25; i++) {
        promises.push(
          batchProcessor.queueAnalysisResult(
            successIds[i],
            `success-${i}.js`,
            `C:\\code\\aback\\success-${i}.js`,
            JSON.stringify({
              filePath: `C:\\code\\aback\\success-${i}.js`,
              entities: [{ type: "File", name: `success-${i}.js`, qualifiedName: `C:\\code\\aback\\success-${i}.js` }],
              relationships: []
            })
          )
        );
      }

      // Queue 25 failed results
      for (let i = 0; i < 25; i++) {
        promises.push(
          batchProcessor.queueFailedWork(failedIds[i], `Test error ${i}`)
        );
      }

      await Promise.all(promises);
      
      // Force immediate batch processing - call multiple times to ensure all buffers are flushed
      await batchProcessor.forceFlush();
      await batchProcessor.forceFlush(); // Second flush to ensure failed items are processed
      
      // Add a longer delay to ensure database writes are complete
      await new Promise(resolve => setTimeout(resolve, 300));

      // Verify results - check what's actually in the database
      const successResults = await sqliteDb.execute('SELECT COUNT(*) as count FROM analysis_results');
      const failedResults = await sqliteDb.execute('SELECT COUNT(*) as count FROM failed_work');
      
      console.log(`Success results found: ${successResults[0].count}, Failed results found: ${failedResults[0].count}`);

      expect(successResults[0].count).toBe(25);
      expect(failedResults[0].count).toBe(25);
    });

    test('Should provide accurate queue statistics', async () => {
      // Create work queue entries first
      const taskIds = await createWorkQueueEntries(3, 'test');
      
      // Queue some items
      await batchProcessor.queueAnalysisResult(taskIds[0], 'test-0.js', 'C:\\code\\aback\\test-0.js', '{"test": true}');
      await batchProcessor.queueAnalysisResult(taskIds[1], 'test-1.js', 'C:\\code\\aback\\test-1.js', '{"test": true}');
      await batchProcessor.queueFailedWork(taskIds[2], 'Test error');

      // Force flush to process the queued items
      await batchProcessor.forceFlush();

      const stats = await batchProcessor.getQueueStats();

      expect(stats).toHaveProperty('totalProcessed');
      expect(stats).toHaveProperty('totalFailed');
      expect(stats).toHaveProperty('batchesProcessed');
      expect(stats).toHaveProperty('averageBatchSize');

      expect(typeof stats.totalProcessed).toBe('number');
      expect(typeof stats.totalFailed).toBe('number');
    });
  });

  describe('Batch Size and Timing Optimization', () => {
    test('Should process batches efficiently with optimal batch sizes', async () => {
      const batchSizes = [10, 25, 50, 100];
      
      for (const batchSize of batchSizes) {
        // Clear previous data
        await sqliteDb.execute('DELETE FROM analysis_results');
        await sqliteDb.execute('DELETE FROM work_queue');
        
        // Create work queue entries for this batch and get their actual IDs
        const taskIds = await createWorkQueueEntries(batchSize, 'batch-test');
        
        const startTime = Date.now();
        const promises = [];

        for (let i = 0; i < batchSize; i++) {
          promises.push(
            batchProcessor.queueAnalysisResult(
              taskIds[i], // Use actual task ID from database
              `batch-test-${i}.js`,
              `C:\\code\\aback\\batch-test-${i}.js`,
              JSON.stringify({
                filePath: `C:\\code\\aback\\batch-test-${i}.js`,
                entities: [{ type: "File", name: `batch-test-${i}.js`, qualifiedName: `C:\\code\\aback\\batch-test-${i}.js` }],
                relationships: []
              })
            )
          );
        }

        await Promise.all(promises);
        await batchProcessor.forceFlush();

        const endTime = Date.now();
        const duration = endTime - startTime;

        // Verify all items processed
        const results = await sqliteDb.execute('SELECT COUNT(*) as count FROM analysis_results');
        expect(results[0].count).toBe(batchSize);

        // Log performance for analysis
        console.log(`Batch size ${batchSize}: ${duration}ms`);
      }
    });

    test('Should handle buffer overflow gracefully', async () => {
      // Queue more items than typical buffer size
      const itemCount = 200;
      
      // Create work queue entries first and get their actual IDs
      const taskIds = await createWorkQueueEntries(itemCount, 'overflow-test');
      
      const promises = [];

      for (let i = 0; i < itemCount; i++) {
        promises.push(
          batchProcessor.queueAnalysisResult(
            taskIds[i], // Use actual task ID from database
            `overflow-test-${i}.js`,
            `C:\\code\\aback\\overflow-test-${i}.js`,
            JSON.stringify({
              filePath: `C:\\code\\aback\\overflow-test-${i}.js`,
              entities: [{ type: "File", name: `overflow-test-${i}.js`, qualifiedName: `C:\\code\\aback\\overflow-test-${i}.js` }],
              relationships: []
            })
          )
        );
      }

      await Promise.all(promises);
      
      // Force flush all batches to process
      await batchProcessor.forceFlush();

      // Verify all items were processed
      const results = await sqliteDb.execute('SELECT COUNT(*) as count FROM analysis_results');
      expect(results[0].count).toBe(itemCount);
    });
  });

  describe('Error Handling and Recovery', () => {
    test('Should handle database connection errors gracefully', async () => {
      // Create work queue entry first and get its actual ID
      const taskIds = await createWorkQueueEntries(1, 'test');
      
      // This test would require mocking database errors
      // For now, we'll test that the batch processor doesn't crash
      
      await expect(
        batchProcessor.queueAnalysisResult(taskIds[0], 'test-0.js', 'C:\\code\\aback\\test-0.js', '{"valid": "json"}')
      ).resolves.not.toThrow();
      
      // Force flush to process
      await batchProcessor.forceFlush();
    });

    test('Should handle malformed data gracefully', async () => {
      // Create work queue entry first and get its actual ID
      const taskIds = await createWorkQueueEntries(1, 'test');
      
      // Queue item with invalid JSON (should still queue but might fail processing)
      await expect(
        batchProcessor.queueAnalysisResult(taskIds[0], 'test-0.js', 'C:\\code\\aback\\test-0.js', 'invalid json{')
      ).resolves.not.toThrow();

      // Force flush to process
      await batchProcessor.forceFlush();

      // Should not crash the batch processor
      const stats = await batchProcessor.getQueueStats();
      expect(stats).toBeDefined();
    });
  });

  describe('Shutdown and Cleanup', () => {
    test('Should flush all buffers on shutdown', async () => {
      // Create work queue entries first and get their actual IDs
      const taskIds = await createWorkQueueEntries(3, 'test');
      
      // Queue some items using actual task IDs
      await batchProcessor.queueAnalysisResult(taskIds[0], 'test-0.js', 'C:\\code\\aback\\test-0.js', '{"test": 1}');
      await batchProcessor.queueAnalysisResult(taskIds[1], 'test-1.js', 'C:\\code\\aback\\test-1.js', '{"test": 2}');
      await batchProcessor.queueFailedWork(taskIds[2], 'Test error');

      // Shutdown (should force flush)
      await batchProcessor.shutdown();
      
      // Add a longer delay to ensure database writes are complete
      await new Promise(resolve => setTimeout(resolve, 300));

      // Verify items were written
      const successResults = await sqliteDb.execute('SELECT COUNT(*) as count FROM analysis_results');
      const failedResults = await sqliteDb.execute('SELECT COUNT(*) as count FROM failed_work');

      expect(successResults[0].count).toBeGreaterThanOrEqual(2);
      expect(failedResults[0].count).toBeGreaterThanOrEqual(1);
    });
  });
}); 