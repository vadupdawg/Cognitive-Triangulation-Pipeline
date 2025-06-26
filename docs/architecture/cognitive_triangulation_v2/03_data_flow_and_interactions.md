# Cognitive Triangulation v2 -- Data Flow & Interactions (Revised)

This document details the revised data flow and key interaction patterns within the Cognitive Triangulation v2 system. The new flow enhances resilience and scalability by incorporating job-dependency orchestration, the transactional outbox pattern, and a more efficient evidence handling strategy.

## 1. Overall Data Flow Diagram (Revised)

This diagram provides a comprehensive view of the entire process, reflecting the architectural changes.

```mermaid
sequenceDiagram
    participant User
    participant EntityScout
    participant Redis
    participant BullMQ
    participant AnalysisWorkers as (File, Dir, Global)
    participant SQLite
    participant OutboxPublisher
    participant ValidationWorker
    participant GraphBuilderWorker

    User->>EntityScout: 1. Run Analysis(rootPath)
    Note over EntityScout: Generates candidate relationships
    EntityScout->>BullMQ: 2. enqueue(All jobs in PAUSED state)
    EntityScout->>Redis: 3. write(manifest:{runId})
    EntityScout->>BullMQ: 4. resumeQueues()

    loop Parallel Analysis
        BullMQ-->>AnalysisWorkers: 5. process(job)
        AnalysisWorkers->>SQLite: 6. BEGIN TRANSACTION
        Note right of AnalysisWorkers: Write evidence to `relationship_evidence`
        Note right of AnalysisWorkers: Write event to `outbox`
        AnalysisWorkers->>SQLite: 7. COMMIT
    end

    loop Event Publication
        OutboxPublisher->>SQLite: 8. read(unprocessed events from outbox)
        OutboxPublisher->>BullMQ: 9. publish(analysis-completed event)
        OutboxPublisher->>SQLite: 10. markEventAsProcessed()
    end

    BullMQ-->>ValidationWorker: 11. consume(analysis-completed event)
    ValidationWorker->>Redis: 12. INCR(evidence_count:{runId}:{hash})

    loop For each Relationship
        ValidationWorker->>Redis: 13. Check if count matches manifest
        opt All Evidence Ready
            ValidationWorker->>BullMQ: 14. Enqueue 'reconcile' job
        end
    end
    
    Note over BullMQ: When all analysis jobs complete...
    BullMQ-->>GraphBuilderWorker: 15. process(finalizer job)
    GraphBuilderWorker->>SQLite: 16. read(VALIDATED relationships)
    GraphBuilderWorker->>Neo4j: 17. write(graph nodes, edges)
```

## 2. Key Interaction-- Atomic Evidence Handling & Validation

This sequence diagram focuses on the core validation loop, highlighting the transactional outbox pattern and the revised use of Redis and SQLite.

**Context:** The `runManifest` is in Redis, and analysis queues are active.

```mermaid
sequenceDiagram
    participant Worker as Analysis Worker
    participant SQLite
    participant OutboxPublisher
    participant BullMQ
    participant ValidationWorker
    participant Redis

    Worker->>SQLite: 1. BEGIN TRANSACTION
    Worker->>SQLite: 2. INSERT into `relationship_evidence`
    Worker->>SQLite: 3. INSERT into `outbox`
    Worker->>SQLite: 4. COMMIT

    OutboxPublisher->>SQLite: 5. Polls `outbox` for new events
    SQLite-->>OutboxPublisher: Returns event payload
    OutboxPublisher->>BullMQ: 6. Publishes `AnalysisCompletedEvent`
    OutboxPublisher->>SQLite: 7. Marks event as processed

    BullMQ-->>ValidationWorker: 8. Delivers Event
    ValidationWorker->>Redis: 9. INCR `evidence_count:{runId}:{hash}`
    Redis-->>ValidationWorker: Returns new count

    Note over ValidationWorker: 10. Compare count to manifest's expected count

    alt All evidence has arrived
        ValidationWorker->>BullMQ: 11. Enqueue `reconcile-relationship` job
    end

    BullMQ-->>ValidationWorker: 12. Delivers `reconcile` job
    ValidationWorker->>SQLite: 13. SELECT all evidence from `relationship_evidence` WHERE hash=...

    Note over ValidationWorker: 14. Calls `ConfidenceScoringService.calculateFinalScore(evidence)`

    ValidationWorker->>SQLite: 15. UPDATE `relationships` SET status='VALIDATED', score=...
```

### Explanation of the Revised Interaction

1.  **Guaranteed Manifest Availability:** `EntityScout` now enqueues all jobs in a **paused** state and only resumes the queues *after* the manifest has been successfully written to Redis. This completely eliminates the race condition where a worker might start before its contract is defined.
2.  **Transactional Outbox for Atomicity:** Workers no longer publish directly to the message queue. Instead, they write their evidence and the event payload to two separate tables (`relationship_evidence` and `outbox`) within a **single database transaction**. This guarantees that an event is never lost if the worker crashes after writing its data but before publishing.
3.  **Decoupled Event Publication:** A simple, robust `OutboxPublisher` process handles the critical task of moving events from the database to the message queue, ensuring reliability.
4.  **Efficient Evidence Storage:** Large evidence payloads are written directly to SQLite, a database optimized for such storage.
5.  **Coordination via Atomic Counters:** Redis is now used for its primary strength-- fast, atomic operations. The `ValidationWorker` simply increments a counter for each piece of evidence received. This is a low-memory, high-performance way to track progress.
6.  **Dependency-Managed Finalization:** The `GraphBuilderWorker` is now triggered automatically by BullMQ when all its dependent analysis jobs complete successfully. This is a much more robust and less error-prone mechanism than having a coordinator agent manually track job completion.