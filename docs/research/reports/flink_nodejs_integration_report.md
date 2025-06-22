# Research Report: Flink and Node.js Integration

This report details the findings and recommendations for integrating a Node.js backend with an Apache Flink cluster, addressing the knowledge gaps identified in `docs/research/analysis/knowledge_gaps.md`.

## 1. Executive Summary

Direct integration between Node.js and Apache Flink is best achieved through Flink's REST API for job management and the Flink SQL Gateway for ad-hoc querying. There are no dedicated Node.js client libraries for Flink; therefore, interaction relies on standard HTTP clients. For high-throughput, decoupled data pipelines, using Apache Kafka as an intermediary buffer is the recommended architectural pattern.

## 2. Primary Interaction Patterns

### 2.1. Flink REST API for Job Management

The most direct way for a Node.js application to manage Flink jobs (submit, monitor, cancel, rescale) is by making calls to the Flink JobManager's REST API.

*   **Actions:** Submit JARs, start jobs, check job status, stop jobs.
*   **Node.js Implementation:** Use a standard HTTP client library like `axios`.
*   **Example (using axios):**
    ```javascript
    const axios = require('axios');
    const FormData = require('form-data');
    const fs = require('fs');

    const FLINK_REST_API = 'http://localhost:8081';

    async function submitJob(jarPath) {
      try {
        // 1. Upload the JAR file
        const formData = new FormData();
        formData.append('jarfile', fs.createReadStream(jarPath));
        const uploadResponse = await axios.post(`${FLINK_REST_API}/jars/upload`, formData, {
          headers: formData.getHeaders(),
        });
        const jarId = uploadResponse.data.filename.split('/').pop();

        // 2. Run the job
        const runResponse = await axios.post(`${FLINK_REST_API}/jars/${jarId}/run`);
        const jobId = runResponse.data.jobid;
        console.log(`Successfully submitted job with ID: ${jobId}`);
        return jobId;
      } catch (error) {
        console.error('Error submitting Flink job:', error.response ? error.response.data : error.message);
      }
    }
    ```
*   **Recommendation:** This pattern is suitable for control-plane operations where the Node.js backend acts as an orchestrator. Implement robust error handling, including retries with exponential backoff, to handle transient network issues or Flink cluster unavailability.

### 2.2. Flink SQL Gateway

For applications that require dynamic, ad-hoc analysis or where business logic is more naturally expressed in SQL, the Flink SQL Gateway is the ideal interface.

*   **Actions:** Execute SQL queries, retrieve results.
*   **Node.js Implementation:** Send HTTP requests to the gateway's REST endpoint. For continuous queries, a WebSocket connection can be used to stream results back to the Node.js application.
*   **Recommendation:** Use the SQL Gateway for analytics dashboards or interactive querying frontends managed by the Node.js backend.

### 2.3. Kafka as an Intermediary

For decoupling the data plane from the control plane and enabling high-throughput, resilient data flow, Kafka is the recommended intermediary.

*   **Architecture:**
    1.  The Node.js `WorkerAgent` produces analysis tasks (or file content) to a Kafka topic.
    2.  A Flink job consumes from this Kafka topic, processes the data (e.g., calls an LLM), and performs transformations.
    3.  The Flink job produces the results to another Kafka topic.
    4.  The Node.js `GraphIngestorAgent` consumes the results from the output topic.
*   **Node.js Implementation:** Use a robust Kafka client library like `kafkajs`.
*   **Recommendation:** This is the most scalable and resilient pattern. It decouples the Node.js services from the Flink cluster, allowing them to be scaled and deployed independently. It also provides backpressure handling and durability via Kafka's distributed log.

## 3. Answering Key Questions

*   **How does a Node.js app interact with a Flink cluster?**
    *   Primarily through the REST API for job lifecycle management. There are no native Flink APIs for Node.js.
*   **What are the practical steps for deploying a Flink job managed by Node.js?**
    1.  Package the Flink job logic into a JAR file.
    2.  Use a Node.js script (as shown in the example above) to upload the JAR to the Flink cluster via the `/jars/upload` endpoint.
    3.  The script then triggers the job by making a POST request to the `/jars/:jarid/run` endpoint.
    4.  The Node.js service should store the returned `jobid` to monitor or manage the job later.

## 4. Summary of Recommendations

1.  **Use the Flink REST API** from Node.js for all job lifecycle and control-plane operations.
2.  **Use Kafka as a data bus** between Node.js services and Flink jobs to ensure decoupling, scalability, and resilience.
3.  For analytics or dynamic queries, integrate Node.js with the **Flink SQL Gateway**.
4.  Wrap Flink REST API interactions in a dedicated Node.js module (`flink-client.js`) to encapsulate the logic and improve reusability.