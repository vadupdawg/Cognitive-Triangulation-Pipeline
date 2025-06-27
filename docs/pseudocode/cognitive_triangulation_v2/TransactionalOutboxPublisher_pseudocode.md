# Pseudocode-- TransactionalOutboxPublisher

## 1. Overview

This document provides detailed, language-agnostic pseudocode for the `TransactionalOutboxPublisher`. This component is a standalone, reliable service that ensures events recorded in the local database `outbox` table are eventually published to a message queue. It operates on a polling mechanism, making it resilient to transient failures in either the database or the message queue.

This design decouples the business logic of the analysis workers from the responsibility of message delivery, increasing the overall system's robustness.

## 2. Component Dependencies

-   **DatabaseConnection**-- An interface or client for connecting to and interacting with the primary SQLite database.
-   **MessageQueueClient**-- An interface or client for publishing messages to the BullMQ streams.
-   **Logger**-- A standard logging utility for recording operational status, warnings, and errors.
-   **Configuration**-- A configuration object providing parameters like--
    -   `POLLING_INTERVAL_MS`-- The delay in milliseconds between polling attempts.
    -   `BATCH_SIZE`-- The maximum number of events to fetch and process in a single cycle.

## 3. Data Models

### OutboxEvent

A record within the `outbox` table.

-   `id`-- (UUID/Integer) The unique identifier for the event.
-   `event_name`-- (String) The name of the event topic or stream (e.g., `file-analysis-completed`).
-   `payload`-- (JSON/String) The data associated with the event.
-   `status`-- (Enum/String) The current state of the event, primarily `PENDING` or `PUBLISHED`.
-   `created_at`-- (Timestamp) The time the event was created.

## 4. Main Process Flow

The publisher runs as a continuous background process.

```pseudocode
FUNCTION start_publisher()
    // Initialization
    INITIALIZE DatabaseConnection
    INITIALIZE MessageQueueClient
    INITIALIZE Logger
    LOAD Configuration

    // TEST-- Service starts without fatal errors during initialization.
    Logger.info("TransactionalOutboxPublisher service starting.")

    // Main processing loop
    LOOP FOREVER
        TRY
            process_pending_outbox_events()
        CATCH unhandled_exception
            // TEST-- The main loop catches and logs critical errors without crashing the service.
            Logger.error("An unexpected critical error occurred in the main processing loop-- ", unhandled_exception)
            // Note-- Depending on the error, a circuit breaker or exponential backoff could be implemented here.
        END TRY

        // Wait for the configured interval before the next poll.
        WAIT for Configuration.POLLING_INTERVAL_MS
    END LOOP

    // Note-- A graceful shutdown mechanism would be needed here to stop the loop.
    // TEST-- The service can be shut down gracefully, closing connections.
    // Logger.info("TransactionalOutboxPublisher service shutting down.")
    // CLOSE DatabaseConnection
    // CLOSE MessageQueueClient
END FUNCTION
```

## 5. Core Logic-- Processing Events

This function encapsulates the logic for a single polling cycle.

```pseudocode
FUNCTION process_pending_outbox_events()
    // Step 1-- Fetch a batch of pending events from the database.
    // TEST-- The query correctly fetches events with 'PENDING' status, ordered by creation time.
    pending_events = DatabaseConnection.query(
        "SELECT * FROM outbox WHERE status = 'PENDING' ORDER BY created_at ASC LIMIT ?",
        Configuration.BATCH_SIZE
    )

    // TEST-- The service behaves correctly when no pending events are found.
    IF pending_events IS EMPTY
        Logger.info("No pending events to process in this cycle.")
        RETURN
    END IF

    Logger.info("Found ", LENGTH(pending_events), " events to process.")

    // Step 2-- Process each event individually.
    FOR EACH event IN pending_events
        TRY
            // This is the atomic unit of work for a single event.
            publish_and_update_event_status(event)
        CATCH processing_error
            // TEST-- An error processing one event does not stop the processing of others in the batch.
            Logger.error("Failed to process event_id-- ", event.id, ". Error-- ", processing_error)
            // The event remains 'PENDING' and will be retried in a future cycle.
            CONTINUE to next event
        END TRY
    END FOR
END FUNCTION
```

## 6. Core Logic-- Atomic Publication and Update

This function handles the critical tasks of publishing an event and updating its status. Failure at any point prevents the status update, ensuring at-least-once delivery.

```pseudocode
FUNCTION publish_and_update_event_status(event)
    // Step 1-- Publish the event to the message queue.
    TRY
        // TEST-- A valid event payload is successfully published to the correct message queue topic.
        MessageQueueClient.publish(event.event_name, event.payload)
        Logger.info("Successfully published event_id-- ", event.id)
    CATCH publication_error
        // TEST-- If publishing fails, the function throws an error and the event status is NOT updated.
        Logger.error("Failed to publish event_id-- ", event.id, " to message queue. Error-- ", publication_error)
        THROW publication_error // Propagate error to the calling loop.
    END CATCH

    // Step 2-- Update the event's status to 'PUBLISHED' in the database.
    TRY
        // TEST-- After a successful publication, the event's status is updated to 'PUBLISHED'.
        update_result = DatabaseConnection.execute(
            "UPDATE outbox SET status = 'PUBLISHED' WHERE id = ?",
            event.id
        )
        // Note-- Check if the update affected exactly one row for data consistency.
    CATCH database_error
        // CRITICAL-- This is a failure-prone state. The event was published, but its status was not updated.
        // This will lead to the event being published again in a future cycle.
        // The consumer of the event MUST be designed to be idempotent to handle this scenario gracefully.
        // TEST-- If the database update fails after successful publication, a critical error is logged.
        Logger.critical("CRITICAL-- Failed to update status for published event_id-- ", event.id, ". This will cause a duplicate event. Error-- ", database_error)
        THROW database_error // Propagate error to the calling loop.
    END CATCH
END FUNCTION