#!/usr/bin/env node

/**
 * Test Runner for Cognitive Triangulation Pipeline Validation
 * 
 * Runs the comprehensive test suite for the new cognitive triangulation architecture:
 * EntityScout -> GraphBuilder -> RelationshipResolver
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('🧪 Cognitive Triangulation Pipeline Test Suite Runner');
console.log('===================================================');

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
 * Runs all predefined test suites for the cognitive triangulation architecture.
 */
async function runAllTests() {
  console.log('Running cognitive triangulation tests to validate the new architecture...\n');
  console.log('🚀 Starting test execution...\n');

  const testSuites = [
    {
      name: 'Functional Tests - EntityScout Agent',
      path: 'tests/functional/entity_scout_agent.test.js',
      description: 'Tests EntityScout agent for file discovery and entity extraction'
    },
    {
      name: 'Functional Tests - GraphBuilder Agent',
      path: 'tests/functional/graph_builder_agent.test.js',
      description: 'Tests GraphBuilder agent for creating nodes and relationships in Neo4j'
    },
    {
      name: 'Functional Tests - RelationshipResolver Agent',
      path: 'tests/functional/relationship_resolver_agent.test.js',
      description: 'Tests RelationshipResolver agent for cognitive triangulation analysis'
    },
    {
      name: 'Acceptance Tests - Comprehensive Graph Generation',
      path: 'tests/acceptance/A-01_comprehensive_graph_generation.test.js',
      description: '🎯 Validates complete pipeline generates comprehensive knowledge graph'
    },
    {
      name: 'Acceptance Tests - Ground Truth Validation',
      path: 'tests/acceptance/A-01_ground_truth_validation.test.js',
      description: 'Validates accuracy of generated relationships against ground truth'
    },
    {
      name: 'Acceptance Tests - High Confidence Relationship Validation',
      path: 'tests/acceptance/A-01_high_confidence_relationship_validation.test.js',
      description: 'Tests high-confidence relationship detection and validation'
    },
    {
      name: 'Acceptance Tests - Cognitive Triangulation',
      path: 'tests/acceptance/A-02_cognitive_triangulation.test.js',
      description: '🔗 CRITICAL: Tests cognitive triangulation methodology'
    },
    {
      name: 'Acceptance Tests - Resiliency and Self-Correction',
      path: 'tests/acceptance/A-02_resiliency_and_self_correction.test.js',
      description: 'Tests system resilience and self-correction capabilities'
    },
    {
      name: 'Acceptance Tests - Idempotency',
      path: 'tests/acceptance/A-03_idempotency.test.js',
      description: 'Validates pipeline produces consistent results across runs'
    },
    {
      name: 'Acceptance Tests - Advanced Code Discovery',
      path: 'tests/acceptance/A-04_advanced_code_discovery.test.js',
      description: 'Tests advanced code pattern and relationship discovery'
    },
    {
      name: 'Acceptance Tests - Hierarchical Analysis Validation',
      path: 'tests/acceptance/A-05_hierarchical_analysis_validation.test.js',
      description: 'Validates hierarchical analysis and multi-level relationships'
    },
    {
      name: 'Acceptance Tests - Unrelated Files Handling',
      path: 'tests/acceptance/A-05_unrelated_files.test.js',
      description: 'Tests proper handling of unrelated or standalone files'
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
    console.log('The failing tests show what needs to be fixed in the cognitive triangulation pipeline.');
    console.log('Focus on fixing the issues identified in the test output above.');
  } else {
    console.log('\n🎉 All tests passed! The cognitive triangulation pipeline is working correctly.');
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