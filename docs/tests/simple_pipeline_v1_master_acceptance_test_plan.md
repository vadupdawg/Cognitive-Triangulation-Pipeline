# Master Acceptance Test Plan-- Simplicity-First Pipeline v1

**Version--** 1.1
**Date--** 2025-06-27
**Status--** Revised

---

## 1. Introduction

This document outlines the Master Acceptance Test Plan for the "Simplicity-First" pipeline enhancements. The primary goal of this test plan is to define the ultimate success criteria for the project by validating the core objectives identified in the `architectural_pivot_research_report.md` and detailed in the project's specifications.

The two pillars of this enhancement are--
1.  **Increased LLM Client Throughput--** By implementing a semaphore-based concurrency manager in the `DeepSeekClient`.
2.  **Reduced Queue Overhead--** By batching multiple Points of Interest (POIs) from a single file analysis into a single job.

These tests are designed to be broad, end-to-end, and user-centric. They focus on verifying the complete system flow and integration from an external perspective, ensuring that the final product meets the high-level goals of performance and efficiency. Each test has a clear, AI-verifiable completion criterion.

## 2. Scope

### 2.1. In Scope

*   End-to-end validation of the LLM client concurrency controls.
*   End-to-end validation of the relationship resolution job batching mechanism.
*   Verification of system stability and data integrity under the new architecture.
*   Validation of failure resilience and resource management (e.g., semaphore release) under error conditions.

### 2.2. Out of Scope

*   Unit testing of individual components (these are covered in their respective development tasks).
*   Performance benchmarking beyond the specified acceptance criteria.
*   Testing of any system components not directly impacted by the concurrency and batching changes.

## 3. Testing Strategy

The strategy for this plan is black-box, end-to-end testing. We will treat the pipeline as a whole and focus on its external behavior and outputs. The tests will be automated and will rely on a controlled environment with mock services to ensure deterministic and repeatable results.

*   **Mock LLM API--** A mock server will be used to simulate the DeepSeek API. This allows us to control responses, simulate failures, and, crucially, to monitor the number of concurrent requests it receives.
*   **In-Memory Queues & DB--** In-memory versions of the queue system and databases will be used to isolate the tests and inspect their state directly.

## 4. High-Level Acceptance Tests

These tests represent the definitive success criteria for the project.

---

### AT-01-- LLM Client High-Concurrency Throughput

*   **Objective--** To verify that the new semaphore-based concurrency manager in `DeepSeekClient` correctly limits concurrent API calls, preventing system overload while maximizing throughput. This directly validates the requirements in `llm_client_concurrency_specs.md`.
*   **Scenario--**
    1.  Configure the `DeepSeekClient` with a maximum concurrency of **4**.
    2.  Simultaneously trigger **10** independent file analysis processes, each designed to make one call to the LLM.
    3.  The mock LLM API is configured to introduce a small delay to simulate real network latency, ensuring requests overlap.
*   **Expected Outcome--**
    1.  All 10 analysis processes complete successfully without deadlocks or errors.
    2.  The mock LLM API server never receives more than 4 requests in parallel at any given moment.
    3.  The final output data (e.g., in the database) is correct and complete for all 10 processes.
*   **AI-Verifiable Completion Criterion--**
    *   An automated test script will assert that a counter, instrumenting the mock LLM API, never exceeds a peak value of **4**.
    *   The test will assert that the final count of successfully processed items in the test database is exactly **10**.

---

### AT-02-- Relationship Resolution Job Batching

*   **Objective--** To verify that the `TransactionalOutboxPublisher` correctly batches all POIs from a single file into one job, drastically reducing queue volume. This validates the goals of `job_batching_specs.md`.
*   **Scenario--**
    1.  Trigger a single file analysis on a source file that is known to contain exactly **7** POIs.
*   **Expected Outcome--**
    1.  Exactly **1** job is created and enqueued in the `relationship-resolution-queue`.
    2.  The payload of this single job contains an array of POIs of length 7.
    3.  The `RelationshipResolutionWorker` successfully processes all 7 POIs from this single job.
*   **AI-Verifiable Completion Criterion--**
    *   An automated test script will inspect the `relationship-resolution-queue` after the analysis and assert that its length is **1**.
    *   The script will then dequeue this job, parse its data payload, and assert that `payload.pois.length` is equal to **7**.
    *   The test will monitor a mock relationship resolver and assert that it was invoked exactly **7** times.

---

### AT-03-- Full Pipeline Integrity Under Load

*   **Objective--** To perform a holistic, end-to-end test that validates the integration and correctness of both the concurrency and batching features working together. This test replaces the previous brittle "golden master" count with specific relationship validation.
*   **Scenario--**
    1.  Trigger a full analysis of a small-scale test project containing specific, known POIs that should result in predictable relationships.
    2.  The mock `RelationshipResolutionWorker` is configured to produce a known set of relationships for specific inputs.
    3.  The `DeepSeekClient` is configured with a maximum concurrency of **2**.
*   **Expected Outcome--**
    1.  The entire analysis completes without errors.
    2.  The mock LLM API never handles more than 2 concurrent requests.
    3.  The final database contains specific, expected relationships that are known to exist in the source data. For example, a relationship `(functionA) --[CALLS]-->(functionB)`.
*   **AI-Verifiable Completion Criterion--**
    *   The test script will assert that the peak concurrency measured at the mock LLM API was no greater than **2**.
    *   The script will query the final state of the mock database and assert the existence of several predefined, specific relationships. For example-- `expect(db.hasRelationship('functionA', 'CALLS', 'functionB')).toBe(true)`. This validates correctness, not just quantity.

---

### AT-04-- Concurrency Failure Resilience

*   **Objective--** To verify that the concurrency semaphore is correctly released even when a concurrent LLM request fails, preventing system deadlocks. This directly addresses the test coverage gap identified in the Devil's Advocate critique.
*   **Scenario--**
    1.  Configure the `DeepSeekClient` with a maximum concurrency of **2**.
    2.  Configure the mock LLM API to throw a server error for the *first* request it receives, but respond successfully to all subsequent requests.
    3.  Simultaneously trigger **3** independent analysis processes.
*   **Expected Outcome--**
    1.  The first analysis process fails and logs an error, as expected.
    2.  The other **2** analysis processes complete successfully.
    3.  The system does not hang or deadlock; the semaphore is released from the failed request, allowing the other requests to proceed.
*   **AI-Verifiable Completion Criterion--**
    *   The test script will assert that the number of successfully completed analysis processes is exactly **2**.
    *   The test will assert that the mock LLM API was invoked **3** times in total.
    *   The test will assert that the final count of successfully processed items in the database is equal to the total from the non-failing processes. The test must complete within a reasonable timeout, proving no deadlock occurred.