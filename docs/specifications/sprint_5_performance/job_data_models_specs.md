# Specification: Job Data Models

**Sprint:** 5 - Performance Refactoring
**Purpose:** To define the data structures (payloads) for jobs that will be placed on the BullMQ queues.

---

## 1. `file-analysis-queue` Job Model

This queue handles the analysis of a single source code file.

### **Job Name:** `analyze-file`

### **Payload Structure:**

```json
{
  "filePath": "path/to/the/file.js"
}
```

### **Field Descriptions:**

*   `filePath`
    *   **Type:** `string`
    *   **Required:** Yes
    *   **Description:** The absolute or relative path to the file that needs to be analyzed by the `FileAnalysisWorker`.

---

## 2. `relationship-resolution-queue` Job Models

This queue is more versatile and handles multiple job types related to higher-level analysis and pipeline orchestration. The job type is determined by a `type` field in the payload.

### **Job Type 1: Sentinel Job**

*   **Job Name:** `start-graph-build`
*   **Purpose:** A sentinel job that signals the completion of all preceding tasks for a specific run, triggering the final aggregation step.

### **Payload Structure:**

```json
{
  "type": "start-graph-build",
  "runId": "a-unique-identifier-for-the-sprint-run"
}
```

### **Field Descriptions:**

*   `type`
    *   **Type:** `string`
    *   **Required:** Yes
    *   **Value:** Must be `"start-graph-build"`.
*   `runId`
    *   **Type:** `string`
    *   **Required:** Yes
    *   **Description:** A unique identifier (e.g., a UUID) that correlates all jobs within a single execution of the entire pipeline. This is crucial for tracking and ensuring the correct `GraphBuilder` is triggered.

---

## 3. Edge Cases and Constraints

*   **Data Validation:** All worker processes must validate the incoming job payload to ensure it contains the required fields and correct data types before processing. A corrupted or invalid payload should result in the job being moved to a "failed" state with a descriptive error.
*   **Extensibility:** The use of a `type` field in the `relationship-resolution-queue` is intentional to allow for future expansion (e.g., adding jobs for inter-directory analysis) without requiring new queues.