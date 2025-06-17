//
// GraphIngestorAgent.js
//
// This agent is responsible for ingesting analysis results and refactoring tasks
// from the SQLite database into the Neo4j graph. It operates in batches and
// ensures that all graph modifications for a single batch are atomic.
//

const Ajv = require('ajv');
const neo4jDriver = require('../utils/neo4jDriver');
const sqliteDb = require('../utils/sqliteDb');
const {
  NEO4J_DATABASE
} = require('../../config');

// --- Security and Validation Setup ---

const ajv = new Ajv();

// Schema for validating the structure of the llm_output JSON.
const llmOutputSchema = {
  type: 'object',
  properties: {
    filePath: {
      type: 'string'
    },
    entities: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: {
            type: 'string'
          },
          name: {
            type: 'string'
          },
          qualifiedName: {
            type: 'string'
          },
        },
        required: ['type', 'name', 'qualifiedName'],
      },
    },
    relationships: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          source_qualifiedName: {
            type: 'string'
          },
          target_qualifiedName: {
            type: 'string'
          },
          type: {
            type: 'string'
          },
        },
        required: ['source_qualifiedName', 'target_qualifiedName', 'type'],
      },
    },
  },
  required: ['filePath', 'entities', 'relationships'],
};

const validateLlmOutput = ajv.compile(llmOutputSchema);

// Whitelists to prevent Cypher injection.
const ALLOWED_NODE_LABELS = new Set(['File', 'Function', 'Class', 'Variable', 'Interface', 'TypeAlias', 'Enum']);
const ALLOWED_REL_TYPES = new Set(['IMPORTS', 'EXPORTS', 'CONTAINS', 'CALLS', 'USES', 'EXTENDS', 'IMPLEMENTS']);


/**
 * Processes a batch of refactoring tasks, executing DELETE and RENAME operations.
 * @param {neo4j.Transaction} transaction The Neo4j transaction object.
 * @param {Array<Object>} refactoringBatch The batch of refactoring tasks.
 */
async function handleRefactoring(transaction, refactoringBatch) {
  for (const task of refactoringBatch) {
    if (task.type === 'DELETE') {
      const query = 'MATCH (n {filePath: $filePath}) DETACH DELETE n';
      await transaction.run(query, {
        filePath: task.old_path
      });
    } else if (task.type === 'RENAME') {
      const query = `
        MATCH (n {filePath: $old_path})
        SET n.filePath = $new_path,
            n.qualifiedName = replace(n.qualifiedName, $old_path, $new_path)
      `;
      await transaction.run(query, {
        old_path: task.old_path,
        new_path: task.new_path,
      });
    }
  }
}

/**
 * Removes properties with null or undefined values from an object.
 * @param {Object} obj The object to clean.
 * @returns {Object} The cleaned object.
 */
function removeNullValues(obj) {
  const newObj = {};
  for (const key in obj) {
    if (obj[key] != null) {
      newObj[key] = obj[key];
    }
  }
  return newObj;
}


/**
 * Prepares node and relationship data from the analysis batch.
 * This avoids iterating over the batch multiple times.
 * @param {Array<Object>} analysisBatch The batch of analysis results.
 * @returns {{nodesByLabel: Map<string, Array<Object>>, relsByType: Map<string, Array<Object>>}}
 */
function prepareGraphData(analysisBatch) {
  const nodesByLabel = new Map();
  const relsByType = new Map();

  for (const result of analysisBatch) {
    let llm_output;
    try {
      llm_output = JSON.parse(result.llm_output);
    } catch (e) {
      console.error(`Skipping record ${result.id} due to invalid JSON:`, e.message);
      continue; // Skip this record
    }

    if (!validateLlmOutput(llm_output)) {
      console.error(`Skipping record ${result.id} due to schema validation failure:`, validateLlmOutput.errors);
      continue; // Skip this record
    }

    // Prepare nodes
    if (llm_output.entities) {
      for (const entity of llm_output.entities) {
        if (!ALLOWED_NODE_LABELS.has(entity.type)) {
          console.warn(`Skipping entity with invalid label '${entity.type}' in record ${result.id}`);
          continue;
        }
        const label = entity.type;
        if (!nodesByLabel.has(label)) {
          nodesByLabel.set(label, []);
        }
        const properties = removeNullValues({
          qualifiedName: entity.qualifiedName,
          name: entity.name,
          filePath: entity.filePath,
          signature: entity.signature,
        });
        nodesByLabel.get(label).push(properties);
      }
    }

    // Prepare relationships
    if (llm_output.relationships) {
      for (const rel of llm_output.relationships) {
        if (!ALLOWED_REL_TYPES.has(rel.type)) {
          console.warn(`Skipping relationship with invalid type '${rel.type}' in record ${result.id}`);
          continue;
        }
        const type = rel.type;
        if (!relsByType.has(type)) {
          relsByType.set(type, []);
        }
        relsByType.get(type).push({
          source_qualifiedName: rel.source_qualifiedName,
          target_qualifiedName: rel.target_qualifiedName,
        });
      }
    }
  }

  return {
    nodesByLabel,
    relsByType
  };
}


