# ScoutAgent discoverFiles() Method Pseudocode

## FUNCTION discoverFiles(directory)

### Description
Recursively scans a given directory to find all files. It ignores specified patterns (like `.git` and `node_modules`), determines the language of each file, and calculates a checksum for the file's content.

### INPUT
- `directory` -- STRING -- The path to the directory to begin scanning.

### PROCESS
1.  BEGIN
2.  -- TEST 'discoverFiles should return an empty array for an empty directory' --
3.  -- TEST 'discoverFiles should return an empty array for a directory that should be ignored' --
4.  Initialize an empty array `allFiles`.
5.  Get a list of all items (files and subdirectories) in the `directory`. Let's call it `items`.
6.  -- TEST 'discoverFiles should handle errors when reading a directory' --
7.
8.  FOR EACH `item` in `items`:
9.      Construct the full path: `fullPath` = `directory` + '/' + `item`.
10.
11.     -- TEST 'discoverFiles should correctly identify and skip ignored directories' --
12.     IF `fullPath` is a directory AND `fullPath` should NOT be ignored:
13.         -- Recursively call discoverFiles for the subdirectory.
14.         `subDirectoryFiles` = CALL `this.discoverFiles(fullPath)`.
15.         Append all elements from `subDirectoryFiles` to `allFiles`.
16.     ELSE IF `fullPath` is a file:
17.         -- Determine the file's language.
18.         `language` = CALL `this.detectLanguage(fullPath)`.
19.
20.         -- TEST 'discoverFiles should ignore files with unknown languages' --
21.         IF `language` is not 'unknown':
22.             Read the content of the file at `fullPath`. Let's call it `content`.
23.             -- TEST 'discoverFiles should handle errors when reading a file' --
24.
25.             -- Calculate the checksum of the file content.
26.             `checksum` = CALL `this.calculateChecksum(content)`.
27.
28.             -- Create a file object and add it to the list.
29.             -- TEST 'discoverFiles should return file objects with correct properties' --
30.             `fileObject` = { filePath: `fullPath`, language: `language`, checksum: `checksum` }
31.             Add `fileObject` to `allFiles`.
32.         END IF
33.     END IF
34. END FOR
35.
36. RETURN `allFiles`.
37. END

### OUTPUT
- `Array<Object>` -- An array of file objects. Each object has the following properties:
    - `filePath` -- STRING -- The full path to the file.
    - `language` -- STRING -- The detected programming language.
    - `checksum` -- STRING -- The SHA-256 checksum of the file's content.

### HELPER FUNCTION `shouldIgnore(path)`
- This is a conceptual helper. It would check if the path contains ignored directory names like `.git` or `node_modules`.
- TEST 'shouldIgnore should return true for .git directories'
- TEST 'shouldIgnore should return true for node_modules directories'
- TEST 'shouldIgnore should return false for other directories'