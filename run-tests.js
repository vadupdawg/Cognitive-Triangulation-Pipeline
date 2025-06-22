#!/usr/bin/env node

/**
 * Test Runner for Pipeline Validation
 * 
 * Runs the comprehensive test suite that defines what "working" means
 * and identifies what needs to be fixed in the current implementation.
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('🧪 Pipeline Test Suite Runner');
console.log('==============================');
console.log('Running comprehensive tests to define what "working" means...\n');

// Test categories to run
const testSuites = [
  {
    name: 'Unit Tests - Worker Agent Schema',
    path: 'tests/unit/worker-agent-schema.test.js',
    description: 'Tests WorkerAgent schema validation according to prompt requirements'
  },
  {
    name: 'Unit Tests - Batch Processing',
    path: 'tests/unit/batch-processing.test.js', 
    description: 'Tests high-performance batch processing for 200 concurrent workers'
  },
  {
    name: 'Integration Tests - Full Pipeline',
    path: 'tests/integration/pipeline-integration.test.js',
    description: 'Tests complete pipeline: Scout → Workers → Graph Ingestion'
  }
];

async function runTestSuite(suite) {
  console.log(`\n📋 Running: ${suite.name}`);
  console.log(`📝 ${suite.description}`);
  console.log(`📂 ${suite.path}`);
  console.log('─'.repeat(60));

  return new Promise((resolve) => {
    const jest = spawn('npx', ['jest', suite.path, '--verbose'], {
      stdio: 'inherit',
      shell: true
    });

    jest.on('close', (code) => {
      if (code === 0) {
        console.log(`✅ ${suite.name} - PASSED`);
      } else {
        console.log(`❌ ${suite.name} - FAILED (exit code: ${code})`);
      }
      resolve(code);
    });

    jest.on('error', (error) => {
      console.error(`❌ Error running ${suite.name}:`, error.message);
      resolve(1);
    });
  });
}

async function runAllTests() {
  console.log('🚀 Starting test execution...\n');
  
  const results = [];
  
  for (const suite of testSuites) {
    const exitCode = await runTestSuite(suite);
    results.push({ suite: suite.name, passed: exitCode === 0 });
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST RESULTS SUMMARY');
  console.log('='.repeat(60));

  let passedCount = 0;
  let failedCount = 0;

  results.forEach(result => {
    if (result.passed) {
      console.log(`✅ ${result.suite}`);
      passedCount++;
    } else {
      console.log(`❌ ${result.suite}`);
      failedCount++;
    }
  });

  console.log(`\n📈 Summary: ${passedCount} passed, ${failedCount} failed`);

  if (failedCount > 0) {
    console.log('\n🔧 NEXT STEPS:');
    console.log('The failing tests show what needs to be fixed to make the pipeline "work".');
    console.log('Focus on fixing the issues identified in the test output above.');
    console.log('\n💡 Common issues to check:');
    console.log('  - EntityName undefined errors in JsonSchemaValidator');
    console.log('  - Workers completing instantly without LLM processing'); 
    console.log('  - Batch processor not handling concurrent writes correctly');
    console.log('  - Missing or incorrect schema validation');
    console.log('  - Database connection or transaction issues');
  } else {
    console.log('\n🎉 All tests passed! The pipeline is working correctly.');
  }

  process.exit(failedCount > 0 ? 1 : 0);
}

// Handle process interruption
process.on('SIGINT', () => {
  console.log('\n\n⚠️  Test execution interrupted by user');
  process.exit(1);
});

// Run the tests
runAllTests().catch(error => {
  console.error('❌ Fatal error running tests:', error);
  process.exit(1);
}); 