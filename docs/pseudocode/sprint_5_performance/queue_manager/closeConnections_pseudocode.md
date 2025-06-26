# Pseudocode: closeConnections()

**Module:** `queueManager.js`
**Function:** `closeConnections()`

## 1. Description

This function gracefully closes all active BullMQ queue connections and the shared Redis connection. It is designed to be called during application shutdown to ensure no resources are left hanging.

## 2. Inputs

- None

## 3. Outputs

- A promise that resolves when all connections are successfully closed, or rejects if an error occurs.

## 4. TDD Anchors

- **TEST-01:** `closeConnections` successfully closes all active queue connections.
  - **Behavior:** The `close()` method should be called on every queue instance stored in the `activeQueues` map.
- **TEST-02:** `closeConnections` successfully closes the shared Redis connection after closing all queues.
  - **Behavior:** After all queues have been closed, the `quit()` or `close()` method on the `redisConnection` instance should be called.
- **TEST-03:** `closeConnections` handles errors when a queue fails to close.
  - **Behavior:** If one of the queue's `close()` methods throws an error, the function should catch it, log it, and still attempt to close the remaining queues and the main Redis connection. The overall function should ultimately reject or throw to indicate failure.
- **TEST-04:** `closeConnections` handles errors when the Redis connection fails to close.
  - **Behavior:** If closing the main `redisConnection` fails, the error should be caught and logged, and the function should reject or throw.
- **TEST-05:** `closeConnections` does not throw an error if called when there are no active queues.
    - **Behavior:** The function should execute without error and close only the Redis connection if it's open.

## 5. Pseudocode

FUNCTION closeConnections() -- Returns Promise

  -- TEST-01, TEST-05 Start of behavior for closing queues
  LOG "Attempting to close all active queue connections..."

  -- Use a container to track any errors that occur during the process
  DECLARE errorList AS new List

  TRY
    -- Iterate through all the values (queue instances) in the activeQueues map
    FOR EACH queue IN activeQueues.values()
      TRY
        AWAIT queue.close()
        LOG "Successfully closed queue-- " + queue.name
      CATCH queueCloseError
        LOG "Error closing queue-- " + queue.name + " - Error-- " + queueCloseError.message
        ADD queueCloseError TO errorList
      END TRY
    END FOR

    LOG "All active queues have been processed."

  FINALLY
    -- TEST-02, TEST-04 Start of behavior for closing Redis connection
    -- Ensure Redis connection is closed even if queue closing fails
    IF redisConnection IS NOT NULL AND redisConnection.status IS "ready"
      TRY
        LOG "Closing shared Redis connection."
        AWAIT redisConnection.quit()
        LOG "Shared Redis connection closed successfully."
      CATCH redisCloseError
        LOG "Error closing Redis connection-- " + redisCloseError.message
        ADD redisCloseError TO errorList
      END TRY
    ELSE
      LOG "Redis connection already closed or not initialized."
    END IF

    -- After attempting all closures, check if any errors were collected
    IF errorList IS NOT EMPTY
      -- Create a new aggregate error to signify that one or more closures failed
      DECLARE aggregateError = new Error("One or more connections failed to close.")
      aggregateError.details = errorList
      THROW aggregateError -- Propagate the failure
    END IF
  END TRY

  LOG "All connections closed successfully."
  RETURN

END FUNCTION