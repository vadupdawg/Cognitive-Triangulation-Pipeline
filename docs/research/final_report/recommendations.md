# Recommendations

Based on the comprehensive research and analysis, the following actions are recommended to build a new, resilient, and scalable code analysis pipeline. These recommendations are presented in order of priority.

## 1. Adopt a Streaming-First Architecture with Apache Kafka

*   **Action:** Immediately cease all development on the SQLite-based queuing system.
*   **Action:** Provision an Apache Kafka cluster as the central data backbone for the pipeline. For development, this can be a single-broker Docker container. For production, a 3-broker cluster is the minimum recommendation for high availability.
*   **Action:** Define a clear topic strategy using multiple topics for different event types (e.g., `code_analysis.file_discovered.v1`, `code_analysis.analysis_completed.v1`). This provides schema isolation and consumer decoupling.

## 2. Re-architect Agents as Kafka Producers and Consumers

*   **Action:** The `ScoutAgent` must be refactored to be a Kafka producer. As it discovers files, it should produce events directly to the `file_discovered` topic.
*   **Action:** The `WorkerAgent` must be refactored to be a Kafka consumer, subscribing to the `file_discovered` topic as part of a consumer group.
*   **Action:** The `GraphIngestorAgent` should be re-implemented as a Kafka consumer (preferably within a stream processing framework like Flink) that subscribes to the `analysis_completed` topic.

## 3. Mandate Stream-Based File Processing

*   **Action:** The `WorkerAgent`'s file processing logic must be rewritten to exclusively use `fs.createReadStream`. The use of `fs.readFile()` or `fs.readFileSync()` should be forbidden in the codebase for any potentially large file.
*   **Action:** Implement a "paused" stream pattern in the `WorkerAgent` to provide back-pressure when interacting with the LLM API, ensuring the agent does not read from the file system faster than it can process the data.

## 4. Implement a Stream Processing Layer with Apache Flink

*   **Action:** For the `GraphIngestorAgent`, use Apache Flink to consume from the `analysis_completed` topic. This provides a robust framework for handling windowing, stateful operations, and resilient, idempotent writes to Neo4j.
*   **Action:** Begin by creating a simple "pass-through" Flink job that reads from Kafka and writes to Neo4j, and then iterate to add more complex logic as needed.

## 5. Enforce Data Contracts with a Schema Registry

*   **Action:** Integrate a schema registry (e.g., Confluent Schema Registry) into the pipeline.
*   **Action:** Define Avro or Protocol Buffers schemas for all event types.
*   **Action:** All Kafka producers and consumers must serialize and deserialize messages according to these schemas. This eliminates the risk of "unbounded LLM output" and ensures data quality throughout the pipeline.

## 6. Prioritize Filling Knowledge Gaps

*   **Action:** Before beginning implementation, conduct a second, targeted research cycle to address the specific questions outlined in `docs/research/analysis/knowledge_gaps.md`. The highest priority should be given to understanding Kafka topic configuration and Flink/Node.js integration patterns.

By following these recommendations, the team can build a modern, event-driven system that is not only capable of meeting the current demands but is also architected to scale and evolve for future requirements.