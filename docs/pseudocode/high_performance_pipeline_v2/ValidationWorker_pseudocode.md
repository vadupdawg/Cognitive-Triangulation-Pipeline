# Pseudocode- `ValidationWorker`

## 1. Overview

The `ValidationWorker` is a crucial component in the evidence-gathering and relationship validation pipeline. It consumes findings from various upstream workers, persists them as evidence, and evaluates whether a potential relationship has enough supporting evidence to be considered "validated".

Its primary responsibilities are-
- Consume finding events- `file-analysis-completed`, `directory-summary-created`, and `global-relationship-candidate`.
- Persist the evidence associated with each finding.
- Track the completeness of evidence for each relationship candidate using an "upsert" pattern.
- Calculate a final, consolidated confidence score once all expected evidence is received.
- Publish a `relationship-validated` event if the confidence score meets a predefined threshold.

## 2. Constants and Configuration

```pseudocode
CONSTANT CONFIDENCE_THRESHOLD = 0.85 // The minimum score to consider a relationship validated
CONSTANT INPUT_QUEUES = ["file-analysis-completed", "directory-summary-created", "global-relationship-candidate"]
CONSTANT OUTPUT_QUEUE = "relationship-validated"
```

## 3. Data Structures

### Evidence

```pseudocode
OBJECT Evidence
    STRING evidence_id      // Unique identifier for this piece of evidence
    STRING relationship_id  // Foreign key to the relationship, generated deterministically
    STRING source_worker    // e.g., 'FileAnalysisWorker', 'GlobalResolutionWorker'
    STRING event_type       // The type of event that generated this evidence
    JSON   payload          // The actual data from the event
    FLOAT  confidence_score // The score assigned by the source worker
END OBJECT
```

### RelationshipValidationState

A lightweight object to track the progress of evidence collection for a single relationship.
```pseudocode
OBJECT RelationshipValidationState
    STRING relationship_id          // Unique, deterministic identifier for the relationship
    INTEGER expected_evidence_count // The total number of evidence pieces expected
    INTEGER received_evidence_count // Counter for currently received evidence
END OBJECT
```

## 4. Main Worker Logic

```pseudocode
FUNCTION ValidationWorker_Main()
    // TDD Anchor- TEST worker initializes and connects to dependencies successfully
    INITIALIZE messageQueueClient
    INITIALIZE databaseClient

    // TDD Anchor- TEST worker subscribes to all specified input queues
    FOR each queueName in INPUT_QUEUES
        messageQueueClient.subscribe(queueName, handleFindingEvent)
    END FOR

    LOG "ValidationWorker started and listening for finding events."
    // The worker will now process events asynchronously via the handleFindingEvent callback
END FUNCTION
```

## 5. Event Handling

```pseudocode
FUNCTION handleFindingEvent(event)
    // TDD Anchor- TEST event handler rejects malformed or invalid event structures
    VALIDATE event structure and required fields (e.g., payload with nodes, type, confidence)
    IF validation fails
        LOG_ERROR "Received invalid event", event
        RETURN // Discard the event
    END IF

    // Extract node and relationship type information from the event payload.
    // We assume the payload contains source and target nodes with unique, stable IDs and properties.
    OBJECT sourceNode = event.payload.source_node // e.g., { type: "File", properties: { id: "/path/to/fileA.js" } }
    OBJECT targetNode = event.payload.target_node // e.g., { type: "File", properties: { id: "/path/to/fileB.js" } }
    STRING relationshipType = event.payload.relationship_type // e.g., "CALLS"

    // TDD Anchor- TEST that relationship_id is correctly re-generated using the deterministic function
    // Note: The node objects passed here must contain the stable ID in their properties.
    STRING relationship_id = generateDeterministicRelationshipId(sourceNode, targetNode, relationshipType)

    // TDD Anchor- TEST that evidence is correctly created from a valid event
    Evidence new_evidence = CREATE Evidence WITH {
        relationship_id: relationship_id, // Use the generated ID
        source_worker: event.source_worker,
        event_type: event.type,
        payload: event.payload,
        confidence_score: event.payload.confidence_score
    }

    // Pass the expected count if the event provides it (e.g., from GlobalResolutionWorker).
    INTEGER expected_count = event.payload.expected_evidence_count // This may be null

    // Persist and check if validation can proceed
    processNewEvidence(relationship_id, new_evidence, expected_count)

END FUNCTION
```

