# Granular Test Plan-- WorkerAgent

## 1. Introduction and Scope

This document provides a detailed, granular test plan for the `WorkerAgent` module. The primary objective of these tests is to verify the successful implementation of the requirements outlined in the [`docs/specifications/worker_agent_specs.md`](docs/specifications/worker_agent_specs.md) and to ensure the agent contributes correctly to the AI-Verifiable End Results for Phase 2 as defined in the [`docs/primary_project_planning_document.md`](docs/primary_project_planning_document.md).

Specifically, this plan targets the following AI-Verifiable End Result--
*   The `WorkerAgent` populates the `analysis_results` table in SQLite with 15 records.
*   The aggregated JSON in these records contains the exact counts of entities and relationships required to match the ground truth report.

This plan adheres to a **state-based verification strategy** ('classicist' TDD), where tests assert the final state of the database after an action is performed, rather than mocking collaborators.

## 2. Test Strategy

### 2.1. State-Based Verification

All tests will follow a strict "Arrange, Act, Assert" pattern.

1.  **Arrange**: The test setup will involve preparing the SQLite database to a specific, known state. This includes inserting records into the `files` table with various statuses (`pending`, `completed`, `error`) and content.
2.  **Act**: A specific `WorkerAgent` method will be invoked.
3.  **Assert**: After the method completes, the test will query the database to verify that the state has changed as expected. Assertions will be made against the data in the `files` and `analysis_results` tables.

### 2.2. Test Data

A dedicated test utility will be used to manage the test database state. Key test data will include--
*   Sample source code files for each supported language (JavaScript, Python, Java, SQL) that contain a known set of entities and relationships.
*   An empty file.
*   A file with syntax errors.
*   Database entries in the `files` table corresponding to the above files.

### 2.3. AI Verifiable Criteria

Every test case defined in this plan concludes with an "AI Verifiable Completion Criterion." This is typically an SQL query that, when executed, must return a specific, predictable value (e.g., a count of 1, a status string of 'completed') to confirm the test has passed.

## 3. Recursive Testing (Regression) Strategy

A robust regression strategy is crucial to maintain stability. Tests will be tagged to allow for flexible execution scopes.

### 3.1. Test Tags

*   `@core`-- Tests for the fundamental agent logic (`run`, `getNextFile`, `processFile`).
*   `@parser`-- A general tag for all language parser tests.
*   `@javascript`, `@python`, `@java`, `@sql`-- Language-specific parser tags.
*   `@edge-case`-- Tests for non-standard scenarios like empty files, errors, etc.
*   `@database`-- Tests that verify direct database interactions (`saveResult`, `updateFileStatus`).

### 3.2. Regression Triggers and Scopes

*   **On-Commit Hook (to feature branch)**--
    *   **Scope**: Smoke Test
    *   **Command**: `npm test -- --tags @core @database`
    *   **Purpose**: A fast check to ensure no core logic was broken during development.
*   **On-Pull Request (to `main`)**--
    *   **Scope**: Full Core and Modified Parser Tests
    *   **Command**: `npm test -- --tags @core @database @edge-case` plus any language tags (`@javascript`, etc.) relevant to the files changed in the PR.
    *   **Purpose**: A more thorough check before merging, focusing on the changed components.
*   **Pre-Release/Nightly Build**--
    *   **Scope**: Full Regression Suite
    *   **Command**: `npm test` (runs all tests)
    *   **Purpose**: To ensure the entire system is stable and no unintended side-effects have been introduced.

## 4. Test Cases

---

### 4.1. Core Agent Logic

#### **`constructor()`**

*   **Test Case ID**: WA-C-001
*   **Description**: Verify that the constructor correctly initializes the agent's properties.
*   **AI Verifiable End Result Targeted**: Supports Task 2.1 (`WorkerAgent` Core).
*   **Initial State**: None.
*   **Action**: `const agent = new WorkerAgent(mockDb, 'worker-1');`
*   **Expected Final State**: The `agent` object has `db`, `workerId`, and `languageHandlers` properties set correctly.
*   **AI Verifiable Completion Criterion**: Programmatic check `agent.db === mockDb && agent.workerId === 'worker-1' && agent.languageHandlers['JavaScript']` is not undefined.
*   **Recursive Testing Tags**: `@core`

