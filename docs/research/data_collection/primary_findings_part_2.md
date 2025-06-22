# Primary Findings, Part 2: Best Practices for Streaming File I/O in Node.js

This document addresses the critical architectural flaw of in-memory file processing identified in the post-mortem report. The research focuses on the correct, scalable approach to handling large files in a Node.js environment using streams.

## 1. The Core Problem: In-Memory Reading

The previous `WorkerAgent` used `fs.readFile()`, which loads the entire contents of a file into a single buffer in memory. This is the root cause of the system's memory-related crashes and makes it impossible to process files larger than the available heap space.

## 2. The Solution: `fs.createReadStream()`

The idiomatic and scalable solution in Node.js is to use `fs.createReadStream()`. This method reads the file in manageable chunks, emitting `data` events for each chunk. This approach keeps memory usage low and predictable, regardless of the file's size.

## 3. Best Practices for Implementation

### 3.1. Basic Chunk-by-Chunk Processing

The most direct way to process a file is to listen for stream events. This "flowing mode" is the default behavior.

```javascript
import { createReadStream } from 'node:fs';

// highWaterMark controls the size of each chunk (in bytes).
const stream = createReadStream('path/to/large-file.log', { 
  encoding: 'utf-8',
  highWaterMark: 64 * 1024 // 64KB chunks
});

stream.on('data', (chunk) => {
  // Process each chunk here.
  // For example, append to a temporary buffer or send to a processor.
  console.log(`Received ${chunk.length} bytes of data.`);
});

stream.on('end', () => {
  // This event fires when the entire file has been read.
  console.log('Finished reading the file.');
});

stream.on('error', (error) => {
  // Critical for handling file system errors (e.g., file not found).
  console.error('An error occurred:', error);
});
```

### 3.2. Handling Line-by-Line Data (e.g., Logs, CSV)

For text-based files where processing happens on a per-line basis, the `readline` module is the ideal tool. It is built on top of streams and handles the complexity of identifying line breaks that may span across multiple chunks.

```javascript
import { createReadStream } from 'fs';
import * as readline from 'node:readline';

const fileStream = createReadStream('path/to/large-file.csv');

const rl = readline.createInterface({
  input: fileStream,
  crlfDelay: Infinity // Handles all types of line endings
});

rl.on('line', (line) => {
  // Process each line individually.
  console.log(`Line from file: ${line}`);
});

rl.on('close', () => {
  console.log('Finished reading all lines.');
});
```

### 3.3. Managing Back-Pressure with `pipe()`

Back-pressure is a crucial concept where a readable stream slows down its reading rate to match a slower writable stream. The easiest way to handle this is with the `stream.pipe()` method, which automates the process.

While the `WorkerAgent` will be sending data to an LLM API (not a standard writable stream), the *principle* of back-pressure is key. The agent should not read from the file faster than it can send the data to the API and receive a response. This implies a "paused" stream model.

### 3.4. Paused Mode for Controlled Processing

In a "paused" stream, data is only read when explicitly requested with the `stream.read()` method. This gives the consumer full control over the data flow, which is ideal for the `WorkerAgent`'s use case.

```javascript
const stream = createReadStream('path/to/large-file.txt', { highWaterMark: 64 * 1024 });

stream.on('readable', async () => {
  let chunk;
  while (null !== (chunk = stream.read())) {
    // We have a chunk. Pause the stream while we process it.
    stream.pause();
    
    // Simulate an async operation, like sending the chunk to an LLM.
    await processChunk(chunk);

    // Resume the stream to get the next chunk.
    stream.resume();
  }
});

stream.on('end', () => {
  console.log('File processing complete.');
});
```
This pattern ensures the `WorkerAgent` only holds one chunk of the file in memory at a time and naturally implements back-pressure against the file system.

## 4. Conclusion

Adopting a streaming-first approach with `fs.createReadStream` is non-negotiable for the new architecture. It directly solves the memory-intensiveness that caused the previous system's failure. The "paused" mode, in particular, offers the fine-grained control needed to interact with external, rate-limited APIs like an LLM, providing a robust model for the `WorkerAgent`'s core logic.

**Source(s):** General AI Search (Perplexity) on Node.js file streaming best practices.