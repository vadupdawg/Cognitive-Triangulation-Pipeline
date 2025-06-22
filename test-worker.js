const { getDb } = require('./src/utils/sqliteDb');
const { getDeepseekClient } = require('./src/utils/deepseekClient');
const { WorkerAgent } = require('./src/agents/WorkerAgent');
const { getBatchProcessor } = require('./src/utils/batchProcessor');

async function testSingleFile() {
  try {
    const db = await getDb();
    const llmClient = getDeepseekClient();
    const workerAgent = new WorkerAgent(db, llmClient, '.');
    
    // Start batch processor
    const batchProcessor = getBatchProcessor();
    await batchProcessor.startWorkers();
    
    // Try to claim and process a single task
    console.log('Attempting to claim a task...');
    const task = await workerAgent.claimTask('test-worker');
    
    if (!task) {
      console.log('No tasks available to claim');
      return;
    }
    
    console.log('Claimed task:', task);
    console.log('Processing task...');
    
    await workerAgent.processTask(task);
    console.log('Task processing completed');
    
    // Check batch processor state
    const stats = await batchProcessor.getQueueStats();
    console.log('Batch processor stats after processing:');
    console.log('  Analysis Result Buffer:', stats.analysisResultBuffer);
    console.log('  Total Processed:', stats.totalProcessed);
    
    // Force flush
    await batchProcessor.forceFlush();
    console.log('Forced flush completed');
    
    // Check final stats
    const finalStats = await batchProcessor.getQueueStats();
    console.log('Final batch processor stats:');
    console.log('  Total Processed:', finalStats.totalProcessed);
    
  } catch (error) {
    console.error('Error during test:', error);
  }
}

testSingleFile().catch(console.error);