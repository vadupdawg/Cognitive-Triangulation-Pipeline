# Security Review Report: DirectoryResolutionWorker

**Report ID:** SEC-REP-20250625-DRW  
**Date:** 2025-06-25  
**Author:** AI Security Reviewer (SPARC Aligned)  
**Module:** `src/workers/directoryResolutionWorker.js`

---

## 1. Executive Summary

This report details the security assessment of the `DirectoryResolutionWorker`. The review was conducted via static analysis of the source code and related utility modules.

The overall security risk for this module is assessed as **HIGH**.

Two significant vulnerabilities were identified: one **CRITICAL** and one **HIGH**.

-   The **critical** vulnerability is a potential for **SQL Injection**. The implementation of the database client used by the worker could not be located, preventing verification of whether user-controlled input (`directoryPath`) is handled safely.
-   The **high** severity vulnerability is **Prompt Injection**. Data retrieved from the database is directly concatenated into a prompt for an LLM, creating an opportunity for an attacker who can control the database content to manipulate the LLM's behavior.

Minor issues related to data validation and logging were also found. Immediate remediation of the critical and high-severity vulnerabilities is strongly recommended.

---

## 2. Vulnerability Details

| ID | Vulnerability | Severity | Location | Description & Recommendation |
| --- | --- | --- | --- | --- |
| DRW-VULN-001 | **Potential SQL Injection** | **CRITICAL** | [`src/workers/directoryResolutionWorker.js:50`](src/workers/directoryResolutionWorker.js:50) | **Description:** The worker calls `this.dbClient.loadPoisForDirectory(directoryPath)`. The `directoryPath` parameter originates from the job data and is therefore user-controllable. The implementation of `loadPoisForDirectory` is not available for review due to a discrepancy where the worker imports a `DatabaseClient` that does not appear to be exported from `src/utils/sqliteDb.js`. If this method constructs a SQL query via string concatenation with the `directoryPath`, it is vulnerable to SQL Injection. <br><br> **Recommendation:**  **1. Resolve Code Discrepancy:** Correct the import in `directoryResolutionWorker.js` to use the `DatabaseManager` or fix the export in `sqliteDb.js`. **2. Enforce Parameterized Queries:** Ensure that the implementation of `loadPoisForDirectory` uses parameterized queries (prepared statements) exclusively. The `directoryPath` must be passed as a parameter, not concatenated into the SQL string. |
| DRW-VULN-002 | **Prompt Injection** | **HIGH** | [`src/workers/directoryResolutionWorker.js:76-82`](src/workers/directoryResolutionWorker.js:76-82) | **Description:** The `_resolveRelationships` method constructs a prompt by embedding POI data directly using `JSON.stringify(pois)`. This data is retrieved from the database and could be influenced by an upstream process. An attacker who can control the content of a POI (e.g., its name or other details) could inject malicious instructions into the prompt, potentially causing the LLM to ignore its original instructions, leak sensitive data from its context, or generate malicious output. <br><br> **Recommendation:** Implement a clear separation between instructions and data in the prompt. For example, use a format where the data is clearly demarcated and instruct the LLM to treat it solely as data for analysis, not as part of its operational instructions. Consider input sanitization on the POI data before it is ever stored in the database. |
| DRW-VULN-003 | **Inadequate Validation of LLM Output** | **MEDIUM** | [`src/workers/directoryResolutionWorker.js:85`](src/workers/directoryResolutionWorker.js:85) | **Description:** The response from the LLM is parsed using `JSON.parse`, but its structure is not validated against a schema. The code only performs basic checks for the existence of the `relationships` array and its elements. A malformed or malicious response from a compromised or manipulated LLM could lead to runtime errors or unexpected behavior (e.g., if `rel.from` is not a valid ID). <br><br> **Recommendation:** Implement strict schema validation on the parsed JSON object before it is used. Use a library like `ajv` to define and enforce a schema that ensures `relationships` is an array of objects, and that each object contains the required keys (`from`, `to`, `type`) with the correct data types. |
| DRW-VULN-004 | **Information Leakage in Logs** | **LOW** | [`src/workers/directoryResolutionWorker.js:87`](src/workers/directoryResolutionWorker.js:87) | **Description:** If `JSON.parse` fails, the entire raw response from the LLM is logged to the console. In a production environment, this could leak sensitive information contained within the LLM's context or lead to log flooding if the response is very large. <br><br> **Recommendation:** In production environments, avoid logging the full, raw response. Log a truncated version or only the relevant error metadata. |

---

## 3. Self-Reflection and Review Limitations

This security review was performed using static analysis of the provided JavaScript files. The primary limitation of this review is the inability to inspect the concrete implementation of the `DatabaseClient` class, specifically the `loadPoisForDirectory` and `execute` methods. The test files mock this dependency, which is good for unit testing but prevents a complete security audit of the data access layer from the worker's perspective.

The **CRITICAL** rating for the potential SQL injection is based on this uncertainty. If the underlying database client already uses parameterized queries correctly, the actual risk would be significantly lower. However, without being able to verify this, the worst-case scenario must be assumed.

The assessment of the Prompt Injection vulnerability is made with high confidence, as the pattern of mixing untrusted data with instructions in a prompt is a well-understood anti-pattern in LLM security.

No dynamic testing or dependency analysis (SCA) was performed as part of this review.

## 4. Quantitative Summary

-   **High/Critical Vulnerabilities:** 2
-   **Total Vulnerabilities:** 4
-   **Highest Severity:** CRITICAL