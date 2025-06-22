# Integrated Architectural Model: A Streaming-First Code Analysis Pipeline

This document synthesizes the primary and secondary research findings into a cohesive, high-level architectural model for the new code analysis pipeline. This model is designed to be scalable, resilient, and efficient, directly addressing the core failures of the previous system.

## 1. Core Components and Technologies

The proposed architecture is a "Pipes and Filters" model built on a streaming backbone.

*   **Data Backbone (The "Pipes"):** **Apache Kafka** will serve as the central, durable log for all events in the system. It replaces the fragile SQLite queue.
*   **Processing Engines (The "Filters"):**
    *   **`ScoutAgent` (Node.js):** Discovers files and produces `file_discovered` events to a dedicated Kafka topic.
    *   **`WorkerAgent` (Node.js):** Consumes `file_discovered` events. It processes files using **Node.js Streams** to avoid loading them into memory and sends analysis requests to the LLM. It produces `analysis_completed` or `analysis_failed` events to dedicated Kafka topics.
    *   **`GraphIngestorAgent` (Apache Flink):** A Flink job that consumes from the `analysis_completed` topic, performs any necessary stateful transformations, and executes idempotent writes to the **Neo4j** database.
*   **Data Contracts:** A **Schema Registry** (e.g., Confluent Schema Registry) will be used with a binary format like **Avro** to enforce schemas for all events, preventing data quality issues.

## 2. Data Flow

The data flows through the system as a continuous, asynchronous stream:

1.  **Discovery:** The `ScoutAgent` scans a repository and produces a `code_analysis.file_discovered.v1` message to a Kafka topic for each file. The message contains metadata like the file path and checksum.

2.  **Consumption and Analysis:**
    *   The `WorkerAgent` consumer group reads messages from the `file_discovered` topic. Kafka's partitioning allows multiple workers to process files in parallel.
    *   For each message, the worker opens a **file stream** (`fs.createReadStream`) from the file system.
    *   The file content is streamed chunk-by-chunk to the LLM API (using a controlled, "paused" stream pattern to manage back-pressure).
    *   Upon receiving a valid JSON response from the LLM, the worker validates it against the Avro schema and produces a `code_analysis.analysis_completed.v1` message to a new Kafka topic.
    *   If analysis fails, it produces a message to the `code_analysis.analysis_failed.v1` Dead-Letter Queue (DLQ) topic.

3.  **Ingestion:**
    *   The `GraphIngestorAgent` (a Flink job) consumes the stream of `analysis_completed` events.
    *   Flink can perform optional stateful operations here, such as aggregating all analysis from a single commit before ingestion.
    *   The Flink job connects to Neo4j and executes idempotent `MERGE` queries to create or update nodes and relationships, ensuring that reprocessing the stream does not create duplicate data.
    *   Upon successful ingestion, it can optionally produce a final `code_analysis.ingestion_successful.v1` event for end-to-end monitoring.

## 3. How This Model Solves the Core Failures

*   **Failure: Lack of Streaming:** Solved by the mandatory use of `fs.createReadStream` in the `WorkerAgent`, ensuring low memory usage.
*   **Failure: Inadequate Queuing:** Solved by replacing SQLite with Apache Kafka, a distributed, scalable, and durable event log.
*   **Failure: Absence of Back-Pressure:** Solved at two levels:
    1.  Kafka's pull-based consumers naturally prevent workers from being overwhelmed.
    2.  The "paused" stream pattern within the worker prevents it from reading a file faster than the LLM can process it.
*   **Failure: Unbounded LLM Output:** Solved by using a Schema Registry with Avro to enforce strict data contracts on all events produced to Kafka.

This integrated model represents a modern, event-driven architecture that is fundamentally more resilient and scalable than its predecessor.