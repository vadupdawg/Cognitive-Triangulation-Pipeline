# Pseudocode for `EntityScout._generatePrompt()`

This document outlines the logic for the `_generatePrompt` method in the `EntityScout` agent.

## Method Signature

`private _generatePrompt(fileContent-- string)-- string`

## Purpose

To construct a precise and detailed prompt for the Large Language Model (LLM), instructing it to analyze a given code file's content and return a structured JSON object containing identified code entities and their relationships.

## SPARC Pseudocode

```pseudocode
FUNCTION _generatePrompt(fileContent)
  INPUT--
    fileContent -- The string content of the source code file to be analyzed.

  OUTPUT--
    prompt -- A formatted string that will be sent to the LLM.

  -- TDD Anchor-- TEST that the function returns a non-empty string when given valid content.
  -- TDD Anchor-- TEST that the returned prompt string contains the entirety of the input `fileContent`.
  -- TDD Anchor-- TEST that the prompt explicitly requests the output to be in JSON format.
  -- TDD Anchor-- TEST that the prompt provides a clear schema for the expected JSON (e.g., keys for 'entities' and 'relationships').

  -- 1. Define the core instruction and role for the LLM.
  DECLARE system_prompt_instructions AS STRING
  SET system_prompt_instructions = "You are an expert software engineer and code analyst. Your task is to analyze the provided source code file and extract key entities (like classes, functions, variables) and the relationships between them. Your output must be a single, valid JSON object, and nothing else. Do not include any explanatory text or markdown formatting before or after the JSON."

  -- 2. Define the expected JSON structure with examples.
  DECLARE json_schema_definition AS STRING
  SET json_schema_definition = `
    Your output MUST conform to the following JSON schema--
    {
      "entities"-- [
        {
          "type"-- "CLASS" -- "FUNCTION" -- "METHOD" -- "VARIABLE" -- "IMPORT" -- "EXPORT",
          "name"-- "The name of the entity",
          "startLine"-- "The starting line number of the entity definition",
          "endLine"-- "The ending line number of the entity definition"
        }
      ],
      "relationships"-- [
        {
          "source"-- "The name of the source entity",
          "target"-- "The name of the target entity",
          "type"-- "CALLS" -- "INHERITS_FROM" -- "IMPLEMENTS" -- "IMPORTS" -- "EXPORTS",
          "line"-- "The line number where the relationship occurs"
        }
      ]
    }
  `

  -- 3. Define the placeholder for the code to be analyzed.
  DECLARE code_section_header AS STRING
  SET code_section_header = "Analyze the following code--\n```\n"

  -- 4. Assemble the final prompt.
  DECLARE finalPrompt AS STRING
  
  -- Concatenate all parts of the prompt together.
  SET finalPrompt = system_prompt_instructions + "\n\n" + json_schema_definition + "\n\n" + code_section_header + fileContent + "\n```"

  -- 5. Return the fully constructed prompt.
  RETURN finalPrompt

ENDFUNCTION