# Cognitive Triangulation -- High-Level Acceptance Tests

This document defines the high-level, end-to-end acceptance tests for the Cognitive Triangulation refactor. Each test case represents a critical user-facing outcome and is designed with an AI-verifiable completion criterion.

---

### Test ID: A-CT-01
**Title**: Verify Confidence Score Generation
**Objective**: To confirm that every relationship identified by the analysis pipeline is assigned a numerical confidence score.
**User Story**: [1.1: Confidence-Scored Relationships](../../specifications/user_stories/cognitive_triangulation_user_stories.md#story-11-confidence-scored-relationships)
**Preconditions**:
- The "Ground Truth" test repository is available.
- The analysis pipeline is configured to run on this repository.
**Test Steps**:
1. Trigger a full analysis run on the "Ground Truth" repository.
2. Wait for the analysis pipeline to complete successfully.
3. Query the Neo4j database for all generated relationships.
**Expected Result (AI Verifiable Criterion)**:
- A Cypher query `MATCH ()-[r]->() RETURN count(r) AS total, count(r.confidenceScore) AS scored` returns two values that are equal and greater than zero. This verifies that every relationship has the `confidenceScore` property.

---

### Test ID: A-CT-02
**Title**: Verify Evidence Trail Accessibility
**Objective**: To ensure that the evidence contributing to a confidence score is recorded and accessible.
**User Story**: [1.2: Evidence Inspection](../../specifications/user_stories/cognitive_triangulation_user_stories.md#story-12-evidence-inspection)
**Preconditions**:
- A-CT-01 has passed.
- The SQLite database is accessible.
**Test Steps**:
1. Identify a specific, known relationship from the "Ground Truth" repository run.
2. Query the SQLite database for the evidence record associated with that relationship.
3. Inspect the retrieved record.
**Expected Result (AI Verifiable Criterion)**:
- The SQLite query `SELECT evidence FROM relationship_evidence WHERE relationship_id = ?` returns a non-empty, structured (e.g., JSON) payload. The payload must contain keys corresponding to at least two different analysis passes (e.g., `file_analysis_pass`, `directory_resolution_pass`) and their respective findings.

---

### Test ID: A-CT-03
**Title**: Verify Peer-Review Agreement Boost
**Objective**: To confirm that a relationship's confidence score is boosted when multiple analysis passes agree.
**User Story**: [2.1: Peer-Reviewed Analysis](../../specifications/user_stories/cognitive_triangulation_user_stories.md#story-21-peer-reviewed-analysis)
**Preconditions**:
- The "Ground Truth" repository contains a clear, unambiguous relationship that should be detected by multiple agents.
- The analysis pipeline has been run.
**Test Steps**:
1. Identify the known, unambiguous relationship in the Neo4j graph.
2. Retrieve its `confidenceScore`.
3. Retrieve its evidence from the SQLite database (as in A-CT-02).
**Expected Result (AI Verifiable Criterion)**:
- The `confidenceScore` for the relationship must be greater than a high threshold (e.g., > 0.9).
- The evidence payload must show agreement between the analysis passes (e.g., both passes identified the relationship).
- This meets the "Percentage of known 'true positives' receiving a score boost" metric.

---

### Test ID: A-CT-04
**Title**: Verify Peer-Review Disagreement Penalty
**Objective**: To ensure that a relationship's confidence score is lowered and the conflict is logged when analysis passes disagree.
**User Story**: [2.2: Discrepancy Flagging](../../specifications/user_stories/cognitive_triangulation_user_stories.md#story-22-discrepancy-flagging)
**Preconditions**:
- The "Ambiguity" repository is used, containing a relationship designed to cause disagreement.
- The analysis pipeline has been run.
**Test Steps**:
1. Identify the known, ambiguous relationship in the Neo4j graph.
2. Retrieve its `confidenceScore`.
3. Query the structured logs for a discrepancy entry related to this relationship.
**Expected Result (AI Verifiable Criterion)**:
- The `confidenceScore` for the relationship must be below a low threshold (e.g., < 0.3).
- A structured log entry (e.g., JSON format) must exist containing the file path, the relationship in question, and the conflicting outputs from the different agents. This meets the "Percentage of known 'false positives' correctly assigned a low confidence score" metric.

---

### Test ID: A-CT-05
**Title**: Verify Resilience to Transient Service Errors
**Objective**: To confirm the pipeline can withstand and recover from transient failures in external services.
**User Story**: [3.1: Resilient Job Processing](../../specifications/user_stories/cognitive_triangulation_user_stories.md#story-31-resilient-job-processing)
**Preconditions**:
- The LLM client is mocked to produce a configurable number of transient errors (e.g., HTTP 503).
- The pipeline is configured with a retry limit of 3.
**Test Steps**:
1. Configure the LLM mock to fail exactly 2 times for a specific file analysis, then succeed on the 3rd attempt.
2. Trigger an analysis run that includes this file.
3. Monitor the job status and the final graph output.
**Expected Result (AI Verifiable Criterion)**:
- The overall analysis job must complete successfully.
- Structured logs must show exactly two failed attempts followed by one successful attempt for the specific API call.
- The final Neo4j graph must be complete and correct, as if no error occurred. This meets the "Successful pipeline completion rate" metric.

---

### Test ID: A-CT-06
**Title**: Verify Circuit Breaker Engagement
**Objective**: To ensure the circuit breaker trips after repeated failures, preventing system overload.
**User Story**: [3.1: Resilient Job Processing](../../specifications/user_stories/cognitive_triangulation_user_stories.md#story-31-resilient-job-processing)
**Preconditions**:
- The LLM client is mocked to consistently fail for a specific service.
- The circuit breaker is configured to trip after 3 failures.
**Test Steps**:
1. Configure the LLM mock to always fail for requests related to `FileAnalysisWorker`.
2. Trigger an analysis run.
3. Monitor the structured logs and job status dashboard.
**Expected Result (AI Verifiable Criterion)**:
- The logs must show exactly 3 attempts to call the failing service for a given job.
- A log entry must be generated indicating the circuit breaker has "opened".
- Subsequent jobs dependent on that service are marked as "degraded" or are skipped, but do not cause the entire system to crash.
- After the configured timeout, a log entry indicates the circuit breaker is "half-open", and the next call will test the service's availability.

---

### Test ID: A-CT-07
**Title**: Verify Real-Time Job Status Monitoring
**Objective**: To confirm that the job status dashboard/API provides an accurate, real-time view of the analysis progress.
**User Story**: [3.2: Clear Analysis Status](../../specifications/user_stories/cognitive_triangulation_user_stories.md#story-32-clear-analysis-status)
**Preconditions**:
- An analysis job is running.
**Test Steps**:
1. Trigger a new analysis job on the "Polyglot" repository.
2. While the job is running, repeatedly query the job status API.
3. After the job completes, query the API one last time.
**Expected Result (AI Verifiable Criterion)**:
- The API must return a structured response (JSON) showing the overall progress percentage.
- The response must contain a hierarchical breakdown of jobs (e.g., `File Analysis`, `Directory Resolution`) and their individual statuses (`In Progress`, `Completed`).
- The status must transition correctly from `In Progress` to `Completed` upon job completion.

---

### Test ID: A-CT-08
**Title**: Verify Health Check Endpoints
**Objective**: To ensure that all core services expose functioning liveness and readiness endpoints.
**User Story**: [3.2: Clear Analysis Status](../../specifications/user_stories/cognitive_triangulation_user_stories.md#story-32-clear-analysis-status)
**Preconditions**:
- The system and all its microservices are running.
**Test Steps**:
1. Send an HTTP GET request to the `/health/liveness` endpoint of each core service.
2. Send an HTTP GET request to the `/health/readiness` endpoint of each core service.
**Expected Result (AI Verifiable Criterion)**:
- All requests to `/health/liveness` must return an HTTP 200 OK status code.
- All requests to `/health/readiness` must return an HTTP 200 OK status code, indicating they are ready to accept traffic. This meets the "Uptime and response time" metric.