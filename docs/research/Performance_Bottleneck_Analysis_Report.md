# Performance Bottleneck Analysis Report

## 1. Executive Summary

This report details a comprehensive analysis of the existing data processing pipeline, identifying critical performance bottlenecks that inhibit parallelism and significantly slow down the analysis of the `polyglot-test` directory. The core finding is that the current architecture, while functional, relies on several monolithic, sequential processing steps that prevent the system from taking full advantage of its job-based, concurrent worker infrastructure. The most significant bottleneck is the final, all-or-nothing invocation of the `GraphBuilder` agent, which blocks until all other analysis is complete.

## 2. Identified Bottlenecks

### 2.1. Monolithic and Sequential GraphBuilder Invocation

**Observation:** The `GraphBuilder` agent is invoked as the final, imperative step in both the primary application entry point ([`src/main.js`](src/main.js:64)) and the API server ([`src/utils/pipelineApi.js:285`](src/utils/pipelineApi.js:285)). The logic explicitly waits for all prior stages to finish before initiating the graph build process.

**Impact:** This is the most severe bottleneck in the system. It creates a single, long-running sequential dependency at the end of the pipeline. The benefits of parallelizing the upstream file and directory analysis are nullified by the requirement that they all complete before the final result can be constructed. The system cannot generate any part of the knowledge graph until every single job has been processed and validated.

### 2.2. Bulk Data Loading in GraphBuilder

**Observation:** The `GraphBuilder` agent itself begins by querying and loading *all* relationships marked as `VALIDATED` from the SQLite database in a single operation ([`src/agents/GraphBuilder.js:21`](src/agents/GraphBuilder.js:21)).

**Impact:** This creates a memory-intensive spike at the start of the `GraphBuilder`'s execution and prevents any form of incremental or streaming graph updates. The agent cannot build sub-sections of the graph as they become available; it must wait for the complete, global set of validated relationships.

### 2.3. Rigid, Staged Inter-Worker Dependencies

**Observation:** As mapped in [`docs/research/application_pipeline_map.md`](docs/research/application_pipeline_map.md), the pipeline operates in rigid, sequential stages. For example, the `RelationshipResolutionWorker` is entirely dependent on the `FileAnalysisWorker` completing its job and the `TransactionalOutboxPublisher` polling and publishing a new job.

**Impact:** While jobs *within* a single queue can be processed in parallel, the stages themselves form a dependency chain. This limits the overall concurrency, as workers in later stages may sit idle waiting for the entire preceding stage to produce work.

### 2.4. Directory-Level Aggregation Lock-Step

**Observation:** The `DirectoryAggregationWorker` ([`src/workers/directoryAggregationWorker.js`](src/workers/directoryAggregationWorker.js)) creates a synchronization point by waiting for all `analyze-file` jobs within a directory to complete before enqueuing a single `analyze-directory` job.

**Impact:** If a single file in a large directory is slow to process (due to size or complexity), the analysis for the entire directory is stalled. This is particularly problematic for directories with many files, creating a "long pole" problem where the slowest file dictates the schedule for the entire directory unit.

### 2.5. Sequential Global Resolution Pass

**Observation:** The `GlobalResolutionWorker` ([`src/workers/globalResolutionWorker.js`](src/workers/globalResolutionWorker.js)) is designed to run as a single, global pass after all directory-level analyses are complete.

**Impact:** This introduces another major sequential bottleneck. Inter-directory relationships, which are critical for a holistic understanding of the codebase, cannot be identified until all directory summaries are available. This prevents a more fluid, real-time approach where relationships could be discovered as soon as two related directories have been summarized.

## 3. Conclusion

The current architecture is fundamentally limited by its sequential, stage-gated design. To achieve maximum parallelism, the system must be re-architected to allow agents and workers to operate more independently, processing data as it becomes available rather than waiting for global completion signals. The following research phase will explore architectures that break these sequential dependencies and enable a truly concurrent and streaming-first approach to pipeline processing.