## 6. Evidence Processing and Validation Trigger

```pseudocode
FUNCTION processNewEvidence(relationship_id, new_evidence, expected_evidence_count_from_event)
    TRY
        // TDD Anchor- TEST that evidence is successfully persisted in the database
        databaseClient.save("evidences", new_evidence)

        // The following block must be executed atomically to prevent race conditions.
        // ATOMIC_TRANSACTION
            // TDD Anchor- TEST that the state is created correctly if it doesn't exist (upsert pattern)
            RelationshipValidationState state = databaseClient.find_by_id("validation_states", relationship_id)

            IF state IS NULL
                // First time seeing this relationship, create its state.
                // The GlobalResolutionWorker event should set the initial expectation.
                INTEGER initial_expected_count = expected_evidence_count_from_event OR 1

                state = CREATE RelationshipValidationState WITH {
                    relationship_id: relationship_id,
                    expected_evidence_count: initial_expected_count,
                    received_evidence_count: 1
                }
                // TDD Anchor- TEST that a new state is saved with received_evidence_count = 1
                databaseClient.save("validation_states", state)
            ELSE
                // State exists, just increment the counter.
                // Update expected count if a more authoritative event arrives.
                IF expected_evidence_count_from_event IS NOT NULL AND expected_evidence_count_from_event > state.expected_evidence_count
                    state.expected_evidence_count = expected_evidence_count_from_event
                END IF

                // TDD Anchor- TEST that received_evidence_count is incremented atomically
                state.received_evidence_count += 1
                databaseClient.update("validation_states", relationship_id, state)
            END IF
        // END_ATOMIC_TRANSACTION

        // TDD Anchor- TEST that calculateAndValidateConfidence is NOT called if evidence is still pending
        LOG "Evidence for " + relationship_id + " is now " + state.received_evidence_count + "/" + state.expected_evidence_count

        // Check if all expected evidence has arrived
        // TDD Anchor- TEST that calculateAndValidateConfidence IS called when received_count equals expected_count
        IF state.received_evidence_count >= state.expected_evidence_count
            calculateAndValidateConfidence(relationship_id)
        END IF

    CATCH databaseError
        LOG_ERROR "Failed to process new evidence due to database error.", databaseError
        // Potentially re-queue the event for a retry
    END TRY
END FUNCTION
```

## 7. Confidence Calculation and Publishing

```pseudocode
FUNCTION calculateAndValidateConfidence(relationship_id)
    // TDD Anchor- TEST that all evidence for a given relationship_id is fetched correctly
    LIST<Evidence> all_evidence = databaseClient.find("evidences", {relationship_id: relationship_id})

    // TDD Anchor- TEST confidence score calculation with a standard set of evidence scores
    FLOAT final_score = calculateWeightedAverage(all_evidence)
    LOG "Final confidence score for " + relationship_id + " is " + final_score

    // TDD Anchor- TEST that a 'relationship-validated' event IS published when score > threshold
    IF final_score >= CONFIDENCE_THRESHOLD
        publishValidatedRelationship(relationship_id, final_score, all_evidence)
    ELSE
        // TDD Anchor- TEST that NO event is published when score < threshold
        LOG "Relationship " + relationship_id + " did not meet the confidence threshold."
    END IF

    // TDD Anchor- TEST that state and evidence data are cleaned up after processing
    cleanupProcessedRelationship(relationship_id)
END FUNCTION
```

## 8. Helper Functions

