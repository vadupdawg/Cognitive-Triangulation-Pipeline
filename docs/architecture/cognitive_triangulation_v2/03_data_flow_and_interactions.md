# Cognitive Triangulation v2 - Data Flow and Interactions (Revised)

This document details the resilient, data-driven flow of interactions between the components of the revised Cognitive Triangulation v2 system.

---

## 1. Phase 1-- Initialization and Decomposed Manifest Creation

The `EntityScout` service initializes the run and seeds Redis with efficient, decomposed data structures.

```mermaid
sequenceDiagram
    participant User
    participant EntityScout
    participant Redis as Cache
    participant BullMQ as Queue

    User->>+EntityScout-- start(runConfig)
    EntityScout->>EntityScout-- Scan filesystem, create jobs
    EntityScout->>+Redis-- SADD run:123:jobs:files ...
    EntityScout->>+Redis-- HSET run:123:file_to_job_map ...
    Redis-->>-EntityScout-- OK
    EntityScout->>+BullMQ-- addJob('directory-analysis', job1)
    BullMQ-->>-EntityScout-- Job Queued
    EntityScout-->>-User-- Initialization Complete
```

1.  **Initiation--** `EntityScout` is started.
2.  **Manifest Creation--** It scans the filesystem and creates jobs.
3.  **Manifest Storage--** It populates the Redis `Set`s with job IDs and, critically, populates the `file_to_job_map` `Hash` with all file paths and their job IDs.
4.  **Job Enqueueing--** Initial jobs are added to the queue.

---

## 2. Phase 2-- Parallel Analysis and Targeted Redis Interaction

Analysis workers are fully stateless and use targeted Redis commands.

```mermaid
sequenceDiagram
    participant Worker as File/Dir Worker
    participant BullMQ as Queue
    participant LLM
    participant Redis as Cache
    participant SQLite_Outbox as Local Outbox DB

    BullMQ->>+Worker-- process(job)
    Worker->>+LLM-- analyze(fileContent)
    LLM-->>-Worker-- analysisResult (findings)
    Note right of Worker-- For each relationship found...
    Worker->>+Redis-- HGET run:123:file_to_job_map, "/path/to/other/file.js"
    Redis-->>-Worker-- "job-17"
    Worker->>+Redis-- HSETNX run:123:rel_map, hash, 2
    Redis-->>-Worker-- 1 (New hash added)
    Worker->>+SQLite_Outbox-- INSERT INTO outbox (payload)
    SQLite_Outbox-->>-Worker-- OK
    Worker->>-BullMQ-- Job Complete
```

1.  **Job Consumption--** A worker takes a job.
2.  **LLM Analysis--** It identifies a potential relationship.
3.  **Job ID Lookup--** It performs a fast, targeted `HGET` to the `file_to_job_map` in Redis to find the `jobId` of the related file.
4.  **Manifest Update--** It uses `HSETNX` on the `rel_map` `Hash` to record the relationship and its expected evidence count.
5.  **Outbox Write--** It writes the finding to its **local** SQLite outbox database.

---

## 3. Phase 3-- Reliable Event Publication (Sidecar Model)

The `TransactionalOutboxPublisher` runs as a sidecar on each compute node.

```mermaid
sequenceDiagram
    participant Publisher as Outbox Publisher Sidecar
    participant SQLite_Outbox as Local Outbox DB
    participant BullMQ as Queue

    loop Polling Cycle (on each node)
        Publisher->>+SQLite_Outbox-- SELECT * FROM outbox WHERE status = 'PENDING'
        SQLite_Outbox-->>-Publisher-- [event1]
        Publisher->>+BullMQ-- publish('analysis-finding', event1.payload)
        BullMQ-->>-Publisher-- OK
        Publisher->>+SQLite_Outbox-- UPDATE outbox SET status = 'PUBLISHED' WHERE id = event1.id
        SQLite_Outbox-->>-Publisher-- OK
    end
```

1.  **Local Polling--** The sidecar publisher polls its local `outbox` table.
2.  **Publish--** It publishes the event to the central message queue.
3.  **Update--** It updates the status in the **local** database.

---

## 4. Phase 4-- Data-Driven Validation and Reconciliation

This new, two-stage flow replaces the stateful coordinator.

### 4a. Evidence Ingestion & Counting (ValidationWorker)

```mermaid
sequenceDiagram
    participant Validator as ValidationWorker
    participant BullMQ as Queue
    participant Redis as Cache
    participant SQLite_Primary as Primary DB

    BullMQ->>+Validator-- handleAnalysisEvent(event)
    Validator->>+SQLite_Primary-- INSERT INTO relationship_evidence (payload)
    SQLite_Primary-->>-Validator-- OK
    Validator->>+Redis-- INCR evidence_count:123:hash
    Redis-->>-Validator-- current_count
    Validator->>+Redis-- HGET run:123:rel_map, hash
    Redis-->>-Validator-- expected_count
    alt current_count == expected_count
        Validator->>+BullMQ-- addJob('reconcile-relationship', {hash})
        BullMQ-->>-Validator-- Reconciliation Job Queued
    end
```

1.  **Event Consumption--** A `ValidationWorker` receives an `analysis-finding` event.
2.  **Evidence Persistence--** It immediately persists the full evidence payload into the central `relationship_evidence` table.
3.  **Atomic Count--** It performs a single, atomic `INCR` on the relationship's counter in Redis.
4.  **Trigger Check--** It compares the new count with the expected count from the `rel_map`. If they match, it enqueues a `reconcile-relationship` job.

### 4b. Final Reconciliation (ReconciliationWorker)

```mermaid
sequenceDiagram
    participant Reconciler as ReconciliationWorker
    participant BullMQ as Queue
    participant SQLite_Primary as Primary DB

    BullMQ->>+Reconciler-- process(reconcileJob)
    Reconciler->>+SQLite_Primary-- SELECT * FROM relationship_evidence WHERE hash = ?
    SQLite_Primary-->>-Reconciler-- [evidence1, evidence2]
    Reconciler->>Reconciler-- CALCULATE_CONFIDENCE(...)
    alt Confidence > Threshold
        Reconciler->>+SQLite_Primary-- INSERT INTO relationships (validated_data)
        SQLite_Primary-->>-Reconciler-- OK
    end
```
1.  **Job Consumption--** A `ReconciliationWorker` picks up a `reconcile-relationship` job.
2.  **Evidence Fetching--** It queries the `relationship_evidence` table to get all evidence for the hash.
3.  **Scoring & Persistence--** It calculates a confidence score and saves the final validated relationship to the `relationships` table.

---

## 5. Phase 5-- Final Graph Construction
(Unchanged from original design)