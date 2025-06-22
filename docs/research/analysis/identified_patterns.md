# Identified Architectural Patterns

Based on the initial research into streaming platforms, file I/O, and processing frameworks, several key architectural patterns have emerged as best practices for building the new code analysis pipeline. These patterns directly address the failures of the previous system.

## 1. Pattern: Decoupled Pipeline via Persistent Log (The Kafka Model)

*   **Description:** This pattern uses a durable, append-only log (like Apache Kafka) as the central nervous system of the architecture. Producers (like the `ScoutAgent`) write events to the log, and consumers (like the `WorkerAgent` and `GraphIngestorAgent`) read from the log independently and at their own pace.
*   **Benefits:**
    *   **Decoupling:** Services do not need to know about each other; they only need to know about Kafka. This simplifies development and allows services to be scaled, updated, or replaced independently.
    *   **Durability:** The log provides a persistent record of all events, protecting against data loss if a consumer fails.
    *   **Replayability:** Data can be re-read from the log multiple times, which is invaluable for debugging, backfilling data, or running new types of analysis on historical data.
    *   **Natural Back-Pressure:** The pull-based consumer model means consumers only take on work they can handle, inherently preventing them from being overwhelmed.
*   **Relevance:** This directly replaces the brittle, polling-based SQLite queue with a robust, scalable, and resilient mechanism for data flow.

## 2. Pattern: Stream-Based File Processing

*   **Description:** This pattern mandates that files are never read into memory in their entirety. Instead, they are processed as a stream of smaller chunks using tools like Node.js's `fs.createReadStream`.
*   **Benefits:**
    *   **Low Memory Footprint:** Memory usage remains constant and low, regardless of the size of the file being processed.
    *   **Scalability:** The system can process arbitrarily large files without crashing, removing the single greatest point of failure from the previous architecture.
    *   **Responsiveness:** Processing can begin as soon as the first chunk of a file is available, rather than waiting for the entire file to be read.
*   **Relevance:** This is the direct solution to the `WorkerAgent`'s critical flaw of using `fs.readFile()`.

## 3. Pattern: Stateful Stream Processing (The Flink Model)

*   **Description:** This pattern involves using a stream processing framework (like Apache Flink) that can maintain state over time. For example, it could track the status of all files within a specific commit or build a dependency graph in-memory before flushing it to the database.
*   **Benefits:**
    *   **Complex Event Processing:** Enables sophisticated analysis that requires context beyond a single, independent event.
    *   **Efficiency:** Performing stateful operations within the stream processor can be far more efficient than repeated queries against an external database.
    *   **Real-time Insights:** Allows for the generation of complex, real-time insights from the data stream.
*   **Relevance:** While not strictly necessary to fix the immediate failures, this pattern provides the architectural foundation for more advanced analysis features in the future, moving beyond simple file-by-file processing.

## 4. Pattern: Dead-Letter Queue (DLQ) for Error Handling

*   **Description:** When a message cannot be processed successfully after a certain number of retries, instead of being discarded or causing the consumer to crash, it is moved to a separate "dead-letter" queue.
*   **Benefits:**
    *   **Isolation:** A single problematic message cannot halt the entire pipeline.
    *   **Auditability:** Failed messages are preserved for later inspection, debugging, and potential manual reprocessing.
    *   **Resilience:** The main pipeline can continue to operate even when encountering poison pill messages.
*   **Relevance:** This replaces the brittle error handling of the previous `GraphIngestorAgent` and provides a robust, industry-standard way to manage processing failures.