#### **`getNextFile()`**

*   **Test Case ID**: WA-GNF-001
*   **Description**: When a 'pending' file exists, it should be returned and its status updated to 'processing'.
*   **AI Verifiable End Result Targeted**: Task 2.1 (`WorkerAgent` Core).
*   **Initial State**: `files` table contains one row with `id=1`, `status='pending'`.
*   **Action**: `const file = await agent.getNextFile();`
*   **Expected Final State**: `file.id` is 1. The row in `files` with `id=1` now has `status='processing'` and `worker_id='worker-1'`.
*   **AI Verifiable Completion Criterion**: `SELECT count(*) FROM files WHERE id = 1 AND status = 'processing' AND worker_id = 'worker-1';` returns `1`.
*   **Recursive Testing Tags**: `@core`, `@database`

*   **Test Case ID**: WA-GNF-002
*   **Description**: When no 'pending' files exist, the function should return null.
*   **AI Verifiable End Result Targeted**: Task 2.1 (`WorkerAgent` Core).
*   **Initial State**: `files` table contains no rows with `status='pending'`.
*   **Action**: `const file = await agent.getNextFile();`
*   **Expected Final State**: `file` is null. The database state is unchanged.
*   **AI Verifiable Completion Criterion**: Programmatic check `file === null`.
*   **Recursive Testing Tags**: `@core`, `@edge-case`

#### **`processFile()`**

*   **Test Case ID**: WA-PF-001
*   **Description**: On successful parsing, `processFile` should update the file status to 'completed' and save the result.
*   **AI Verifiable End Result Targeted**: Task 2.1, Task 2.2, and the primary Phase 2 goal.
*   **Initial State**: `files` table has one row with `id=1`, `file_path` pointing to a valid JS file, `language='JavaScript'`, `status='processing'`. `analysis_results` table is empty.
*   **Action**: `await agent.processFile({ id: 1, file_path: 'path/to/test.js', language: 'JavaScript' });`
*   **Expected Final State**:
    1.  The `files` table row with `id=1` has `status='completed'`.
    2.  The `analysis_results` table has one new row with `file_id=1`, `worker_id='worker-1'`, and a non-empty `result` JSON string.
*   **AI Verifiable Completion Criterion**:
    1.  `SELECT status FROM files WHERE id = 1;` returns `'completed'`.
    2.  `SELECT count(*) FROM analysis_results WHERE file_id = 1;` returns `1`.
*   **Recursive Testing Tags**: `@core`, `@parser`, `@javascript`

*   **Test Case ID**: WA-PF-002
*   **Description**: If no language handler is found, `processFile` should update the file status to 'error'.
*   **AI Verifiable End Result Targeted**: Task 2.1 (`WorkerAgent` Core).
*   **Initial State**: `files` table has one row with `id=1`, `language='UnsupportedLang'`, `status='processing'`.
*   **Action**: `await agent.processFile({ id: 1, language: 'UnsupportedLang' });`
*   **Expected Final State**: The `files` table row with `id=1` has `status='error'`. `analysis_results` table is empty.
*   **AI Verifiable Completion Criterion**: `SELECT status FROM files WHERE id = 1;` returns `'error'`.
*   **Recursive Testing Tags**: `@core`, `@edge-case`

*   **Test Case ID**: WA-PF-003
*   **Description**: If the parser throws an error (e.g., syntax error in the file), `processFile` should update the file status to 'error'.
*   **AI Verifiable End Result Targeted**: Task 2.1 (`WorkerAgent` Core).
*   **Initial State**: `files` table has one row with `id=1`, `file_path` pointing to a JS file with syntax errors, `language='JavaScript'`, `status='processing'`.
*   **Action**: `await agent.processFile({ id: 1, file_path: 'path/to/bad_syntax.js', language: 'JavaScript' });`
*   **Expected Final State**: The `files` table row with `id=1` has `status='error'`. `analysis_results` table is empty.
*   **AI Verifiable Completion Criterion**: `SELECT status FROM files WHERE id = 1;` returns `'error'`.
*   **Recursive Testing Tags**: `@core`, `@edge-case`, `@parser`, `@javascript`

