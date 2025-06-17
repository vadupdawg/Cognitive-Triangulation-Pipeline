# Granular Production Test Results

## Execution Summary

The execution of the granular production-ready test suite resulted in a complete failure across all tests for `ScoutAgent`, `WorkerAgent`, and `GraphIngestorAgent`. The issues stem from a combination of incorrect method calls, path traversal errors, and database schema mismatches.

## Full Test Output

```
> test
> jest tests/granular/

FAIL  tests/granular/ScoutAgent.test.js
  ● Console

    console.log
      Initializing database...

      at log (src/utils/initializeDb.js:61:11)

    console.log
      Database initialized successfully.

      at log (src/utils/initializeDb.js:68:11)

  ● ScoutAgent Integration Tests › Initial Repository Scan › SCOUT-PROD-001: Agent processes a repository with several new files on the first run.

    TypeError: this.fileSystem.getAllFiles is not a function

      43 |     async scan() {
      44 |         const currentState = new Map();
    > 45 |         const allFiles = this.fileSystem.getAllFiles();
         |                                          ^
      46 |         const processingPromises = [];
      47 |
      48 |         for (const filePath of allFiles) {

      at RepositoryScanner.getAllFiles (src/agents/ScoutAgent.js:45:42)
      at ScoutAgent.scan (src/agents/ScoutAgent.js:226:63)

  ● ScoutAgent Integration Tests › Initial Repository Scan › SCOUT-PROD-002: Agent correctly ignores files based on exclusion patterns.

    TypeError: this.fileSystem.getAllFiles is not a function

      43 |     async scan() {
      44 |         const currentState = new Map();
    > 45 |         const allFiles = this.fileSystem.getAllFiles();
         |                                          ^
      46 |         const processingPromises = [];
      47 |
      48 |         for (const filePath of allFiles) {

      at RepositoryScanner.getAllFiles (src/agents/ScoutAgent.js:45:42)
      at ScoutAgent.scan (src/agents/ScoutAgent.js:226:63)

  ● ScoutAgent Integration Tests › Incremental Updates › SCOUT-PROD-003: Agent correctly identifies and queues a single new file.

    TypeError: this.fileSystem.getAllFiles is not a function

      43 |     async scan() {
      44 |         const currentState = new Map();
    > 45 |         const allFiles = this.fileSystem.getAllFiles();
         |                                          ^
      46 |         const processingPromises = [];
      47 |
      48 |         for (const filePath of allFiles) {

      at RepositoryScanner.getAllFiles (src/agents/ScoutAgent.js:45:42)
      at ScoutAgent.scan (src/agents/ScoutAgent.js:226:63)

  ● ScoutAgent Integration Tests › Incremental Updates › SCOUT-PROD-004: Agent correctly identifies and queues a single modified file.

    TypeError: this.fileSystem.getAllFiles is not a function

      43 |     async scan() {
      44 |         const currentState = new Map();
    > 45 |         const allFiles = this.fileSystem.getAllFiles();
         |                                          ^
      46 |         const processingPromises = [];
      47 |
      48 |         for (const filePath of allFiles) {

      at RepositoryScanner.getAllFiles (src/agents/ScoutAgent.js:45:42)
      at ScoutAgent.scan (src/agents/ScoutAgent.js:226:63)

  ● ScoutAgent Integration Tests › Incremental Updates › SCOUT-PROD-005: Agent correctly identifies and queues a single deleted file.

    TypeError: this.fileSystem.getAllFiles is not a function

      43 |     async scan() {
      44 |         const currentState = new Map();
    > 45 |         const allFiles = this.fileSystem.getAllFiles();
         |                                          ^
      46 |         const processingPromises = [];
      47 |
      48 |         for (const filePath of allFiles) {

      at RepositoryScanner.getAllFiles (src/agents/ScoutAgent.js:45:42)
      at ScoutAgent.scan (src/agents/ScoutAgent.js:226:63)

FAIL  tests/granular/WorkerAgent.test.js
  ● Console

    console.log
      Initializing database...

      at log (src/utils/initializeDb.js:61:11)

    console.log
      Database initialized successfully.

      at log (src/utils/initializeDb.js:68:11)

  ● WorkerAgent Integration Tests › Successful Task Processing › WORKER-PROD-001: Processes a task with a valid file and golden LLM response

    expect(received).toBeDefined()

    Received: undefined

      56 |
      57 |             const analysisResult = await db.querySingle('SELECT * FROM analysis_results WHERE work_item_id = ?', [task.id]);
    > 58 |             expect(analysisResult).toBeDefined();
         |                                    ^
      59 |             expect(JSON.parse(analysisResult.llm_output)).toEqual(goldenResponse);
      60 |
      61 |             const workItem = await db.querySingle('SELECT * FROM work_queue WHERE id = ?', [task.id]);

      at toBeDefined (tests/granular/WorkerAgent.test.js:58:36)

  ● WorkerAgent Integration Tests › Error Handling › WORKER-PROD-002: Handles a file that does not exist

    expect(received).toContain(expected) // indexOf

    Expected substring: "File not found at path"
    Received string:    "An unexpected error occurred: Path traversal attempt detected: C:\\Users\\hotra\\AppData\\Local\\Temp\\worker-test-ZxFC0G\\nonexistent.js"

      72 |             const failedWork = await db.querySingle('SELECT * FROM failed_work WHERE work_item_id = ?', [task.id]);
      73 |             expect(failedWork).toBeDefined();
    > 74 |             expect(failedWork.error_message).toContain('File not found at path');
         |                                              ^
      75 |         });
      76 |
      77 |         test('WORKER-PROD-003: Handles LLM call failure', async () => {

      at toContain (tests/granular/WorkerAgent.test.js:74:46)

  ● WorkerAgent Integration Tests › Error Handling › WORKER-PROD-003: Handles LLM call failure

    expect(received).toContain(expected) // indexOf

    Expected substring: "LLM call failed"
    Received string:    "An unexpected error occurred: Path traversal attempt detected: C:\\Users\\hotra\\AppData\\Local\\Temp\\worker-test-ePX8gv\\test.js"

      83 |             const failedWork = await db.querySingle('SELECT * FROM failed_work WHERE work_item_id = ?', [task.id]);
      84 |             expect(failedWork).toBeDefined();
    > 85 |             expect(failedWork.error_message).toContain('LLM call failed');
         |                                              ^
      86 |         });
      87 |
      88 |         test('WORKER-PROD-004: Handles invalid JSON response from LLM', async () => {

      at toContain (tests/granular/WorkerAgent.test.js:85:46)

  ● WorkerAgent Integration Tests › Error Handling › WORKER-PROD-004: Handles invalid JSON response from LLM

    expect(received).toContain(expected) // indexOf

    Expected substring: "Response is not valid JSON"
    Received string:    "An unexpected error occurred: Path traversal attempt detected: C:\\Users\\hotra\\AppData\\Local\\Temp\\worker-test-R4Cozh\\test.js"

      94 |             const failedWork = await db.querySingle('SELECT * FROM failed_work WHERE work_item_id = ?', [task.id]);
      95 |             expect(failedWork).toBeDefined();
    > 96 |             expect(failedWork.error_message).toContain('Response is not valid JSON');
         |                                              ^
      97 |         });
      98 |     });
      99 | });

      at toContain (tests/granular/WorkerAgent.test.js:96:46)

FAIL  tests/granular/GraphIngestorAgent.test.js
  ● Console

    console.log
      Initializing database...

      at log (src/utils/initializeDb.js:61:11)

    console.log
      Database initialized successfully.

      at log (src/utils/initializeDb.js:68:11)

  ● GraphIngestorAgent Integration Tests › Successful Ingestion › GRAPH-PROD-001: Ingests a single, simple analysis result correctly

    SQLITE_ERROR: table analysis_results has no column named llm_output_hash

      at formatError (node_modules/sqlite/src/utils/format-error.ts:7:22)
      at node_modules/sqlite/src/Database.ts:122:36
      at Statement.errBack (node_modules/sqlite3/lib/sqlite3.js:15:21)

  ● GraphIngestorAgent Integration Tests › Successful Ingestion › GRAPH-PROD-002: Ingests an analysis result with entities and relationships

    SQLITE_ERROR: table analysis_results has no column named llm_output_hash

      at formatError (node_modules/sqlite/src/utils/format-error.ts:7:22)
      at node_modules/sqlite/src/Database.ts:122:36
      at Statement.errBack (node_modules/sqlite3/lib/sqlite3.js:15:21)

  ● GraphIngestorAgent Integration Tests › Error Handling › GRAPH-PROD-003: Handles invalid JSON in the database gracefully

    SQLITE_ERROR: table analysis_results has no column named llm_output_hash

      at formatError (node_modules/sqlite/src/utils/format-error.ts:7:22)
      at node_modules/sqlite/src/Database.ts:122:36
      at Statement.errBack (node_modules/sqlite3/lib/sqlite3.js:15:21)

Test Suites: 3 failed, 3 total
Tests:       12 failed, 12 total
Snapshots:   0 total
Time:        3.252 s
Ran all test suites matching /tests\/granular/.