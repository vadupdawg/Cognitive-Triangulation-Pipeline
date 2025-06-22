# ScoutAgent saveFilesToDb() Method Pseudocode

## ASYNC FUNCTION saveFilesToDb(files)

### Description
Inserts new file records or updates existing ones in the `files` database table. It uses a checksum and status check to determine if a file needs to be processed.

### INPUT
- `files` -- Array<Object> -- An array of file objects to be saved to the database. Each object should contain `filePath`, `language`, and `checksum`.

### PROCESS
1.  BEGIN
2.  -- TEST 'saveFilesToDb should handle an empty array of files' --
3.  -- TEST 'saveFilesToDb should handle database transaction errors gracefully' --
4.
5.  FOR EACH `file` in `files`:
6.      TRY
7.          -- Check if the file already exists in the database.
8.          `existingFile` = AWAIT QUERY `this.db` for a record in `files` table where `file_path` matches `file.filePath`.
9.
10.         IF `existingFile` is found:
11.             -- TEST 'saveFilesToDb should update an existing file if the checksum is different' --
12.             -- TEST 'saveFilesToDb should re-queue a file if its status is "error"' --
13.             -- TEST 'saveFilesToDb should re-queue a file if its status is "processing"' --
14.             -- TEST 'saveFilesToDb should not update a file if checksum is same and status is "completed"' --
15.             IF `existingFile.checksum` IS DIFFERENT from `file.checksum` OR `existingFile.status` IS NOT 'completed':
16.                 -- The file has been modified OR was left in a failed/stuck state.
17.                 -- Reset its status to 'pending' to ensure it gets re-processed.
18.                 AWAIT EXECUTE `this.db` UPDATE on `files` table--
19.                     SET `checksum` = `file.checksum`,
20.                         `last_modified` = current timestamp,
21.                         `status` = "pending" -- Always reset to pending
22.                     WHERE `id` = `existingFile.id`.
23.             END IF
24.         ELSE:
25.             -- The file is new, so insert it.
26.             -- TEST 'saveFilesToDb should insert a new file' --
27.             AWAIT EXECUTE `this.db` INSERT into `files` table (`file_path`, `language`, `checksum`, `status`)
28.             VALUES (`file.filePath`, `file.language`, `file.checksum`, "pending").
29.         END IF
30.     CATCH dbError
31.         PRINT "Error processing file " + `file.filePath` + "-- " + dbError.message
32.         -- Continue to the next file, or re-throw if the error is critical.
33.     END TRY
34. END FOR
35. END

### OUTPUT
- None. The method is asynchronous and returns a Promise that resolves when all database operations are complete.