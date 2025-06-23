# Test Plan-- `EntityScout` Agent

## 1. Introduction

This document outlines the comprehensive testing strategy for the `EntityScout` agent. The plan details a series of granular integration tests designed to verify the agent's functionality as specified in the [`docs/specifications/EntityScout_agent_specs.md`](docs/specifications/EntityScout_agent_specs.md).

The primary goal of this test plan is to ensure the `EntityScout` agent reliably and accurately produces `FileAnalysisReport` objects. These reports are a critical input for downstream agents like the `GraphBuilder`, and their integrity is essential for the success of the entire data processing pipeline as outlined in the [`docs/primary_project_planning_document_sprint_3.md`](docs/primary_project_planning_document_sprint_3.md).

Every test case herein is designed to be AI-verifiable, focusing on concrete, observable outcomes.

## 2. Test Scope

The scope of this plan is strictly limited to the `EntityScout` agent and its direct sub-modules, including the `LLMResponseSanitizer`.

**In Scope:**
-   Verification of all functionalities of the `EntityScout` class.
-   Validation of the resilient self-correction retry loop when interacting with the LLM.
-   Verification of all specified status codes (`COMPLETED_SUCCESS`, `SKIPPED_FILE_TOO_LARGE`, etc.).
-   End-to-end validation of the analysis process for a single file.
-   Testing the `LLMResponseSanitizer` module's ability to clean raw LLM output.

**Out of Scope:**
-   Testing the performance or accuracy of the underlying LLM itself.
-   Testing the interaction between multiple agents (e.g., `EntityScout` and `GraphBuilder`).
-   Load or stress testing.

## 3. Test Strategy

### 3.1. Integration Testing (No-Mocking Policy)

As per project constraints, this test plan adheres to a strict **'no-mocking'** policy. All tests will be implemented as integration tests that verify the `EntityScout` agent's interactions with live, external services.

This means that instead of mocking the `LLMClient` or the filesystem, tests will--
1.  Interact with the **actual filesystem** by reading predefined test files.
2.  Make **real API calls** to the configured Large Language Model (LLM).

While this approach deviates from pure London School TDD (which favors mocking collaborators), it maintains the core principle of **testing observable outcomes of interactions**. The "collaborators" are the live LLM API and the filesystem, and we will verify that the `EntityScout` agent correctly handles the real-world responses and conditions from these collaborators.

### 3.2. AI Verifiable Outcomes

Each test is designed to verify an AI-actionable outcome. The primary verifiable outcome for the `EntityScout` agent is the generation of a `FileAnalysisReport` object. Test assertions will focus on the `status`, `pois` array, `error` message, and `analysisAttempts` properties of this report, ensuring they match the expected state for a given input.

## 4. Recursive Testing (Regression) Strategy

A multi-layered recursive testing strategy will be employed to ensure continuous stability and catch regressions early. Tests will be tagged to run in different scopes.

-- **Suite** -- **Tag** -- **Trigger** -- **Description** --
-- Full Suite -- (none) -- Pre-commit/Pre-merge to `main` -- Executes all `EntityScout` tests. This is the final quality gate before code enters the main branch. --
-- Core Functionality -- `@core` -- On every Pull Request -- A fast-running subset of tests covering the happy path (`COMPLETED_SUCCESS`) and the critical self-correction logic (success on retry, graceful failure). --
-- Error & Edge Cases -- `@error-handling` -- Nightly build or on-demand -- Covers all non-success status codes (`SKIPPED_*`, `FAILED_*`) and edge case file inputs (e.g., empty files, binary files). --
-- Sanitizer Logic -- `@sanitizer` -- On changes to `LLMResponseSanitizer.js` -- A focused set of tests for the `LLMResponseSanitizer` module to verify its cleaning functions independently. --

This layered approach balances rapid feedback during development with comprehensive validation before release.

## 5. Test Environment and Data

### 5.1. Test Environment

-   Node.js environment capable of running the agent.
-   A valid API key for the configured LLM (`deepseek-coder`) must be available as an environment variable.
-   A dedicated test directory (`/tests/test-data/entity-scout/`) containing the necessary test files.

### 5.2. Test Data

The following files must be created in the test data directory:

