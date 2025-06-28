# High-Performance, LLM-Only Analysis Pipeline -- Overview and Dataflow

## 1. Introduction

This document outlines the architecture for a high-performance, LLM-only analysis pipeline. The primary design goal is to create a system capable of processing a large volume of source code files, analyzing them with a Large Language Model (LLM) to identify entities and relationships, and ingesting this information into a Neo4j graph database.

The architecture emphasizes modularity, scalability, and parallelism to ensure high throughput and efficient use of resources. It leverages a producer-consumer pattern with a message queue (Redis) to decouple different stages of the pipeline.

## 2. Core Components

The pipeline consists of three main, independent, and concurrent services:

1.  **`FileDiscoveryBatcher`**: A producer that scans the target codebase, groups files into batches, and places `FileBatch` jobs onto a queue.
2.  **`LLMAnalysisWorker`**: A consumer that processes `FileBatch` jobs. It sends the file contents to an LLM for analysis and creates `GraphData` objects from the response. These objects are then placed onto a different queue for ingestion.
3.  **`GraphIngestionWorker`**: A consumer that processes `GraphData` jobs, executing Cypher queries to ingest the analyzed entities and relationships into the Neo4j database.

## 3. Data Flow Diagram

```
[Start] --> (File System)
             |
             v
[1. FileDiscoveryBatcher] -- Scans filesystem
             |
             +-- Creates FileBatch Jobs
             |
             v
     [Redis Queue -- "file_batch_queue"]
             |
             +-- Multiple concurrent workers consume jobs
             |
             v
[2. LLMAnalysisWorker] -- Processes batch, calls LLM API
             |
             +-- Creates GraphData Jobs from LLM response
             |
             v
     [Redis Queue -- "graph_data_queue"]
             |
             +-- Multiple concurrent workers consume jobs
             |
             v
[3. GraphIngestionWorker] -- Executes Cypher queries
             |
             v
     (Neo4j Database) --> [End]

```

## 4. Concurrency and Parallelism Strategy

1.  The system is designed for massively parallel execution of LLM analysis tasks.
2.  The `FileDiscoveryBatcher` acts as a single producer, creating multiple independent `FileBatch` jobs.
3.  The `LLMAnalysisWorker` is designed to be run with a high degree of concurrency (e.g., 5, 10, or more workers running in parallel), limited only by CPU cores and LLM API rate limits.
4.  Each `LLMAnalysisWorker` instance will consume one `FileBatch` job from the queue and execute it independently. This means if 10 batches are created, up to 10 LLM API calls can be active simultaneously, providing significant speed improvements.
5.  The `GraphIngestionWorker` can also be run with multiple concurrent workers, although its `apoc.periodic.iterate` query already includes internal parallelism, so concurrency may be lower.