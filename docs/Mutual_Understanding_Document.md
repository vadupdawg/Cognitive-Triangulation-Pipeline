# Mutual Understanding Document - Cognitive Triangulation Architecture

## 1. Project Vision

The core vision is to create a sophisticated, AI-driven cognitive triangulation pipeline that can analyze a directory of source code, understand its structure through multiple analytical perspectives, and represent it as a highly accurate knowledge graph in a Neo4j database. The system leverages cognitive triangulation methodology to achieve superior accuracy compared to single-pass analysis approaches, and aims to be language-agnostic (polyglot) serving a broad audience of developers, architects, and researchers who need to visualize and query complex codebases.

## 2. Core Objective

The primary objective is to automate the process of code comprehension through cognitive triangulation, using a three-stage pipeline:

1.  **Entity Discovery:** EntityScout identifies all relevant source code files within a target directory and extracts comprehensive entity information (functions, classes, variables, databases, tables, views) along with initial relationship detection.
2.  **Graph Construction:** GraphBuilder takes the structured entity reports from EntityScout and creates an initial knowledge graph in Neo4j, establishing nodes and foundational relationships based on the extracted data.
3.  **Cognitive Triangulation:** RelationshipResolver performs sophisticated multi-perspective analysis of the existing graph and entity data to discover, validate, and enhance relationships through cognitive triangulation methodology, significantly improving accuracy and confidence.

## 3. Cognitive Triangulation Methodology

The system implements true cognitive triangulation by:

*   **Multi-Perspective Analysis:** Analyzing code relationships from different analytical viewpoints (syntactic, semantic, contextual)
*   **Cross-Validation:** Verifying relationships through multiple analytical approaches and confidence scoring
*   **Iterative Refinement:** Progressively improving relationship accuracy through multiple analysis passes
*   **Contextual Awareness:** Considering broader project context when validating entity relationships

## 4. Key Success Criteria

The project's success will be measured primarily by these factors:

*   **Accuracy through Triangulation:** The final Neo4j graph must achieve superior accuracy compared to single-pass analysis, with measurable improvement in relationship detection and validation through the cognitive triangulation approach.
*   **Polyglot Capability:** The system must effectively analyze a wide variety of programming languages, correctly identifying entities and relationships regardless of language syntax.
*   **Confidence Scoring:** The system must provide confidence metrics for detected relationships, enabling quality assessment and validation.
*   **Scalability:** The cognitive triangulation approach must scale efficiently to enterprise-level codebases.

## 5. Testing Strategy

**CRITICAL REQUIREMENT: NO MOCKING POLICY**

All tests in this project must be production-grade and use live environments and resources. This is a strict, non-negotiable rule that applies to all testing activities:

*   **No Database Mocking:** Tests must use real SQLite and Neo4j databases, not mocked versions.
*   **No File System Mocking:** Tests must interact with actual files in the `polyglot-test/` directory.
*   **No API Mocking:** Tests must use real LLM API connections where applicable.
*   **Production Environment:** The `polyglot-test/` directory contains the actual application and databases that serve as the testing environment.

This approach ensures that tests validate real-world behavior and catch integration issues that mocks might miss. The testing environment is specifically designed to support this production-grade testing approach.

## 6. Target Audience

The system is intended for any individual or system that can benefit from a deep, structural understanding of a codebase through cognitive triangulation analysis. This includes, but is not limited to, individual developers, software architects, team leads, automated analysis systems, and research applications requiring high-confidence code relationship mapping.