/**
 * Creates all nodes from the analysis batch using an efficient UNWIND query.
 * @param {neo4j.Transaction} transaction The Neo4j transaction object.
 * @param {Map<string, Array<Object>>} nodesByLabel A map of node labels to node data.
 */
async function createNodes(transaction, nodesByLabel) {
  for (const [label, batch] of nodesByLabel.entries()) {
    if (batch.length > 0) {
      const query = `
        UNWIND $batch as properties
        MERGE (n:\`${label}\` {qualifiedName: properties.qualifiedName})
        SET n += properties
      `;
      await transaction.run(query, {
        batch
      });
    }
  }
}

/**
 * Creates all relationships from the analysis batch using an efficient UNWIND query.
 * @param {neo4j.Transaction} transaction The Neo4j transaction object.
 * @param {Map<string, Array<Object>>} relsByType A map of relationship types to relationship data.
 */
async function createRelationships(transaction, relsByType) {
  for (const [type, batch] of relsByType.entries()) {
    if (batch.length > 0) {
      const query = `
        UNWIND $batch as rel
        MATCH (source {qualifiedName: rel.source_qualifiedName})
        MATCH (target {qualifiedName: rel.target_qualifiedName})
        MERGE (source)-[r:\`${type}\`]->(target)
      `;
      await transaction.run(query, {
        batch
      });
    }
  }
}

/**
 * Updates the status of a batch of tasks in a specified table.
 * @param {string} tableName The name of the table to update.
 * @param {string} status The new status to set.
 * @param {Array<number>} ids The IDs of the tasks to update.
 */
async function updateTaskStatus(tableName, status, ids) {
  if (ids.length === 0) {
    return;
  }
  const placeholders = ids.map(() => '?').join(',');
  const query = `UPDATE ${tableName} SET status = ? WHERE id IN (${placeholders})`;
  await sqliteDb.execute(query, [status, ...ids]);
}


/**
 * Updates the status of processed tasks in SQLite after a successful Neo4j commit.
 * @param {Array<Object>} analysisBatch The batch of analysis results.
 * @param {Array<Object>} refactoringBatch The batch of refactoring tasks.
 */
async function markTasksAsCompleted(analysisBatch, refactoringBatch) {
  const analysisIds = analysisBatch.map((r) => r.id);
  await updateTaskStatus('analysis_results', 'ingested', analysisIds);

  const refactoringIds = refactoringBatch.map((t) => t.id);
  await updateTaskStatus('refactoring_tasks', 'completed', refactoringIds);
}

/**
 * Processes a batch of analysis and refactoring tasks, ingesting them into the graph.
 * @param {Array<Object>} analysisBatch The batch of analysis results.
 * @param {Array<Object>} refactoringBatch The batch of refactoring tasks.
 */
async function processBatch(analysisBatch, refactoringBatch) {
  if (!analysisBatch.length && !refactoringBatch.length) {
    return;
  }

  const session = neo4jDriver.session({
    database: NEO4J_DATABASE
  });
  const transaction = session.beginTransaction();

  try {
    // Prepare data first to avoid multiple iterations
    const {
      nodesByLabel,
      relsByType
    } = prepareGraphData(analysisBatch);

    await handleRefactoring(transaction, refactoringBatch);
    await createNodes(transaction, nodesByLabel);
    await createRelationships(transaction, relsByType);

    await transaction.commit();
    await markTasksAsCompleted(analysisBatch, refactoringBatch);
  } catch (error) {
    console.error('Graph ingestion failed, rolling back transaction:', error);
    await transaction.rollback();
    throw error; // Re-throw the error to allow the caller to handle it
  } finally {
    await session.close();
  }
}

module.exports = {
  processBatch,
  // Exporting for testing purposes
  prepareGraphData,
  handleRefactoring,
  createNodes,
  createRelationships,
  markTasksAsCompleted,
  updateTaskStatus,
};