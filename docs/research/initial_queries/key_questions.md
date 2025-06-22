# Key Research Questions

Based on the architectural failures detailed in the post-mortem report and the defined research scope, the following key questions must be answered to inform the design of a new, robust pipeline.

## 1. Core Architecture and Data Flow

*   What are the primary trade-offs between a pure message queuing system (like RabbitMQ) and a streaming platform (like Apache Kafka) for this specific use case?
*   How can the "Pipes and Filters" architectural pattern be implemented to create a decoupled pipeline of `Scout`, `Worker`, and `Ingestor` agents?
*   What are the best practices for ensuring data durability and exactly-once processing semantics in a distributed pipeline?
*   Which architectural patterns are most effective for implementing back-pressure to prevent system overload?

## 2. File and Data Streaming (`WorkerAgent` Focus)

*   What are the most efficient Node.js patterns for reading a file as a stream and processing it in chunks?
*   How can we stream data to an LLM API that may not natively support streaming requests? What are the trade-offs of intermediate strategies like chunking or temporary file storage?
*   What are the industry-standard data formats (e.g., Avro, Protocol Buffers) for serializing data between services, and what are their benefits over plain JSON?

## 3. Queuing and Messaging

*   For a high-throughput scenario involving potentially millions of file discovery events, how do Kafka, RabbitMQ, and cloud-native services (SQS, Pub/Sub) compare in terms of performance, scalability, and ease of management?
*   How should a Dead-Letter Queue (DLQ) be implemented and monitored to handle and analyze messages that fail processing repeatedly?
*   What message queue features are critical for this pipeline (e.g., message ordering, priority queues, delayed messages)?

## 4. Scalability, Resilience, and Operations

*   How can the new architecture be designed for horizontal scalability, allowing us to add more `Worker` or `Ingestor` instances as load increases?
*   What are the best practices for health checks and monitoring in a streaming architecture?
*   How can we design the `GraphIngestorAgent` to be idempotent, ensuring that re-processing a message does not lead to duplicate nodes or relationships in Neo4j?
*   What are the potential pitfalls and common anti-patterns to avoid when building streaming data pipelines?