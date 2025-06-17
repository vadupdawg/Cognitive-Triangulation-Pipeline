# Primary Findings-- SQLite as a Work Queue (Part 1)

This document summarizes the initial findings on using SQLite as a message bus or work queue, with a focus on best practices for performance and concurrency, as specified in the project plan.

## Core Implementation Strategies

### Schema Design
A foundational best practice is to use a simple, well-defined table for the queue.

*   **Structure**: A central table should contain the messages and their metadata. An `AUTOINCREMENT` primary key is crucial for ensuring First-In-First-Out (FIFO) message ordering.
    ```sql
    CREATE TABLE work_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        -- Other columns like task data, status, etc.
        status TEXT NOT NULL DEFAULT 'pending',
        -- Foreign keys or payload data
        payload TEXT
    );
    ```
*   **Status Tracking**: A `status` column (e.g., `pending`, `processing`, `completed`, `failed`) is essential for tracking the state of each job and allowing workers to claim tasks.
*   **Indexing**: To ensure fast retrieval of pending jobs, the `status` column should be indexed. If workers claim jobs based on other criteria, those columns should also be indexed.
    ```sql
    CREATE INDEX idx_work_queue_status ON work_queue(status);
    ```

### Write-Ahead Logging (WAL) Mode
For any concurrent application, WAL mode is considered a necessity.

*   **Enabling WAL**: It can be enabled with a simple `PRAGMA` command.
    ```sql
    PRAGMA journal_mode=WAL;
    ```
*   **Benefits**: WAL allows for significantly improved concurrency by permitting multiple reader processes to operate simultaneously while a writer is in the middle of a transaction. This is a major improvement over the default `DELETE` journaling mode, which involves exclusive locks during writes.
*   **Synchronous Settings**: For high-throughput scenarios, the `synchronous` pragma can be set to `NORMAL`. This offers a good balance between performance and durability, as it only syncs at critical moments rather than at every single commit. For maximum durability, `FULL` should be used, but with a performance penalty.
    ```sql
    PRAGMA synchronous=NORMAL;
    ```

## Concurrency and Transaction Management

### Atomic Job Claiming
A critical challenge in a multi-worker queue is ensuring that each job is processed by exactly one worker.

*   **The `UPDATE ... RETURNING` Pattern**: For modern versions of SQLite (3.35.0+), this is the preferred method for atomically claiming a job. A worker can update a `pending` job's status to `processing` and have the database return the details of that job in a single, atomic operation. This eliminates the race condition where multiple workers might try to grab the same job.
    ```sql
    -- This query finds the oldest pending job, marks it as 'processing',
    -- and returns its ID and payload to the worker who ran the query.
    UPDATE work_queue
    SET status = 'processing'
    WHERE id = (
        SELECT id FROM work_queue WHERE status = 'pending' ORDER BY id ASC LIMIT 1
    )
    RETURNING id, payload;
    ```

### Transaction Management
Proper transaction management is key to performance.

*   **Batching Operations**: When adding multiple jobs to the queue or performing many updates, these operations should be wrapped in a single transaction. Executing many small, individual transactions is significantly slower due to the overhead of file I/O and locking for each commit.
    ```python
    # Example in Python
    # BEGIN TRANSACTION
    for item in work_items:
        cursor.execute("INSERT INTO work_queue (payload) VALUES (?)", (item,))
    # COMMIT
    connection.commit()
    ```

### Threading and Connection Management
*   **Single Writer Principle**: While WAL mode allows for many readers during a write, SQLite is still fundamentally limited to one writer at a time. Therefore, a common pattern is to have a dedicated writer thread or process that serializes all database writes.
*   **Busy Timeout**: For reader connections, setting a `busy_timeout` is a good practice. This tells the connection to wait and retry for a specified duration if the database is locked, which can happen briefly even in WAL mode. This prevents readers from failing immediately if they encounter a lock.
    ```python
    # Example in Python
    import sqlite3
    db = sqlite3.connect("my_queue.db", timeout=10) # Wait up to 10 seconds
    ```

## Performance and Maintenance

*   **Vacuuming**: After many jobs have been processed and deleted, the database file may not shrink automatically. Periodically running the `VACUUM` command reclaims this unused space. This should be done during periods of low activity, as it can be a blocking operation.
*   **WAL Checkpointing**: The WAL file can grow large. SQLite automatically performs checkpoints to move data from the WAL file back into the main database file, but the frequency can be tuned with `PRAGMA wal_autocheckpoint`.

## Limitations
*   **No Native Pub/Sub**: SQLite does not have a built-in notification system. Workers must poll the database to check for new jobs. This can be mitigated with a sleep interval and exponential backoff to avoid excessive CPU usage.
*   **Write Concurrency**: As mentioned, only one writer can be active at a time. For extremely high-volume write scenarios, another technology might be more suitable.

This initial research confirms that SQLite is a highly viable option for the project's work queue, provided these best practices are followed.