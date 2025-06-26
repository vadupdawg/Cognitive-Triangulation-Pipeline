# Cognitive Triangulation - User Stories

This document outlines the user stories for the refactored Cognitive Triangulation architecture, focusing on the benefits of improved accuracy, reliability, and observability.

---

## Theme 1: Accuracy and Confidence

### Story 1.1: Confidence-Scored Relationships

*   **As a** Developer (Diana),
*   **I want to** see a confidence score next to each identified relationship in the knowledge graph,
*   **so that** I can quickly distinguish between highly certain connections and speculative ones when planning a refactor.

**Acceptance Criteria:**

*   Given the system has analyzed a codebase,
*   When I view the relationships in the graph visualization tool,
*   Then each relationship must display a numerical confidence score (e.g., a percentage from 0% to 100%).
*   And the score should be derived from the analysis model's softmax output.
*   And I should be able to filter the view to show only relationships above a certain confidence threshold.

### Story 1.2: Evidence Inspection

*   **As a** Data Scientist (Sam),
*   **I want to** inspect the evidence that contributed to a relationship's confidence score,
*   **so that** I can understand the model's reasoning and validate its findings.

**Acceptance Criteria:**

*   Given a relationship with a confidence score has been identified,
*   When I select that relationship in the UI,
*   Then I can view a summary of the outputs from the different analysis agents/passes that evaluated it.
*   And the summary must indicate whether the agents agreed or disagreed, providing a basis for the final score.

---

## Theme 2: Reliability and Trust

### Story 2.1: Peer-Reviewed Analysis

*   **As a** Developer (Diana),
*   **I want to** know that the analysis results have been cross-validated by multiple independent agents,
*   **so that** I can have higher trust in the accuracy of the generated code graph.

**Acceptance Criteria:**

*   Given a file is analyzed for relationships,
*   Then at least two different analysis passes (e.g., a file-level pass and a directory-level pass) must evaluate potential relationships involving its entities.
*   And the system must record the findings from each pass in a way that can be audited.
*   And a relationship's confidence score is significantly boosted if the passes agree.
*   And the UI should provide a visual indicator (e.g., a checkmark icon) for relationships that have been successfully peer-reviewed.

### Story 2.2: Discrepancy Flagging

*   **As a** Data Scientist (Sam),
*   **I want the system to** automatically flag and log discrepancies found between analysis agents,
*   **so that** I can identify areas where the models are struggling and potentially improve the analysis prompts or logic.

**Acceptance Criteria:**

*   Given two agents analyze the same code context and produce conflicting results (e.g., one finds a relationship, the other doesn't),
*   When the system reconciles the findings,
*   Then it must create a structured log entry detailing the conflict, including the file path, the relationship in question, and the differing agent outputs.
*   And the final confidence score for the relationship must be lowered to reflect the disagreement.

---

## Theme 3: Observability and Resilience

### Story 3.1: Resilient Job Processing

*   **As a** Developer (Diana),
*   **I want the** analysis pipeline to be resilient to transient failures in the LLM or other services,
*   **so that** my analysis job completes successfully even if there are temporary network issues.

**Acceptance Criteria:**

*   Given an analysis job is running,
*   If an LLM API call fails with a transient error (e.g., 503 Service Unavailable),
*   Then the responsible worker must automatically retry the request up to a configurable number of times (e.g., 3 times) with an exponential backoff delay.
*   If the request continues to fail after all retries, the circuit breaker for that service should trip, preventing further calls for a short, configurable period.
*   And the affected job should be marked as "degraded" but not fail the entire pipeline immediately, allowing other parts of the analysis to proceed.

### Story 3.2: Clear Analysis Status

*   **As a** Developer (Diana),
*   **I want to** view the real-time status of my analysis job, including which stages are complete and which are in progress,
*   **so that** I can understand how long the process will take and if any part of it is stuck.

**Acceptance Criteria:**

*   Given I have started an analysis job,
*   When I navigate to a status dashboard or query a status API,
*   Then I can see the overall progress of the job (e.g., 75% complete).
*   And I can see a breakdown of the job hierarchy (e.g., `File Analysis`, `Directory Resolution`, `Global Resolution`).
*   And I can see the status of each stage (e.g., `Pending`, `In Progress`, `Completed`, `Failed`, `Degraded`).
*   And the system must expose basic health check endpoints (`/health/liveness`, `/health/readiness`) for its core components.