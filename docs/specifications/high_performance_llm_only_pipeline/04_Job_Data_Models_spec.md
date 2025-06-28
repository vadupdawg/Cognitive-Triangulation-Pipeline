# Spec-- 04 - Job Data Models

**Version--** 1.0
**Date--** 2025-06-27
**Status--** Initial Draft

## 1. Overview

This document provides a centralized, canonical definition for the data structures (job payloads) passed between workers via the BullMQ message queues. Adhering to these contracts is critical for ensuring interoperability and preventing data corruption within the pipeline.

These models serve as the "API contract" between the `FileDiscoveryBatcher`, `LLMAnalysisWorker`, and `GraphIngestionWorker`.

## 2. Queue Definitions

*   **`llm-analysis-queue`**--
    *   **Producer--** `FileDiscoveryBatcher`
    *   **Consumer--** `LLMAnalysisWorker`
    *   **Payload--** `FileBatch`

*   **`graph-ingestion-queue`**--
    *   **Producer--** `LLMAnalysisWorker`
    *   **Consumer--** `GraphIngestionWorker`
    *   **Payload--** `GraphData`

## 3. Data Model Specifications

### 3.1. `FileBatch`

This is the data model for a job placed in the `llm-analysis-queue`. It represents a collection of source files that have been grouped together for analysis.

#### **JSON Schema**

```json
{
  "type": "object",
  "properties": {
    "batchId": {
      "type": "string",
      "format": "uuid",
      "description": "A unique identifier for this specific batch of files."
    },
    "files": {
      "type": "array",
      "description": "An array of file objects to be analyzed.",
      "items": {
        "type": "object",
        "properties": {
          "path": {
            "type": "string",
            "description": "The full, absolute path to the file."
          },
          "content": {
            "type": "string",
            "description": "The complete UTF-8 content of the file."
          }
        },
        "required": ["path", "content"]
      }
    }
  },
  "required": ["batchId", "files"]
}
```

#### **Example Payload**

```json
{
  "batchId": "a1b2c3d4-e5f6-7890-1234-567890abcdef",
  "files": [
    {
      "path": "/usr/src/app/src/main.js",
      "content": "import { Greeter } from './greeter';\n\nconst g = new Greeter();\ng.greet();"
    },
    {
      "path": "/usr/src/app/src/greeter.js",
      "content": "export class Greeter {\n  greet() {\n    console.log('Hello, world!');\n  }\n}"
    }
  ]
}
```

### 3.2. `GraphData`

This is the data model for a job placed in the `graph-ingestion-queue`. It contains the complete, consolidated graph structure for a batch, as returned by the LLM.

#### **JSON Schema**

```json
{
  "type": "object",
  "properties": {
    "batchId": {
      "type": "string",
      "format": "uuid",
      "description": "The unique identifier from the originating FileBatch job, used for traceability."
    },
    "graphJson": {
      "type": "object",
      "description": "The structured JSON output from the LLM.",
      "properties": {
        "pois": {
          "type": "array",
          "description": "An array of all Points of Interest (nodes) identified in the batch.",
          "items": { "$ref": "#/definitions/poi" }
        },
        "relationships": {
          "type": "array",
          "description": "An array of all relationships (edges) identified in the batch.",
          "items": { "$ref": "#/definitions/relationship" }
        }
      },
      "required": ["pois", "relationships"]
    }
  },
  "required": ["batchId", "graphJson"],
  "definitions": {
    "poi": {
      "type": "object",
      "properties": {
        "id": { "type": "string" },
        "type": { "type": "string", "enum": ["File", "Class", "Function", "Method", "Variable"] },
        "name": { "type": "string" },
        "filePath": { "type": "string" },
        "startLine": { "type": "integer" },
        "endLine": { "type": "integer" }
      },
      "required": ["id", "type", "name", "filePath", "startLine", "endLine"]
    },
    "relationship": {
      "type": "object",
      "properties": {
        "source": { "type": "string", "description": "The 'id' of the source POI." },
        "target": { "type": "string", "description": "The 'id' of the target POI." },
        "type": { "type": "string", "enum": ["IMPORTS", "DEFINES", "CALLS", "INSTANTIATES"] },
        "filePath": { "type": "string" }
      },
      "required": ["source", "target", "type", "filePath"]
    }
  }
}
```

#### **Example Payload**

```json
{
  "batchId": "a1b2c3d4-e5f6-7890-1234-567890abcdef",
  "graphJson": {
    "pois": [
      {
        "id": "/usr/src/app/src/main.js",
        "type": "File",
        "name": "/usr/src/app/src/main.js",
        "filePath": "/usr/src/app/src/main.js",
        "startLine": 1,
        "endLine": 4
      }
    ],
    "relationships": []
  }
}