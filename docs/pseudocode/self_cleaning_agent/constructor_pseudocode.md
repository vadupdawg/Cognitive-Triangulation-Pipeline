# SelfCleaningAgent `constructor` Pseudocode

## 1. Class-- SelfCleaningAgent

### 1.1. `constructor(dbClient, graphClient)`

#### **Purpose**
Initializes a new instance of the `SelfCleaningAgent`, setting up the necessary database and graph client connections.

#### **Inputs**
-   `dbClient` (Object)-- An active and configured client object for interacting with the SQLite database.
-   `graphClient` (Object)-- An active and configured driver object for interacting with the Neo4j graph database.

#### **Properties**
-   `sqliteDb` (Object)-- Stores the SQLite database client.
-   `neo4jDriver` (Object)-- Stores the Neo4j graph database driver.

#### **TDD Anchors**

-   **TEST_CONSTRUCTOR_HAPPY_PATH**-- Verify that `sqliteDb` and `neo4jDriver` properties are correctly assigned when valid clients are provided.
    -   `GIVEN` a valid `dbClient` and a valid `graphClient`.
    -   `WHEN` the `SelfCleaningAgent` is instantiated.
    -   `THEN` the `this.sqliteDb` property should be equal to the provided `dbClient`.
    -   `AND` the `this.neo4jDriver` property should be equal to the provided `graphClient`.

-   **TEST_CONSTRUCTOR_NULL_DB_CLIENT**-- Verify that the constructor handles a null `dbClient`. The expected behavior should be to throw an error.
    -   `GIVEN` a null `dbClient` and a valid `graphClient`.
    -   `WHEN` the `SelfCleaningAgent` is instantiated.
    -   `THEN` the constructor should throw an "Invalid database client" error.

-   **TEST_CONSTRUCTOR_NULL_GRAPH_CLIENT**-- Verify that the constructor handles a null `graphClient`. The expected behavior should be to throw an error.
    -   `GIVEN` a valid `dbClient` and a null `graphClient`.
    -   `WHEN` the `SelfCleaningAgent` is instantiated.
    -   `THEN` the constructor should throw an "Invalid graph client" error.

#### **Processing Logic**

1.  **START**
2.  **INPUT** `dbClient`, `graphClient`
3.  **CHECK** if `dbClient` is a valid, non-null object.
    -   **IF NOT**, **THROW** `Error("Invalid database client provided.")`.
4.  **CHECK** if `graphClient` is a valid, non-null object.
    -   **IF NOT**, **THROW** `Error("Invalid graph client provided.")`.
5.  **ASSIGN** `dbClient` to `this.sqliteDb`.
6.  **ASSIGN** `graphClient` to `this.neo4jDriver`.
7.  **END**