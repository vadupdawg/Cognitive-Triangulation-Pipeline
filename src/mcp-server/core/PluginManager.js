/**
 * PluginManager - Manages MCP server plugins
 * 
 * Handles plugin lifecycle, registration, and dependency management
 */

import path from 'path';
import { promises as fs } from 'fs';
import logger from '../../utils/logger.js';

export class PluginManager {
  constructor(server) {
    this.server = server;
    this.plugins = new Map();
    this.pluginOrder = [];
    this.initialized = false;
  }
  
  /**
   * Initialize all plugins
   */
  async initialize() {
    if (this.initialized) {
      return;
    }
    
    try {
      // Load built-in plugins
      await this._loadBuiltInPlugins();
      
      // Load custom plugins from plugins directory
      await this._loadCustomPlugins();
      
      // Initialize plugins in dependency order
      await this._initializePlugins();
      
      this.initialized = true;
      logger.info(`Initialized ${this.plugins.size} plugins`);
    } catch (error) {
      logger.error('Plugin initialization failed:', error);
      throw error;
    }
  }
  
  /**
   * Load built-in plugins
   */
  async _loadBuiltInPlugins() {
    const builtInPlugins = [
      { name: 'project-mapper', path: '../plugins/ProjectMapperPlugin.js' },
      { name: 'cognitive-triangulation', path: '../plugins/CognitiveTriangulationPlugin.js' },
      { name: 'code-analysis', path: '../plugins/CodeAnalysisPlugin.js' },
      { name: 'graph-navigator', path: '../plugins/GraphNavigatorPlugin.js' }
    ];
    
    for (const plugin of builtInPlugins) {
      try {
        const PluginClass = await import(plugin.path);
        await this.register(plugin.name, new PluginClass.default(this.server));
      } catch (error) {
        logger.warn(`Failed to load built-in plugin ${plugin.name}:`, error.message);
      }
    }
  }
  
  /**
   * Load custom plugins from directory
   */
  async _loadCustomPlugins() {
    const pluginsDir = path.join(process.cwd(), 'mcp-plugins');
    
    try {
      const exists = await fs.access(pluginsDir).then(() => true).catch(() => false);
      if (!exists) {
        return;
      }
      
      const files = await fs.readdir(pluginsDir);
      const pluginFiles = files.filter(f => f.endsWith('.js'));
      
      for (const file of pluginFiles) {
        try {
          const pluginPath = path.join(pluginsDir, file);
          const PluginClass = await import(pluginPath);
          const pluginName = path.basename(file, '.js').toLowerCase();
          
          await this.register(pluginName, new PluginClass.default(this.server));
        } catch (error) {
          logger.warn(`Failed to load custom plugin ${file}:`, error.message);
        }
      }
    } catch (error) {
      logger.debug('No custom plugins directory found');
    }
  }
  
  /**
   * Initialize plugins respecting dependencies
   */
  async _initializePlugins() {
    const initialized = new Set();
    const initializing = new Set();
    
    const initPlugin = async (name) => {
      if (initialized.has(name)) {
        return;
      }
      
      if (initializing.has(name)) {
        throw new Error(`Circular dependency detected for plugin: ${name}`);
      }
      
      initializing.add(name);
      const plugin = this.plugins.get(name);
      
      if (!plugin) {
        throw new Error(`Plugin not found: ${name}`);
      }
      
      // Initialize dependencies first
      if (plugin.dependencies) {
        for (const dep of plugin.dependencies) {
          await initPlugin(dep);
        }
      }
      
      // Initialize the plugin
      if (plugin.initialize) {
        await plugin.initialize();
      }
      
      initializing.delete(name);
      initialized.add(name);
    };
    
    // Initialize all plugins
    for (const name of this.pluginOrder) {
      await initPlugin(name);
    }
  }
  
  /**
   * Register a plugin
   */
  async register(name, plugin) {
    if (this.plugins.has(name)) {
      throw new Error(`Plugin already registered: ${name}`);
    }
    
    // Validate plugin interface
    if (!plugin || typeof plugin !== 'object') {
      throw new Error(`Invalid plugin: ${name}`);
    }
    
    this.plugins.set(name, plugin);
    this.pluginOrder.push(name);
    
    logger.debug(`Registered plugin: ${name}`);
    
    // If already initialized, initialize this plugin immediately
    if (this.initialized && plugin.initialize) {
      await plugin.initialize();
    }
  }
  
  /**
   * Get a plugin by name
   */
  get(name) {
    return this.plugins.get(name);
  }
  
  /**
   * Check if a plugin is registered
   */
  has(name) {
    return this.plugins.has(name);
  }
  
  /**
   * Get all registered plugins
   */
  getAll() {
    return Array.from(this.plugins.entries()).map(([name, plugin]) => ({
      name,
      plugin
    }));
  }
  
  /**
   * Shutdown all plugins
   */
  async shutdown() {
    // Shutdown in reverse order
    const reverseOrder = [...this.pluginOrder].reverse();
    
    for (const name of reverseOrder) {
      const plugin = this.plugins.get(name);
      if (plugin && plugin.shutdown) {
        try {
          await plugin.shutdown();
          logger.debug(`Shutdown plugin: ${name}`);
        } catch (error) {
          logger.error(`Error shutting down plugin ${name}:`, error);
        }
      }
    }
    
    this.plugins.clear();
    this.pluginOrder = [];
    this.initialized = false;
  }
}