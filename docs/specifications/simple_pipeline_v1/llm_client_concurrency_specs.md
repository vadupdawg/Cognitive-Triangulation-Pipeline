# LLM Client Concurrency Enhancement Specification

**Version--** 1.0
**Date--** 2025-06-27
**Status--** Proposed

---

## 1. Overview

This document provides a detailed specification for enhancing the concurrency management of the `deepseekClient.js` module. This work is guided by the **"Simplicity-First"** path outlined in the `architectural_pivot_research_report.md`.

The primary goal is to replace the current, rudimentary queueing mechanism with a more robust, in-process semaphore-based concurrency manager. This will allow for more precise control over outbound API requests, maximizing throughput while respecting the API's rate limits, thereby resolving a critical performance bottleneck.

## 2. Scope

This specification applies exclusively to the `src/utils/deepseekClient.js` file. It involves refactoring the `DeepSeekClient` class and introducing a new `Semaphore` utility class.

## 3. Functional Requirements

- **FR-1--** The `DeepSeekClient` must use a semaphore to limit the number of concurrent outbound HTTPS requests to the DeepSeek API.
- **FR-2--** The maximum number of concurrent requests must be configurable.
- **FR-3--** The client must continue to queue incoming requests when the concurrency limit is reached.
- **FR-4--** The client must process queued requests in a First-In, First-Out (FIFO) order as semaphore slots become available.
- **FR-5--** The client must maintain its existing retry logic for failed requests. Acquiring a semaphore slot should be separate from the retry mechanism.

## 4. Non-Functional Requirements

- **NFR-1-- Performance--** The new implementation must significantly increase the client's ability to handle concurrent requests, improving overall pipeline throughput.
- **NFR-2-- Reliability--** The semaphore implementation must be robust, preventing race conditions and ensuring that semaphore slots are always released, even in the event of request errors.
- **NFR-3-- Maintainability--** The code should be clean, well-documented, and easy to understand to facilitate future modifications.

## 5. Class and Function Specifications

### 5.1. `Semaphore` Class (New Utility)

A new, general-purpose `Semaphore` class will be created to manage access to a limited number of resources. This could be in a new file or within `deepseekClient.js` if it's not intended for wider use.

**File--** `src/utils/semaphore.js` (Recommended) or defined within `deepseekClient.js`.

```javascript
/**
 * @class Semaphore
 * @description A simple semaphore implementation for controlling access to a limited number of resources.
 */
class Semaphore {
    /**
     * @property {number} count - The current number of available semaphore slots.
     */
    count;

    /**
     * @property {Array<function>} waiting - A queue of promises waiting to acquire a slot.
     */
    waiting;

    /**
     * @constructor
     * @param {number} initialCount - The total number of available slots.
     */
    constructor(initialCount) {
        // ... implementation
    }

    /**
     * @method acquire
     * @description Acquires a semaphore slot. If no slot is available, it waits until one is released.
     * @returns {Promise<void>} A promise that resolves when a slot has been acquired.
     */
    acquire() {
        // ... implementation
    }

    /**
     * @method release
     * @description Releases a semaphore slot, allowing a waiting promise to resolve.
     * @returns {void}
     */
    release() {
        // ... implementation
    }
}
```

### 5.2. `DeepSeekClient` Class (Refactored)

The existing `DeepSeekClient` class will be refactored to use the new `Semaphore`.

**File--** `src/utils/deepseekClient.js`

#### 5.2.1. Properties (Changes)

- **Remove `activeRequests`--** This counter becomes redundant and will be replaced by the semaphore's internal state.
- **Remove `requestQueue`--** The promise-based nature of the semaphore's waiting list will replace this manual queue.
- **Add `semaphore`--** A new property to hold an instance of the `Semaphore` class.

```javascript
class DeepSeekClient {
    /**
     * @property {Semaphore} semaphore - Manages concurrent access to the DeepSeek API.
     */
    semaphore;

    // ... other properties like baseURL, timeout, agent, _apiKey
}
```

#### 5.2.2. `constructor` (Changes)

The constructor will be updated to initialize the `semaphore` property.

```javascript
class DeepSeekClient {
    constructor() {
        this.baseURL = 'https://api.deepseek.com';
        this.timeout = 1800000;
        this.agent = new https.Agent({ keepAlive: false, maxSockets: 100 });
        
        // The maxConcurrentRequests property is now used to initialize the semaphore
        const maxConcurrentRequests = 4; 
        this.semaphore = new Semaphore(maxConcurrentRequests);
        
        this._apiKey = null;
    }
    // ...
}
```

#### 5.2.3. `_scheduleRequest` Method (Refactored)

