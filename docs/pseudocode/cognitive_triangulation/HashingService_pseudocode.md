# Pseudocode-- HashingService

**Version**: 1.0
**Status**: Final
**Author**: Pseudocode Writer (AI)

## 1. Introduction

This document provides the detailed, language-agnostic pseudocode for the `HashingService`. This service is responsible for creating deterministic hashes for entities and relationships, as defined in the [`hashing_contracts.md`](docs/specifications/cognitive_triangulation/hashing_contracts.md:1) specification. The logic herein is the single source of truth for implementation.

## 2. Dependencies

- A standard library or utility capable of computing a SHA256 hash.

## 3. Module-- HashingService

This module encapsulates all hashing-related logic.

---

### FUNCTION createRelationshipHash

Generates a unique, deterministic SHA256 hash for a relationship between two Points of Interest (POIs).

**INPUTS**:
- `sourcePoi` (Object)-- The originating POI. Must contain a non-empty `qualifiedName` string property.
- `targetPoi` (Object)-- The terminating POI. Must contain a non-empty `qualifiedName` string property.
- `relationshipType` (String)-- The non-empty type of the relationship (e.g., `CALLS`).

**OUTPUT**:
- (String)-- A lowercase hexadecimal string representing the SHA256 hash.
- (Exception)-- Throws an error if any input is invalid.

**LOGIC**:

```pseudocode
BEGIN FUNCTION createRelationshipHash(sourcePoi, targetPoi, relationshipType)

  -- TDD Anchor-- Input Validation
  -- TEST-- Throws an error if sourcePoi is null, undefined, or lacks a qualifiedName.
  -- TEST-- Throws an error if targetPoi is null, undefined, or lacks a qualifiedName.
  -- TEST-- Throws an error if relationshipType is null, undefined, or an empty string.
  IF sourcePoi IS NULL OR sourcePoi.qualifiedName IS NULL OR sourcePoi.qualifiedName IS EMPTY THEN
    THROW new Error("Invalid input-- sourcePoi must be an object with a non-empty qualifiedName.")
  END IF

  IF targetPoi IS NULL OR targetPoi.qualifiedName IS NULL OR targetPoi.qualifiedName IS EMPTY THEN
    THROW new Error("Invalid input-- targetPoi must be an object with a non-empty qualifiedName.")
  END IF

  IF relationshipType IS NULL OR relationshipType IS EMPTY THEN
    THROW new Error("Invalid input-- relationshipType must be a non-empty string.")
  END IF

  -- Main Logic
  TRY
    -- Step 1-- Construct the canonical string for hashing.
    -- The format is strictly-- source.qualifiedName::target.qualifiedName::relationshipType
    DECLARE inputString AS String
    inputString = CONCATENATE(
        sourcePoi.qualifiedName,
        "::",
        targetPoi.qualifiedName,
        "::",
        relationshipType
    )

    -- TDD Anchor-- Correct string construction
    -- TEST-- Ensures the concatenated string exactly matches the specified format for a known set of inputs.

    -- Step 2-- Compute the SHA256 hash of the string.
    DECLARE hashResult AS String
    hashResult = COMPUTE_SHA256(inputString)

    -- Step 3-- Ensure the hash is in lowercase hexadecimal format.
    -- (This is often the default output, but we state it for clarity).
    hashResult = TO_LOWERCASE(hashResult)

    -- TDD Anchor-- Correct Hash Generation (Happy Path)
    -- TEST-- Generates the correct, known SHA256 hash for a standard, valid set of inputs.
    -- TEST-- Generates a different hash if the order of source and target POIs is swapped.
    -- TEST-- The resulting hash is always a lowercase hexadecimal string.

    -- Step 4-- Return the final hash.
    RETURN hashResult

  CATCH UnforeseenException
    -- This handles any unexpected errors during the hashing process itself.
    LOG "An unexpected error occurred during hash computation."
    RETHROW UnforeseenException
  END TRY

END FUNCTION