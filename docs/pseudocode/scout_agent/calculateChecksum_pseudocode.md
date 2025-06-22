# ScoutAgent calculateChecksum() Method Pseudocode

## FUNCTION calculateChecksum(content)

### Description
Calculates a SHA-256 checksum for the given file content. This is used to detect changes in files between scans.

### INPUT
- `content` -- STRING -- The content of the file for which to generate a checksum.

### PROCESS
1.  BEGIN
2.  -- TEST 'calculateChecksum should return a consistent hash for the same content' --
3.  -- TEST 'calculateChecksum should return different hashes for different content' --
4.  -- TEST 'calculateChecksum should handle empty string content' --
5.  -- TEST 'calculateChecksum should handle non-string input by throwing an error' --
6.
7.  Initialize a new hashing object using the SHA-256 algorithm.
8.  Update the hashing object with the `content`.
9.  Finalize the hash calculation and retrieve the result in hexadecimal format.
10.
11. RETURN the hexadecimal hash string.
12. END

### OUTPUT
- `String` -- The calculated SHA-256 checksum, represented as a hexadecimal string.