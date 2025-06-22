# Critical Knowledge Gaps for Implementation

The initial research phase has successfully identified high-level technologies and architectural patterns (Kafka, Flink, Node.js Streams). However, moving from this high-level design to a concrete implementation plan requires addressing several specific, practical questions. These knowledge gaps represent the next frontier for our research.

## 1. Kafka Topic Architecture and Configuration

*   **Gap:** The optimal number of partitions for our topics is unknown. How do we balance parallelism with overhead?
*   **Gap:** What is the correct replication factor for our use case to ensure durability without excessive resource consumption?
*   **Gap:** What are the best practices for designing the topic structure? Should we use a single topic for all events, or separate topics for `file_discovered`, `analysis_completed`, etc.? What are the trade-offs?
*   **Gap:** How should we configure message retention and log compaction for each topic?

## 2. Flink and Node.js Integration

*   **Gap:** How does a Node.js application interact with a Flink cluster? The primary Flink APIs are Java/Scala. Do we need to use Flink's SQL Client, or is there a recommended pattern for submitting and managing jobs from a Node.js backend?
*   **Gap:** What are the practical steps for deploying a Flink job that consumes from a Kafka topic and is managed or triggered by a Node.js service?

## 3. Streaming Data to the LLM

*   **Gap:** The LLM API may not support streaming requests. What is the most resilient pattern for handling this?
    *   **Option A: Chunking in the Worker.** The Node.js `WorkerAgent` reads the file in chunks and sends multiple, smaller requests to the LLM. How do we reassemble the full analysis on the other side?
    *   **Option B: Temporary Storage.** The `WorkerAgent` streams the file to a temporary location (e.g., S3 bucket), and then passes a reference to the LLM. Is this viable? What are the security and cleanup implications?
*   **Gap:** How do we handle LLM rate limits in a streaming context? A robust, configurable rate-limiting mechanism is needed in the `WorkerAgent`.

## 4. Schema Management and Data Validation

*   **Gap:** The post-mortem identified "unbounded LLM output" as a risk. How do we enforce a strict schema on the data flowing through Kafka?
*   **Gap:** What are the practical differences between using a schema registry (like Confluent Schema Registry) with Avro/Protobuf versus performing manual JSON schema validation at the consumer level? What is the performance and resilience impact of each choice?

## 5. Idempotent Ingestion into Neo4j

*   **Gap:** The `GraphIngestorAgent` must be idempotent to prevent data duplication on retries. What is the most efficient Cypher query pattern to achieve this?
*   **Gap:** Should we use `MERGE` on every node and relationship? Are there more performant bulk-loading strategies in Neo4j that still guarantee idempotency? For example, using constraints and `UNWIND` with conditional creation.

## 6. Deployment and Operational Concerns

*   **Gap:** What is a realistic, lightweight local development setup for this architecture (Kafka, Flink, Neo4j)? Docker Compose is a likely candidate, but specific configurations are needed.
*   **Gap:** What are the key metrics we need to monitor for each component of this pipeline (e.g., Kafka consumer lag, Flink checkpoint duration, end-to-end latency)?

Addressing these gaps will be the focus of the next, targeted research cycle.