# Architecture Document-- `LLMResponseSanitizer` Utility

## 1. Overview

The `LLMResponseSanitizer` is a crucial, shared utility module within the Cognitive Triangulation system. Its purpose is to act as a defensive layer between the agents and the Large Language Models (LLMs). LLM outputs, especially complex JSON structures, are probabilistic and prone to minor formatting errors (e.g., trailing commas, missing brackets, conversational text). This utility provides a centralized, robust solution for cleaning and repairing these common issues before attempting to parse the JSON, thereby increasing the overall resilience of the system.

## 2. Architectural Style

This component is designed as a **Static Utility Module** (or a Singleton/Static Class in object-oriented languages). It is stateless and exposes a set of pure functions for data transformation. It has no dependencies on other agents and is designed to be used by any component that interacts with an LLM.

## 3. Component Breakdown

### 3.1. `LLMResponseSanitizer` Module

A collection of static methods for cleaning raw string data.

#### Class Diagram (Conceptual)

```
+---------------------------------+
--      <<Utility>>               --
--      LLMResponseSanitizer      --
+---------------------------------+
--                                 --
+---------------------------------+
-- + static sanitize(rawResponse)    --
-- - static _fixTrailingCommas()   --
-- - static _completeTruncatedObject()--
-- - static _extractJsonFromMarkdown() --
+---------------------------------+
```

#### Methods

##### `static sanitize(rawResponse-- string)-- string`
- **Visibility:** `public`
- **Description:** The primary public method and entry point for the sanitization process. It orchestrates a sequence of cleaning operations to maximize the chance of producing a parsable JSON string.
- **Processing Chain:**
    1.  Trims leading/trailing whitespace.
    2.  Calls `_extractJsonFromMarkdown` to remove conversational text or code fences.
    3.  Calls `_fixTrailingCommas` to remove invalid trailing commas.
    4.  Calls `_completeTruncatedObject` to attempt to fix structural incompleteness.

##### `private static _extractJsonFromMarkdown(text-- string)-- string`
- **Visibility:** `private`
- **Description:** Uses a regular expression to find and extract the content from within a JSON markdown block (e.g., ` ```json ... ``` `). If no block is found, it returns the original string. This is crucial for handling LLMs that wrap their JSON output in explanatory text.

##### `private static _fixTrailingCommas(jsonString-- string)-- string`
- **Visibility:** `private`
- **Description:** Uses a regular expression to find and remove trailing commas that appear just before a closing brace (`}`) or bracket (`]`), which would otherwise cause a JSON parsing error.

##### `private static _completeTruncatedObject(jsonString-- string)-- string`
- **Visibility:** `private`
- **Description:** Performs a character-by-character scan of the string to count the balance of open and closed braces (`{}`) and brackets (`[]`), ignoring those inside string literals. It then appends the necessary closing characters to the end of the string to fix truncation issues.

## 4. Interaction Diagram (How it's Used)

This sequence diagram shows how an agent (like `EntityScout` or `RelationshipResolver`) uses the sanitizer.

```
[Agent] -> [LLM Client] : query(prompt)
    |
    |  <- rawResponse (String)
    |
[Agent] -> [LLMResponseSanitizer] : sanitize(rawResponse)
    |
    |  -> _extractJsonFromMarkdown()
    |  -> _fixTrailingCommas()
    |  -> _completeTruncatedObject()
    |
    |  <- sanitizedResponse (String)
    |
[Agent] -> JSON.parse(sanitizedResponse)
    |
    |  <- (Success) Parsed JSON Object
    |  <- (Failure) ParseException
```

## 5. Key Architectural Decisions

- **Centralized Logic:** By placing all sanitization logic in a single, shared utility, we avoid code duplication and ensure that all agents benefit from the same level of resilience. Any improvements made to the sanitizer are instantly available to all its consumers.
- **Stateless and Pure:** The utility is stateless. Its methods are pure functions that take a string and return a transformed string, without causing any side effects. This makes the component highly predictable, easy to reason about, and simple to test in isolation.
- **Chain of Responsibility:** The `sanitize` method applies a series of cleaning functions in a specific order. This "chain of responsibility" pattern allows for a multi-faceted approach to cleaning, where each function tackles a specific type of common error.