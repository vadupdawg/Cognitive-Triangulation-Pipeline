/**
 * RequestHandler - Handles MCP protocol requests
 * 
 * Routes requests to appropriate handlers and manages request lifecycle
 */

import logger from '../../utils/logger.js';

export class RequestHandler {
  constructor(server) {
    this.server = server;
    this.handlers = new Map();
    this.middleware = [];
  }
  
  /**
   * Register a request handler
   */
  registerHandler(method, handler) {
    if (this.handlers.has(method)) {
      logger.warn(`Overwriting handler for method: ${method}`);
    }
    
    this.handlers.set(method, handler);
    logger.debug(`Registered handler for method: ${method}`);
  }
  
  /**
   * Unregister a request handler
   */
  unregisterHandler(method) {
    this.handlers.delete(method);
  }
  
  /**
   * Add middleware function
   */
  use(middleware) {
    if (typeof middleware !== 'function') {
      throw new Error('Middleware must be a function');
    }
    
    this.middleware.push(middleware);
  }
  
  /**
   * Handle incoming request
   */
  async handle(request, connection) {
    const startTime = Date.now();
    
    try {
      // Validate request structure
      this._validateRequest(request);
      
      // Add connection context
      request.connectionId = connection.id;
      
      // Run middleware
      for (const mw of this.middleware) {
        const result = await mw(request, connection);
        if (result === false) {
          // Middleware rejected request
          return null;
        }
      }
      
      // Get handler for method
      const handler = this.handlers.get(request.method);
      if (!handler) {
        return {
          jsonrpc: '2.0',
          id: request.id,
          error: {
            code: -32601,
            message: `Method not found: ${request.method}`
          }
        };
      }
      
      // Execute handler with timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout')), this.server.config.requestTimeout);
      });
      
      const response = await Promise.race([
        handler(request),
        timeoutPromise
      ]);
      
      // Log request metrics
      const duration = Date.now() - startTime;
      logger.debug(`Request ${request.method} completed in ${duration}ms`);
      
      return response;
      
    } catch (error) {
      logger.error(`Request handler error for ${request.method}:`, error);
      
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32603,
          message: 'Internal error',
          data: error.message
        }
      };
    }
  }
  
  /**
   * Validate request structure
   */
  _validateRequest(request) {
    if (!request || typeof request !== 'object') {
      throw new Error('Invalid request: must be an object');
    }
    
    if (request.jsonrpc !== '2.0') {
      throw new Error('Invalid request: jsonrpc must be "2.0"');
    }
    
    if (!request.method || typeof request.method !== 'string') {
      throw new Error('Invalid request: method is required and must be a string');
    }
    
    if (request.id !== undefined && typeof request.id !== 'string' && typeof request.id !== 'number') {
      throw new Error('Invalid request: id must be a string or number');
    }
  }
  
  /**
   * Get all registered methods
   */
  getMethods() {
    return Array.from(this.handlers.keys());
  }
  
  /**
   * Check if method is registered
   */
  hasMethod(method) {
    return this.handlers.has(method);
  }
}