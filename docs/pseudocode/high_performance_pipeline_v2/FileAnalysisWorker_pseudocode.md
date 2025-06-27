# FileAnalysisWorker Pseudocode

This document outlines the logic for the `FileAnalysisWorker`. This worker is responsible for analyzing individual files to identify Points of Interest (POIs) and their relationships, calculating a confidence score, and publishing these findings to a durable queue for downstream processing.

## 1. Constants and Configuration

```pseudocode
DEFINE NAMESPACE "FileAnalysisWorker"

CONSTANT JOB_QUEUE_NAME = "analyze-file-queue"
CONSTANT RESULT_QUEUE_NAME = "file-analysis-completed-queue"

-- Configuration loaded from environment or config file
CONFIG = {
  redis_connection_string,
  llm_api_key,
  llm_model_name
}
```

## 2. Main Worker Logic

The main entry point for the worker. It initializes necessary clients and starts listening for jobs.

```pseudocode
FUNCTION main()
  -- TEST--main--Worker should initialize all clients successfully.
  -- TEST--main--Worker should gracefully handle initialization failures (e.g., bad Redis connection).
  
  TRY
    -- Initialize a client to manage connections to the job queue (e.g., Redis/BullMQ)
    queue_client = initialize_queue_client(CONFIG.redis_connection_string)
    
    -- Initialize a client for Large Language Model (LLM) interactions
    llm_client = initialize_llm_client(CONFIG.llm_api_key, CONFIG.llm_model_name)

    -- Start the main processing loop
    log_info("FileAnalysisWorker started. Listening for jobs on queue-- " + JOB_QUEUE_NAME)
    listen_for_jobs(queue_client, llm_client)
  CATCH error
    log_error("Failed to initialize FileAnalysisWorker-- " + error.message)
    -- Implement a retry mechanism or exit gracefully
    exit_process(1)
  END TRY
END FUNCTION
```

## 3. Job Consumption Loop

Continuously polls the job queue and passes jobs to the processing function.

```pseudocode
FUNCTION listen_for_jobs(queue_client, llm_client)
  WHILE true
    -- TEST--listen_for_jobs--Should fetch a job when the queue is not empty.
    -- TEST--listen_for_jobs--Should wait gracefully when the queue is empty.
    
    TRY
      -- Blocking call to get the next job from the queue
      job = queue_client.get_next_job(JOB_QUEUE_NAME)
      
      IF job IS NOT NULL
        log_info("Received job-- " + job.id)
        process_file_analysis_job(job, llm_client, queue_client)
      END IF
    CATCH error
      log_error("Error fetching job from queue-- " + error.message)
      -- Wait for a moment before retrying to avoid spamming logs on persistent connection issues
      sleep(5 seconds)
    END TRY
  END WHILE
END FUNCTION
```

## 4. Job Processing

This is the core function where the file analysis happens.

```pseudocode
FUNCTION process_file_analysis_job(job, llm_client, queue_client)
  -- TEST--process_file_analysis_job--Should successfully process a valid job and add results to the output queue.
  -- TEST--process_file_analysis_job--Should handle jobs with missing or invalid data (e.g., missing file_path).
  -- TEST--process_file_analysis_job--Should handle errors during file reading.
  -- TEST--process_file_analysis_job--Should handle errors from the analysis service.
  
  -- Input validation
  IF job.file_path IS NULL OR job.project_id IS NULL
    log_error("Invalid job received-- missing file_path or project_id. Job ID-- " + job.id)
    RETURN -- Acknowledge and discard the job
  END IF

  TRY
    -- 1. Read file content
    file_content = read_file_from_disk(job.file_path)
    -- TEST--read_file_from_disk--Should return content for an existing file.
    -- TEST--read_file_from_disk--Should throw an error for a non-existent file.
    
    -- 2. Analyze the file to find POIs and relationships
    analysis_result = analyze_content_for_pois_and_relationships(file_content, llm_client)
    
    -- 3. Calculate an initial confidence score
    confidence_score = calculate_initial_confidence(analysis_result)
    -- TEST--calculate_initial_confidence--Should return a high score for clear, numerous findings.
    -- TEST--calculate_initial_confidence--Should return a low score for sparse or ambiguous findings.

    -- 4. Add result job to the dedicated, durable results queue
    result_payload = {
      job_id-- job.id,
      project_id-- job.project_id,
      file_path-- job.file_path,
      points_of_interest-- analysis_result.pois,
      relationships-- analysis_result.relationships,
      confidence_score-- confidence_score,
      analysis_timestamp-- current_timestamp()
    }
    
    queue_client.add_job_to_queue(RESULT_QUEUE_NAME, "analysis-completed", result_payload)
    log_info("Successfully processed and added analysis job to queue for file-- " + job.file_path)
    
  CATCH FileNotFoundError as fnf_error
    log_error("File not found for job " + job.id + "-- " + fnf_error.message)
    -- Optionally, publish a "file-not-found" event to a separate error queue/topic
  CATCH AnalysisError as analysis_error
    log_error("Analysis failed for job " + job.id + "-- " + analysis_error.message)
    -- Move the job to a dead-letter queue for manual inspection
  CATCH error
    log_error("An unexpected error occurred during job processing for job " + job.id + "-- " + error.message)
    -- Move to dead-letter queue or implement retry logic
  END TRY
END FUNCTION
```

## 5. Sub-routines

### 5.1. Content Analysis

Interacts with an LLM or a specialized service to perform the core analysis.

```pseudocode
FUNCTION analyze_content_for_pois_and_relationships(content, llm_client)
  -- TEST--analyze_content--Should correctly identify POIs (classes, functions, variables) in source code.
  -- TEST--analyze_content--Should correctly identify relationships (e.g., function calls, class instantiations).
  -- TEST--analyze_content--Should return an empty result for a blank file.
  -- TEST--analyze_content--Should handle non-code text files gracefully.

  prompt = "Analyze the following file content. Identify all key Points of Interest (like classes, functions, methods, and important variables) and any intra-file relationships between them (like function calls or variable usage). Return the result as a structured JSON object with 'pois' and 'relationships' keys."
  
  -- This is a simplified representation of the interaction
  llm_response = llm_client.send_prompt(prompt, content)
  
  -- Validate and parse the response
  parsed_response = parse_json(llm_response)
  
  IF parsed_response IS NOT VALID
    THROW new AnalysisError("LLM response was not valid JSON.")
  END IF
  
  RETURN parsed_response
END FUNCTION
```

### 5.2. Confidence Scoring

A simple scoring mechanism. This could be expanded into a more complex service.

```pseudocode
FUNCTION calculate_initial_confidence(analysis_result)
  -- TEST--calculate_initial_confidence--Should return 0 if no POIs or relationships are found.
  
  poi_count = length(analysis_result.pois)
  relationship_count = length(analysis_result.relationships)
  
  -- Simple heuristic-- more findings imply higher confidence.
  base_score = (poi_count * 5) + (relationship_count * 10)
  
  -- Normalize to a 0-100 scale, capping at 100.
  confidence = min(base_score, 100)
  
  RETURN confidence
END FUNCTION