---

### 4.2. Language Parsers

The goal for each parser is to produce a JSON structure that correctly identifies entities and relationships as per the ground truth analysis.

#### **`parseJavaScript()`**

*   **Test Case ID**: WA-PJS-001
*   **Description**: Should identify all function declarations, classes, `require` imports, and `module.exports`.
*   **AI Verifiable End Result Targeted**: Task 2.2 and the primary Phase 2 goal.
*   **Initial State**: A JS file `polyglot-test/js/server.js` with known contents.
*   **Action**: `const result = agent.parseJavaScript(fs.readFileSync('polyglot-test/js/server.js', 'utf8'), 'polyglot-test/js/server.js');`
*   **Expected Final State**: The `result` object contains the exact `entities` (functions, classes) and `relationships` (IMPORTS, EXPORTS, CALLS) that match a pre-defined "golden" JSON structure for that file.
*   **AI Verifiable Completion Criterion**: A deep equality check `assert.deepStrictEqual(result, goldenJson)` passes.
*   **Recursive Testing Tags**: `@parser`, `@javascript`

#### **`parsePython()`**

*   **Test Case ID**: WA-PPY-001
*   **Description**: Should identify all function/method definitions, classes, `import` statements, and `EXTENDS` relationships.
*   **AI Verifiable End Result Targeted**: Task 2.2 and the primary Phase 2 goal.
*   **Initial State**: A Python file `polyglot-test/python/data_processor.py` with known contents.
*   **Action**: `const result = agent.parsePython(fs.readFileSync('polyglot-test/python/data_processor.py', 'utf8'), 'polyglot-test/python/data_processor.py');`
*   **Expected Final State**: The `result` object contains the exact `entities` and `relationships` that match a pre-defined "golden" JSON structure.
*   **AI Verifiable Completion Criterion**: A deep equality check `assert.deepStrictEqual(result, goldenJson)` passes.
*   **Recursive Testing Tags**: `@parser`, `@python`

#### **`parseJava()`**

*   **Test Case ID**: WA-PJV-001
*   **Description**: Should identify all class/interface/method definitions, `import` statements, `extends`, and `implements` relationships.
*   **AI Verifiable End Result Targeted**: Task 2.2 and the primary Phase 2 goal.
*   **Initial State**: A Java file `polyglot-test/java/ApiClient.java` with known contents.
*   **Action**: `const result = agent.parseJava(fs.readFileSync('polyglot-test/java/ApiClient.java', 'utf8'), 'polyglot-test/java/ApiClient.java');`
*   **Expected Final State**: The `result` object contains the exact `entities` and `relationships` that match a pre-defined "golden" JSON structure.
*   **AI Verifiable Completion Criterion**: A deep equality check `assert.deepStrictEqual(result, goldenJson)` passes.
*   **Recursive Testing Tags**: `@parser`, `@java`

#### **`parseSql()`**

*   **Test Case ID**: WA-PSQL-001
*   **Description**: Should identify `CREATE TABLE` statements as Table entities and `FOREIGN KEY` constraints as `USES` relationships.
*   **AI Verifiable End Result Targeted**: Task 2.2 and the primary Phase 2 goal.
*   **Initial State**: An SQL file `polyglot-test/database/schema.sql` with known contents.
*   **Action**: `const result = agent.parseSql(fs.readFileSync('polyglot-test/database/schema.sql', 'utf8'), 'polyglot-test/database/schema.sql');`
*   **Expected Final State**: The `result` object contains the exact `entities` (Tables) and `relationships` (USES) that match a pre-defined "golden" JSON structure.
*   **AI Verifiable Completion Criterion**: A deep equality check `assert.deepStrictEqual(result, goldenJson)` passes.
*   **Recursive Testing Tags**: `@parser`, `@sql`

---