```pseudocode
FUNCTION publishValidatedRelationship(relationship_id, final_score, all_evidence)
    // TDD Anchor- TEST that relationship data is correctly consolidated from multiple evidence pieces
    OBJECT consolidated_data = consolidateRelationshipData(all_evidence)
    IF consolidated_data IS NULL
        LOG_ERROR "Failed to consolidate relationship data for " + relationship_id + ". Aborting publish."
        RETURN
    END IF

    // Enrich the relationship properties with the final calculated score and evidence count
    consolidated_data.relationship.properties.final_confidence_score = final_score
    consolidated_data.relationship.properties.supporting_evidence_count = all_evidence.length

    // TDD Anchor- TEST that the published event contains the rich, consolidated data structure matching GraphBuilder's expectation
    Event validated_event = CREATE Event WITH {
        type: "relationship-validated",
        source_worker: "ValidationWorker",
        payload: consolidated_data // This is the rich object
    }

    messageQueueClient.publish(OUTPUT_QUEUE, validated_event)
    LOG "Published 'relationship-validated' event for " + relationship_id
END FUNCTION

FUNCTION consolidateRelationshipData(all_evidence)
    // Synthesizes the final node and relationship data from all collected evidence.
    // It prioritizes evidence from the most authoritative source.
    // TDD Anchor- TEST consolidation with missing global-relationship-candidate evidence.
    IF all_evidence IS EMPTY
        RETURN NULL
    END IF

    // The 'global-relationship-candidate' event is considered the most authoritative source.
    Evidence authoritative_evidence = all_evidence.find(e -> e.event_type == "global-relationship-candidate")

    // If no global candidate, fallback to the evidence with the highest initial confidence.
    IF authoritative_evidence IS NULL
        SORT all_evidence by confidence_score DESC
        authoritative_evidence = all_evidence[0]
        LOG_WARN "No 'global-relationship-candidate' found. Using best available evidence from " + authoritative_evidence.source_worker
    END IF

    // TDD Anchor- TEST that the payload from the authoritative source is cloned correctly.
    // We expect a payload structure that matches what GraphBuilderWorker needs.
    OBJECT payload = authoritative_evidence.payload
    IF payload.source_node IS NULL OR payload.target_node IS NULL OR payload.relationship_type IS NULL
        LOG_ERROR "Authoritative evidence payload is malformed.", payload
        RETURN NULL
    END IF

    // Construct the rich object for the event, matching the GraphBuilderWorker contract
    OBJECT consolidated_data = {
        source: {
            label: payload.source_node.type,
            properties: payload.source_node.properties
        },
        target: {
            label: payload.target_node.type,
            properties: payload.target_node.properties
        },
        relationship: {
            type: payload.relationship_type,
            properties: payload.relationship_properties OR {}
        }
    }

    RETURN consolidated_data
END FUNCTION

FUNCTION cleanupProcessedRelationship(relationship_id)
    // To prevent re-processing and to keep the database clean.
    databaseClient.delete("evidences", {relationship_id: relationship_id})
    databaseClient.delete("validation_states", {id: relationship_id})
    LOG "Cleaned up state and evidence for processed relationship " + relationship_id
END FUNCTION

FUNCTION calculateWeightedAverage(all_evidence)
    FLOAT final_score = 0.0
    FLOAT total_weight = 0.0
    FOR each evidence in all_evidence
        FLOAT weight = getWeightForEvidence(evidence.event_type)
        final_score += evidence.confidence_score * weight
        total_weight += weight
    END FOR
    IF total_weight > 0
        RETURN final_score / total_weight
    ELSE
        RETURN 0.0
    END IF
END FUNCTION

FUNCTION getWeightForEvidence(event_type)
    // TDD Anchor- TEST that weights are returned correctly for all known event types
    SWITCH event_type
        CASE "global-relationship-candidate"- RETURN 1.5
        CASE "directory-summary-created"- RETURN 1.2
        CASE "file-analysis-completed"- RETURN 1.0
        DEFAULT- RETURN 0.5
    END SWITCH
END FUNCTION
```

## 9. Shared Helper Functions

```pseudocode
// This function is conceptually shared across workers that deal with relationships.
FUNCTION generateDeterministicRelationshipId(nodeA, nodeB, relationshipType)
    // The node objects must contain a stable unique ID within their 'properties'.
    // TDD Anchor- TEST that function throws error if node properties or id is missing.
    STRING idA = nodeA.properties.id
    STRING idB = nodeB.properties.id

    // TDD Anchor- TEST that nodeA and nodeB IDs are correctly ordered alphabetically
    LIST<STRING> node_ids = [idA, idB]
    SORT node_ids alphabetically

    // TDD Anchor- TEST that the concatenated string is formed correctly regardless of initial node order
    STRING combined_key = node_ids[0] + "--" + node_ids[1] + "--" + relationshipType

    // TDD Anchor- TEST that the hash function produces a consistent, expected output for a given key
    RETURN "SHA256(" + combined_key + ")" // Represents a stable hashing algorithm
END FUNCTION