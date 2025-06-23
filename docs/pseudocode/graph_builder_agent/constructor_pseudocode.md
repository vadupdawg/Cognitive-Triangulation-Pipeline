# GraphBuilder Agent - Constructor Pseudocode

## `constructor(config)`

**Purpose:** Initializes a new instance of the `GraphBuilder` agent, establishing a connection to the Neo4j database.

**Inputs:**
-   `config`: An object containing configuration parameters, including Neo4j connection details (`uri`, `user`, `password`).

**Outputs:**
-   A new `GraphBuilder` instance.

**Pre-conditions:**
-   The `config` object must contain valid keys for `neo4j.uri`, `neo4j.user`, and `neo4j.password`.

**Post-conditions:**
-   A `GraphBuilder` object is created with the provided configuration.
-   The `neo4jDriver` property is instantiated and has successfully verified connectivity with the Neo4j database.

---

### Pseudocode

```pseudocode
CLASS GraphBuilder

    -- Properties
    PROPERTY config
    PROPERTY neo4jDriver

    -- Constructor
    FUNCTION constructor(config)
        -- TEST behavior: constructor should store the provided configuration
        -- INPUT: A valid config object
        -- OUTPUT: The instance's config property matches the input object
        this.config = config

        -- TDD ANCHOR: Test that the config object is assigned correctly.

        TRY
            -- Initialize the Neo4j driver using credentials from the config
            -- This step involves creating a driver instance which is the entry point
            -- to the Neo4j database.
            this.neo4jDriver = CREATE_NEO4J_DRIVER(
                config.neo4j.uri,
                config.neo4j.user,
                config.neo4j.password
            )

            -- Verify that the connection to the database is successful.
            -- This is a crucial step to ensure the agent can communicate with Neo4j.
            -- The verifyConnectivity method typically sends a simple query to the DB.
            this.neo4jDriver.verifyConnectivity()

            -- TDD ANCHOR: Test for successful driver instantiation and connectivity
            -- verification with valid credentials.

            LOG "Successfully connected to Neo4j."

        CATCH (error)
            -- If creating the driver or verifying connectivity fails,
            -- an error should be logged and handled.
            LOG "Failed to connect to Neo4j database."
            LOG "Error: " + error.message

            -- TDD ANCHOR: Test for proper error handling when connection fails
            -- due to invalid credentials.
            -- TDD ANCHOR: Test for proper error handling when the database is unavailable.

            -- Re-throw the error to be handled by the calling context,
            -- ensuring the application doesn't proceed with a non-functional DB connection.
            THROW new DatabaseConnectionError("Could not establish connection with Neo4j. Details: " + error.message)
        END TRY

        -- Return the initialized instance
        RETURN this

    END FUNCTION

END CLASS