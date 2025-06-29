/**
 * ConnectionManager - Manages client connections
 * 
 * Handles connection lifecycle, message parsing, and subscription management
 */

import { v4 as uuidv4 } from 'uuid';
import logger from '../../utils/logger.js';

export class ConnectionManager {
  constructor(server) {
    this.server = server;
    this.connections = new Map();
    this.subscriptions = new Map(); // connectionId -> Set of resource URIs
  }
  
  /**
   * Handle new connection
   */
  handleConnection(socket) {
    const connection = {
      id: uuidv4(),
      socket,
      clientInfo: null,
      buffer: '',
      isAlive: true,
      createdAt: new Date()
    };
    
    this.connections.set(connection.id, connection);
    logger.info(`New connection: ${connection.id} from ${socket.remoteAddress}`);
    
    // Set up socket handlers
    socket.on('data', (data) => this._handleData(connection, data));
    socket.on('close', () => this._handleClose(connection));
    socket.on('error', (error) => this._handleError(connection, error));
    
    // Set up keep-alive
    this._setupKeepAlive(connection);
    
    this.server.emit('connection', connection);
    
    return connection;
  }
  
  /**
   * Handle incoming data
   */
  async _handleData(connection, data) {
    try {
      connection.buffer += data.toString();
      
      // Try to parse complete messages
      let messages = [];
      let lines = connection.buffer.split('\n');
      
      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i].trim();
        if (line) {
          try {
            const message = JSON.parse(line);
            messages.push(message);
          } catch (e) {
            // Invalid JSON, send parse error
            const errorResponse = this.server.responseBuilder.parseError(null);
            await this.sendToConnection(connection.id, errorResponse);
          }
        }
      }
      
      // Keep incomplete line in buffer
      connection.buffer = lines[lines.length - 1];
      
      // Process messages
      for (const message of messages) {
        await this._processMessage(connection, message);
      }
      
    } catch (error) {
      logger.error(`Data handling error for connection ${connection.id}:`, error);
    }
  }
  
  /**
   * Process a single message
   */
  async _processMessage(connection, message) {
    try {
      // Check if it's a batch request
      if (Array.isArray(message)) {
        const responses = await Promise.all(
          message.map(req => this.server.requestHandler.handle(req, connection))
        );
        const batchResponse = this.server.responseBuilder.batch(responses);
        if (batchResponse.length > 0) {
          await this.sendToConnection(connection.id, batchResponse);
        }
      } else {
        // Single request
        const response = await this.server.requestHandler.handle(message, connection);
        if (response) {
          await this.sendToConnection(connection.id, response);
        }
      }
    } catch (error) {
      logger.error(`Message processing error:`, error);
      const errorResponse = this.server.responseBuilder.internalError(
        message.id,
        error.message
      );
      await this.sendToConnection(connection.id, errorResponse);
    }
  }
  
  /**
   * Handle connection close
   */
  _handleClose(connection) {
    logger.info(`Connection closed: ${connection.id}`);
    
    // Clean up subscriptions
    this.subscriptions.delete(connection.id);
    
    // Remove connection
    this.connections.delete(connection.id);
    
    this.server.emit('disconnect', connection);
  }
  
  /**
   * Handle connection error
   */
  _handleError(connection, error) {
    logger.error(`Connection error for ${connection.id}:`, error);
    
    // Close the connection
    if (connection.socket && !connection.socket.destroyed) {
      connection.socket.destroy();
    }
  }
  
  /**
   * Set up keep-alive mechanism
   */
  _setupKeepAlive(connection) {
    const pingInterval = setInterval(() => {
      if (!connection.isAlive) {
        // Connection is dead, close it
        clearInterval(pingInterval);
        connection.socket.destroy();
        return;
      }
      
      // Send ping
      connection.isAlive = false;
      const ping = this.server.responseBuilder.notification('ping', {
        timestamp: new Date().toISOString()
      });
      
      this.sendToConnection(connection.id, ping).then(() => {
        connection.isAlive = true;
      }).catch(() => {
        // Failed to send ping, connection is probably dead
        clearInterval(pingInterval);
      });
    }, 30000); // Ping every 30 seconds
    
    // Store interval reference for cleanup
    connection.pingInterval = pingInterval;
  }
  
  /**
   * Send message to specific connection
   */
  async sendToConnection(connectionId, message) {
    const connection = this.connections.get(connectionId);
    if (!connection || connection.socket.destroyed) {
      throw new Error(`Connection not found or destroyed: ${connectionId}`);
    }
    
    const data = JSON.stringify(message) + '\n';
    
    return new Promise((resolve, reject) => {
      connection.socket.write(data, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }
  
  /**
   * Broadcast message to all connections
   */
  async broadcast(message) {
    const promises = [];
    
    for (const [connectionId, connection] of this.connections) {
      if (!connection.socket.destroyed) {
        promises.push(
          this.sendToConnection(connectionId, message)
            .catch(error => logger.error(`Broadcast failed for ${connectionId}:`, error))
        );
      }
    }
    
    await Promise.all(promises);
  }
  
  /**
   * Get connection by ID
   */
  getConnection(connectionId) {
    return this.connections.get(connectionId);
  }
  
  /**
   * Get all connections
   */
  getAllConnections() {
    return Array.from(this.connections.values());
  }
  
  /**
   * Set client info for connection
   */
  setClientInfo(connectionId, clientInfo) {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.clientInfo = clientInfo;
    }
  }
  
  /**
   * Add resource subscription
   */
  addSubscription(connectionId, resourceUri) {
    if (!this.subscriptions.has(connectionId)) {
      this.subscriptions.set(connectionId, new Set());
    }
    
    this.subscriptions.get(connectionId).add(resourceUri);
    logger.debug(`Connection ${connectionId} subscribed to ${resourceUri}`);
  }
  
  /**
   * Remove resource subscription
   */
  removeSubscription(connectionId, resourceUri) {
    const subs = this.subscriptions.get(connectionId);
    if (subs) {
      subs.delete(resourceUri);
      logger.debug(`Connection ${connectionId} unsubscribed from ${resourceUri}`);
    }
  }
  
  /**
   * Get subscribers for a resource
   */
  getSubscribers(resourceUri) {
    const subscribers = [];
    
    for (const [connectionId, resources] of this.subscriptions) {
      if (resources.has(resourceUri)) {
        subscribers.push(connectionId);
      }
    }
    
    return subscribers;
  }
  
  /**
   * Close all connections
   */
  async closeAll() {
    const promises = [];
    
    for (const [connectionId, connection] of this.connections) {
      // Clear ping interval
      if (connection.pingInterval) {
        clearInterval(connection.pingInterval);
      }
      
      // Close socket
      if (!connection.socket.destroyed) {
        promises.push(new Promise((resolve) => {
          connection.socket.end(() => resolve());
        }));
      }
    }
    
    await Promise.all(promises);
    
    this.connections.clear();
    this.subscriptions.clear();
  }
}