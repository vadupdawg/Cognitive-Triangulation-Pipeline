# Secondary Findings, Part 1: Kafka Topic Design Best Practices

This document contains findings from the first targeted research cycle, addressing a critical knowledge gap identified in `docs/research/analysis/knowledge_gaps.md`: Kafka topic architecture.

## 1. Research Question Addressed

"What are the best practices for designing the topic structure? Should we use a single topic for all events, or separate topics for `file_discovered`, `analysis_completed`, etc.? What are the trade-offs?"

## 2. Findings: Multiple Topics vs. Single Topic

The overwhelming industry best practice is to **use multiple, fine-grained topics rather than a single, monolithic topic.** The trade-offs are stark:

| Consideration           | Multiple Topics (Recommended)                                                                   | Single Topic (Anti-Pattern)                                                                            |
| ----------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **Schema Management**   | **Independent Schemas.** Each topic (`file_discovered`, `analysis_completed`) has its own schema. Schema evolution is isolated and safe. | **Coupled Schemas.** All event types are forced into one "god" schema. A change to one event type risks breaking all consumers. |
| **Consumer Logic**      | **Decoupled and Simple.** Consumers subscribe only to the topics they care about. No filtering logic is needed. | **Coupled and Complex.** Consumers must inspect every message to see if it's relevant, adding boilerplate and processing overhead. |
| **Performance & Scaling** | **Granular Control.** Each topic's partitions can be tuned independently based on that event type's specific throughput. | **Monolithic Scaling.** A spike in one event type can create a bottleneck that affects all other event types in the topic. |
| **Operational Overhead**  | Higher initial setup (more topics to create and configure).                                     | Lower initial setup (only one topic to manage).                                                        |
| **Data Retention**      | **Flexible Policies.** Retention periods can be set per-topic (e.g., keep `analysis_completed` longer than `file_discovered`). | **One-Size-Fits-All.** A single retention policy applies to all event types, which is inefficient.         |

## 3. Recommendation for the Code Analysis Pipeline

The recommendation is unequivocal: **use a separate Kafka topic for each distinct event type in the pipeline.**

### Proposed Topic Naming Convention:

Following best practices, topics should be named hierarchically: `domain.event_type.version`

*   `code_analysis.file_discovered.v1`
*   `code_analysis.analysis_completed.v1`
*   `code_analysis.ingestion_successful.v1`
*   `code_analysis.processing_failed.v1` (For the Dead-Letter Queue)

### Justification:

This approach provides:
1.  **Schema Safety:** The schema for `file_discovered` can evolve without any impact on the `GraphIngestorAgent` that consumes `analysis_completed`.
2.  **Consumer Independence:** The `WorkerAgent` consumes from `file_discovered`, and the `GraphIngestorAgent` consumes from `analysis_completed`. They are completely decoupled.
3.  **Scalability:** If the file discovery process is much faster than the analysis, the `file_discovered` topic can be scaled with more partitions without affecting the downstream topics.

While this approach requires managing a few more topics, the benefits in terms of resilience, scalability, and maintainability far outweigh the minor increase in operational complexity. This directly resolves a key knowledge gap and provides a solid foundation for the pipeline's data contracts.

**Source(s):** General AI Search (Perplexity) on Kafka topic design best practices.