This method will be completely redesigned. It will no longer manage a manual queue. Instead, it will use the semaphore to control the execution flow.

**Old Logic--**
- Pushes request details and promise handlers to `this.requestQueue`.
- Calls `this._processQueue()`.

**New Logic--**
- This method is **removed**. The logic will be integrated directly into the public-facing methods like `createChatCompletion`.

#### 5.2.4. `createChatCompletion` Method (Refactored)

This method will now be the primary entry point for managing concurrency.

```javascript
/**
 * @method createChatCompletion
 * @description Creates a chat completion request, managed by the semaphore.
 * @param {object} options - The options for the chat completion API call.
 * @returns {Promise<object>} A promise that resolves with the API response.
 */
async createChatCompletion(options) {
    console.log('[DeepSeekClient] Request received. Attempting to acquire semaphore...');
    
    // 1. Acquire a semaphore slot
    await this.semaphore.acquire();
    
    console.log('[DeepSeekClient] Semaphore acquired. Proceeding with request.');

    try {
        // 2. Once acquired, make the request
        const requestBody = JSON.stringify({ /* ... build body ... */ });
        // The retry logic is encapsulated within _makeRequestWithRetry
        return await this._makeRequestWithRetry('/chat/completions', 'POST', requestBody);
    } catch (error) {
        console.error('[DeepSeekClient] createChatCompletion failed after all retries:', error.message);
        // Re-throw the error to be handled by the caller
        throw error;
    } finally {
        // 3. ALWAYS release the semaphore slot
        console.log('[DeepSeekClient] Releasing semaphore.');
        this.semaphore.release();
    }
}
```

#### 5.2.5. `_processQueue` Method (Removed)

This method is no longer needed and will be **deleted**.

## 6. TDD Anchors / Pseudocode Stubs

### 6.1. `Semaphore.js`

```javascript
// TEST-- 'Semaphore should allow acquiring up to its initial count without waiting'
// TEST-- 'Semaphore should cause the (N+1)th acquire call to wait'
// TEST-- 'Semaphore release() should allow a waiting acquire() call to resolve'
// TEST-- 'Semaphore should handle multiple concurrent acquire and release calls correctly'

class Semaphore {
    constructor(initialCount) {
        this.count = initialCount;
        this.waiting = [];
    }

    acquire() {
        if (this.count > 0) {
            this.count--;
            return Promise.resolve();
        }
        // If no slots, push a new promise resolver to the waiting queue
        return new Promise(resolve => {
            this.waiting.push(resolve);
        });
    }

    release() {
        // If there are promises waiting, resolve the oldest one
        if (this.waiting.length > 0) {
            const next = this.waiting.shift();
            next();
        } else {
            // Otherwise, just increment the available slot count
            this.count++;
        }
    }
}
```

### 6.2. `deepseekClient.js`

```javascript
// TEST-- 'DeepSeekClient should initialize a semaphore with the correct count'
// TEST-- 'Calling createChatCompletion should acquire and release the semaphore'
// TEST-- 'When concurrency limit is reached, new calls to createChatCompletion should wait'
// TEST-- 'If a request fails, the semaphore must still be released'

// In DeepSeekClient class...
async createChatCompletion(options) {
    // BEHAVIOR-- Block until semaphore is acquired
    await this.semaphore.acquire();
    try {
        // BEHAVIOR-- Execute the request logic
        const response = await this._makeRequestWithRetry(/* ... */);
        return response;
    } finally {
        // BEHAVIOR-- Always release the semaphore
        this.semaphore.release();
    }
}

// The methods `call` and `query` should be refactored to use the new `createChatCompletion` flow.
async call(prompt) {
    const options = {
        messages: [
            { role: 'system', content: prompt.system },
            { role: 'user', content: prompt.user }
        ]
        // ... other default options
    };
    const response = await this.createChatCompletion(options);
    return {
        body: response.choices[0].message.content,
        usage: response.usage
    };
}
```

## 7. Edge Cases and Constraints

- **Constraint--** The solution must be entirely in-process, without adding new external services or dependencies (other than development dependencies for testing).
- **Edge Case 1--** If the application crashes mid-request, the in-process semaphore state is lost. This is an accepted limitation of the "Simplicity-First" approach.
- **Edge Case 2--** A very high volume of incoming requests could lead to a large `waiting` array within the semaphore, consuming memory. This is a potential but unlikely bottleneck for the current scale.
- **Edge Case 3--** The `timeout` in the `https.request` options must be handled correctly. If a request times out, the `finally` block in `createChatCompletion` must still execute to release the semaphore.

---
**End of Specification**