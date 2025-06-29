/**
 * ResponseBuilder - Builds MCP protocol responses
 * 
 * Provides consistent response formatting for the MCP protocol
 */

export class ResponseBuilder {
  /**
   * Build a successful response
   */
  success(id, result) {
    return {
      jsonrpc: '2.0',
      id,
      result
    };
  }
  
  /**
   * Build an error response
   */
  error(id, code, message, data = undefined) {
    const response = {
      jsonrpc: '2.0',
      id,
      error: {
        code,
        message
      }
    };
    
    if (data !== undefined) {
      response.error.data = data;
    }
    
    return response;
  }
  
  /**
   * Build a notification (no id)
   */
  notification(method, params) {
    return {
      jsonrpc: '2.0',
      method,
      params
    };
  }
  
  /**
   * Common error responses
   */
  parseError(id) {
    return this.error(id, -32700, 'Parse error');
  }
  
  invalidRequest(id) {
    return this.error(id, -32600, 'Invalid Request');
  }
  
  methodNotFound(id, method) {
    return this.error(id, -32601, 'Method not found', { method });
  }
  
  invalidParams(id, message) {
    return this.error(id, -32602, `Invalid params: ${message}`);
  }
  
  internalError(id, message) {
    return this.error(id, -32603, 'Internal error', message);
  }
  
  /**
   * Batch response builder
   */
  batch(responses) {
    return responses.filter(r => r !== null);
  }
}