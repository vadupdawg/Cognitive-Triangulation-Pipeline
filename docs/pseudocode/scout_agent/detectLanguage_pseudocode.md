# ScoutAgent detectLanguage() Method Pseudocode

## FUNCTION detectLanguage(filePath)

### Description
Determines the programming language of a file based on its file extension.

### INPUT
- `filePath` -- STRING -- The full path to the file being analyzed.

### PROCESS
1.  BEGIN
2.  -- TEST 'detectLanguage should handle null or empty filePath' --
3.  Extract the file extension from `filePath`. Let's call it `extension`.
4.  Convert `extension` to lowercase to ensure case-insensitive matching.
5.
6.  -- TEST 'detectLanguage should return JavaScript for .js files' --
7.  -- TEST 'detectLanguage should return Python for .py files' --
8.  -- TEST 'detectLanguage should return Java for .java files' --
9.  -- TEST 'detectLanguage should return SQL for .sql files' --
10. -- TEST 'detectLanguage should return unknown for unhandled extensions' --
11.
12. SWITCH `extension`:
13.     CASE ".js":
14.         RETURN "JavaScript"
15.     CASE ".py":
16.         RETURN "Python"
17.     CASE ".java":
18.         RETURN "Java"
19.     CASE ".sql":
20.         RETURN "SQL"
21.     DEFAULT:
22.         -- TEST 'detectLanguage should return "unknown" for a file with no extension' --
23.         RETURN "unknown"
24. END SWITCH
25. END

### OUTPUT
- `String` -- The name of the detected programming language (e.g., "JavaScript", "Python") or "unknown" if the language cannot be determined.