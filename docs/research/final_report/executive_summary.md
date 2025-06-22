# Executive Summary

This research was commissioned to address the catastrophic architectural failure of the code analysis pipeline, as detailed in the post-mortem report dated 2025-06-22. The previous system's design, which relied on in-memory file processing and a relational database as a makeshift queue, was fundamentally non-scalable, memory-intensive, and brittle. It was incapable of handling the demands of a real-world, large-scale codebase.

This report presents the findings of a deep, structured research effort into modern, streaming-based architectures. The research process involved analyzing the initial failure, identifying key technological pillars, and performing targeted research cycles to fill critical implementation knowledge gaps.

The primary findings of this research are threefold:
1.  **A Streaming Backbone is Essential:** The use of a distributed, persistent log like **Apache Kafka** is the correct foundation for the pipeline, replacing the inadequate SQLite queue and providing durability, scalability, and natural back-pressure.
2.  **File Processing Must Be Streamed:** The practice of reading entire files into memory must be abandoned. The use of **Node.js Streams** (`fs.createReadStream`) is a non-negotiable requirement for all file I/O to ensure low, predictable memory usage.
3.  **Advanced Processing Requires a Dedicated Framework:** For complex, stateful data transformations and resilient ingestion, a dedicated stream processing framework like **Apache Flink** is recommended over custom, brittle consumer logic.

Based on these findings, this report recommends a new, fundamentally different architecture: a **decoupled, event-driven pipeline**. In this model, agents communicate asynchronously by producing and consuming events from Kafka topics. This design is inherently more resilient, scalable, and maintainable.

While this research has established a robust high-level architecture, several specific implementation questions have been identified and documented in the `knowledge_gaps.md` file. These questions, covering areas like Kafka topic configuration and Flink-to-Node.js integration, should be the focus of the next phase of work leading to detailed technical specifications.

Adopting the recommendations in this report will mitigate the risks that led to the previous failure and provide a solid architectural foundation for a high-performance, scalable code analysis system.