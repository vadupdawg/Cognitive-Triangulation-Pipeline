# Specification-- Hashing Contracts

**Version**: 1.0
**Date**: 2025-06-26
**Status**: Active

## 1. Overview

This document defines the official, non-negotiable contracts for creating deterministic hashes for various entities and relationships within the system. Adherence to these contracts is **critical** for the correct functioning of the `ValidationCoordinator`, as it relies on identical hashes from different workers to aggregate evidence.

Any component that creates a relationship hash **must** reference and implement the functions defined herein.

## 2. Hashing Algorithm

All hashes specified in this document MUST use the **SHA256** algorithm. The output should be a lowercase hexadecimal string.

## 3. Relationship Hash Contract

### `createRelationshipHash(sourcePoi, targetPoi, relationshipType)`

This function generates a unique, deterministic identifier for a relationship between two Points of Interest (POIs).

-   **Purpose**: To create a consistent key for storing and retrieving relationship evidence in the `ValidationCoordinator`'s cache.
-   **Determinism**: The order of inputs is critical. The function must always use the `source` POI first, then the `target` POI.

### 3.1. Parameters

-   `sourcePoi` (Object)-- The Point of Interest where the relationship originates. Must contain a `qualifiedName` property.
-   `targetPoi` (Object)-- The Point of Interest where the relationship terminates. Must contain a `qualifiedName` property.
-   `relationshipType` (String)-- The type of the relationship (e.g., `CALLS`, `IMPLEMENTS`, `EXTENDS`).

### 3.2. Logic

1.  Retrieve the `qualifiedName` from the `sourcePoi`. The `qualifiedName` is a globally unique identifier for a POI, such as `my.package.MyClass.myMethod(int)`.
2.  Retrieve the `qualifiedName` from the `targetPoi`.
3.  Retrieve the `relationshipType` string.
4.  Construct the input string by concatenating the three values, separated by a double colon (`::`). The format is `source.qualifiedName::target.qualifiedName::relationshipType`.
5.  Compute the SHA256 hash of the resulting string.

### 3.3. Pseudocode Implementation

```javascript
import { createHash } from 'crypto';

function createRelationshipHash(sourcePoi, targetPoi, relationshipType) {
  if (!sourcePoi || !sourcePoi.qualifiedName || !targetPoi || !targetPoi.qualifiedName || !relationshipType) {
    throw new Error('Invalid inputs for createRelationshipHash. All POIs must have a qualifiedName and relationshipType must be provided.');
  }

  const inputString = `${sourcePoi.qualifiedName}::${targetPoi.qualifiedName}::${relationshipType}`;

  return createHash('sha256').update(inputString).digest('hex');
}
```

### 3.4. Example

```
// Given:
const sourcePoi = { qualifiedName: 'com.example.ServiceA.doWork' };
const targetPoi = { qualifiedName: 'com.example.ServiceB.processData' };
const relationshipType = 'CALLS';

// Calculation:
const input = 'com.example.ServiceA.doWork::com.example.ServiceB.processData::CALLS';
const hash = createRelationshipHash(sourcePoi, targetPoi, relationshipType);

// Result:
// hash will be 'a3c8e...c9f1a' (the SHA256 of the input string)
```

## 4. Cross-Referencing

All specifications that previously mentioned `createRelationshipHash()` or a "relationship hash" must be considered implicitly updated to refer to this document as the single source of truth for the implementation. This includes, but is not limited to:
-   [`FileAnalysisWorker_v2_specs.md`](./FileAnalysisWorker_v2_specs.md)
-   [`DirectoryResolutionWorker_v2_specs.md`](./DirectoryResolutionWorker_v2_specs.md)
-   [`GlobalResolutionWorker_v2_specs.md`](./GlobalResolutionWorker_v2_specs.md)
-   [`ValidationCoordinator_specs.md`](./ValidationCoordinator_specs.md)
-   [`EntityScout_v2_specs.md`](./EntityScout_v2_specs.md)