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

// --- Helper Functions ---

/**
 * Runs a single test suite using Jest.
 * @param {object} suite - An object containing the name and path of the test suite.
 * @returns {Promise<number>} A promise that resolves with the exit code of the test run.
 */
async function runTestSuite(suite) {
  console.log(`\n📋 Running: ${suite.name}`);
  if (suite.description) {
    console.log(`📝 ${suite.description}`);
  }
  console.log(`📂 ${suite.path}`);
  console.log('─'.repeat(60));

  return new Promise((resolve) => {
    const jestCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const jest = spawn(jestCommand, ['jest', suite.path, '--verbose', '--runInBand'], {
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

/**
 * Runs all predefined test suites.
 */
async function runAllTests() {
  console.log('Running comprehensive tests to define what "working" means...\n');
  console.log('🚀 Starting test execution...\n');

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
    },
    {
      name: 'AMCP Comprehensive Analysis - DEFINITION OF WORKING',
      path: 'tests/integration/amcp-comprehensive-analysis.test.js',
      description: '🎯 DEFINES WHAT "WORKING" MEANS: 47 files → 1,689 nodes → 5,299 relationships'
    },
    {
      name: 'AMCP Pipeline Validation',
      path: 'tests/integration/amcp-pipeline-validation.test.js',
      description: 'Tests complete AMCP directory analysis: Scout → 50 Workers → SQLite → Neo4j'
    },
    {
      name: 'AMCP Schema Validation',
      path: 'tests/integration/amcp-schema-validation.test.js',
      description: 'Manual file inspection and schema validation for AMCP directory'
    },
    {
      name: 'Neo4j Data Validation',
      path: 'tests/integration/neo4j-data-validation.test.js',
      description: 'Validates SQLite data perfectly matches Neo4j ingestion'
    },
    {
      name: 'AMCP Import/Export Validation - FOCUSED RELATIONSHIP TESTING',
      path: 'tests/integration/amcp-import-export-validation.test.js',
      description: '🔗 CRITICAL: Validates import/export relationship detection across files and languages'
    },
    {
      name: 'AMCP Production Pipeline - REAL LLM TESTING',
      path: 'tests/integration/amcp-production-pipeline.test.js',
      description: '🚀 PRODUCTION: Real DeepSeek LLM analysis of 5 AMCP files (2-3 minutes)'
    }
  ];

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
  } else {
    console.log('\n🎉 All tests passed! The pipeline is working correctly.');
  }

  process.exit(failedCount > 0 ? 1 : 0);
}

/**
 * Main execution block
 */
async function main() {
  const args = process.argv.slice(2);
  const fileArg = args.find(arg => arg.startsWith('--file='));

  if (fileArg) {
    const filePath = fileArg.split('=')[1];
    console.log(`Running single test file: ${filePath}\n`);
    const suite = {
      name: `Single Test - ${path.basename(filePath)}`,
      path: filePath
    };
    const exitCode = await runTestSuite(suite);
    process.exit(exitCode);
  } else {
    await runAllTests();
  }
}

// --- Process Handling ---
process.on('SIGINT', () => {
  console.log('\n\n⚠️  Test execution interrupted by user');
  process.exit(1);
});

// --- Run Script ---
main().catch(error => {
  console.error('❌ Fatal error running tests:', error);
  process.exit(1);
});