-- **File** -- **Description** --
-- `simple.js` -- A small JavaScript file with a few distinct functions and classes. Used for happy-path testing. --
-- `large_file.txt` -- A text file exceeding the `maxFileSize` configuration (e.g., > 1MB). --
-- `empty.js` -- An empty (0-byte) file. --
-- `non_existent_file.js` -- A file path that does not exist on the filesystem. --
-- `malformed_json_response.txt` -- A text file containing a JSON snippet with trailing commas, to be used for testing the sanitizer. --
-- `conversational_response.txt` -- A text file containing a JSON object wrapped in conversational text (e.g., "Sure, here is the JSON you requested-- ..."). --

## 6. Test Cases

### 6.1. `EntityScout` Core Functionality

-- **ID** -- **Description** -- **TDD Anchor(s)** -- **Expected Outcome** -- **Regression Scope** --
-- ES-001 -- Analyzes a simple, valid file and succeeds on the first attempt. -- `_analyzeFileContent` happy path, `run` success report -- `FileAnalysisReport` with `status: 'COMPLETED_SUCCESS'`, `pois` array is not empty, `analysisAttempts: 1`. -- `@core` --
-- ES-002 -- Attempts to analyze a file that is too large. -- `run` -- `FileAnalysisReport` with `status: 'SKIPPED_FILE_TOO_LARGE'`, `pois` is empty, `error` message is set. -- `@error-handling` --
-- ES-003 -- Attempts to analyze a file that does not exist. -- `run` file read error -- `FileAnalysisReport` with `status: 'FAILED_FILE_NOT_FOUND'`, `pois` is empty, `error` message is set. -- `@error-handling` --
-- ES-004 -- Handles an empty file gracefully. -- `run` success report -- `FileAnalysisReport` with `status: 'COMPLETED_SUCCESS'`, `pois` array is empty, `analysisAttempts: 1`. -- `@core` --
-- ES-005 -- Correctly calculates a SHA256 checksum for a file. -- `_calculateChecksum` known string -- The `fileChecksum` in the report matches a pre-calculated SHA256 hash of `simple.js`. -- `@core` --

### 6.2. Resilient Retry Logic (Integration with Live LLM)

**Note:** These tests are probabilistic and may require careful handling in the test runner. The goal is to verify the *logic* of the retry loop. This will be achieved by using carefully crafted prompts in the test that are designed to make the real LLM fail in predictable ways.

-- **ID** -- **Description** -- **TDD Anchor(s)** -- **Expected Outcome** -- **Regression Scope** --
-- ES-006 -- Simulates an LLM response that fails validation once, then succeeds on the second attempt with the correction prompt. -- `_analyzeFileContent` retry and succeed -- `FileAnalysisReport` with `status: 'COMPLETED_SUCCESS'`, `pois` is not empty, `analysisAttempts: 2`. -- `@core` --
-- ES-007 -- Simulates an LLM that consistently returns invalid data, exhausting all retries. -- `_analyzeFileContent` exhaust retries -- `FileAnalysisReport` with `status: 'FAILED_VALIDATION_ERROR'`, `pois` is empty, `analysisAttempts` equals `maxRetries + 1`. -- `@core` --

### 6.3. `LLMResponseSanitizer` Module

-- **ID** -- **Description** -- **TDD Anchor(s)** -- **Expected Outcome** -- **Regression Scope** --
-- SAN-001 -- Sanitizer correctly removes trailing commas from a JSON string. -- `sanitize` trailing commas -- The sanitizer function returns a string that can be successfully parsed into a JSON object. -- `@sanitizer` --
-- SAN-002 -- Sanitizer correctly extracts a JSON object from a string containing conversational text. -- `sanitize` extract from markdown/text -- The sanitizer function returns only the JSON part of the string. -- `@sanitizer` --
-- SAN-003 -- Sanitizer returns an unchanged string when given a perfectly valid JSON string. -- `sanitize` perfect JSON -- The output of the sanitizer is identical to the input. -- `@sanitizer` --

### 6.4. AI Verifiable Completion Criteria

-   **Phase Completion:** This test planning phase is complete when this document, `EntityScout_agent_test_plan.md`, is created and saved in the `docs/test-plans/` directory.
-   **Test Implementation Completion:** The subsequent implementation phase is complete when all test cases defined in this document are implemented as automated tests and are passing.