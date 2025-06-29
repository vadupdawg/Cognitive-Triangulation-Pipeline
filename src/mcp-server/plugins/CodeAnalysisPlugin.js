/**
 * CodeAnalysisPlugin - Provides code analysis capabilities
 * 
 * This plugin offers tools for analyzing code structure, complexity,
 * and relationships within a project.
 */

import path from 'path';
import { promises as fs } from 'fs';
import sqliteDb from '../../utils/sqliteDb.js';
import logger from '../../utils/logger.js';

export default class CodeAnalysisPlugin {
  constructor(server) {
    this.server = server;
    this.name = 'code-analysis';
    this.description = 'Analyzes code structure and relationships';
    this.dependencies = ['project-mapper'];
  }
  
  async initialize() {
    logger.info('Initializing CodeAnalysis plugin');
    
    // Register tools
    this._registerTools();
    
    // Register resources
    this._registerResources();
  }
  
  _registerTools() {
    // Tool: Analyze code complexity
    this.server.registerTool('code-analysis/complexity', {
      description: 'Analyze code complexity metrics',
      inputSchema: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'Path to file to analyze'
          },
          projectId: {
            type: 'string',
            description: 'Project ID from scan'
          },
          metrics: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['cyclomatic', 'cognitive', 'halstead', 'maintainability']
            },
            default: ['cyclomatic', 'cognitive']
          }
        },
        required: ['filePath']
      },
      handler: this._analyzeComplexity.bind(this)
    });
    
    // Tool: Find code patterns
    this.server.registerTool('code-analysis/find-patterns', {
      description: 'Find specific code patterns or anti-patterns',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: {
            type: 'string',
            description: 'Project ID'
          },
          patterns: {
            type: 'array',
            items: {
              type: 'string',
              enum: [
                'singleton',
                'factory',
                'observer',
                'god-class',
                'long-method',
                'duplicate-code',
                'circular-dependency'
              ]
            }
          }
        },
        required: ['projectId', 'patterns']
      },
      handler: this._findPatterns.bind(this)
    });
    
    // Tool: Generate call graph
    this.server.registerTool('code-analysis/call-graph', {
      description: 'Generate function/method call graph',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: {
            type: 'string',
            description: 'Project ID'
          },
          entryPoint: {
            type: 'string',
            description: 'Entry point function/file'
          },
          maxDepth: {
            type: 'integer',
            default: 5,
            description: 'Maximum call depth to trace'
          }
        },
        required: ['projectId']
      },
      handler: this._generateCallGraph.bind(this)
    });
    
    // Tool: Analyze dependencies
    this.server.registerTool('code-analysis/dependency-graph', {
      description: 'Analyze and visualize dependencies',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: {
            type: 'string',
            description: 'Project ID'
          },
          scope: {
            type: 'string',
            enum: ['file', 'module', 'package'],
            default: 'module'
          },
          includeExternal: {
            type: 'boolean',
            default: false,
            description: 'Include external dependencies'
          }
        },
        required: ['projectId']
      },
      handler: this._analyzeDependencies.bind(this)
    });
  }
  
  _registerResources() {
    // Resource: Code metrics
    this.server.registerResource('code-analysis://metrics', {
      name: 'Code Metrics',
      description: 'Aggregate code metrics for the project',
      mimeType: 'application/json',
      handler: this._getCodeMetrics.bind(this)
    });
    
    // Resource: Quality report
    this.server.registerResource('code-analysis://quality-report', {
      name: 'Code Quality Report',
      description: 'Comprehensive code quality analysis',
      mimeType: 'application/json',
      handler: this._getQualityReport.bind(this)
    });
  }
  
  // Tool handlers
  
  async _analyzeComplexity({ filePath, projectId, metrics }) {
    try {
      const db = await sqliteDb.getConnection();
      
      // Get file content
      const fileContent = await fs.readFile(filePath, 'utf-8');
      
      // Get POIs for the file
      const file = await db.get(`
        SELECT * FROM files
        WHERE file_path = ?
        ${projectId ? 'AND project_id = ?' : ''}
      `, projectId ? [filePath, projectId] : [filePath]);
      
      if (!file) {
        throw new Error('File not found in project database');
      }
      
      const pois = await db.all(`
        SELECT * FROM pois
        WHERE file_id = ?
      `, [file.id]);
      
      const results = {};
      
      // Calculate requested metrics
      if (metrics.includes('cyclomatic')) {
        results.cyclomatic = this._calculateCyclomaticComplexity(fileContent, pois);
      }
      
      if (metrics.includes('cognitive')) {
        results.cognitive = this._calculateCognitiveComplexity(fileContent, pois);
      }
      
      if (metrics.includes('halstead')) {
        results.halstead = this._calculateHalsteadMetrics(fileContent);
      }
      
      if (metrics.includes('maintainability')) {
        results.maintainability = this._calculateMaintainabilityIndex(results);
      }
      
      return {
        file: filePath,
        metrics: results,
        summary: this._getComplexitySummary(results)
      };
      
    } catch (error) {
      logger.error('Complexity analysis failed:', error);
      throw error;
    }
  }
  
  async _findPatterns({ projectId, patterns }) {
    try {
      const db = await sqliteDb.getConnection();
      const foundPatterns = {};
      
      for (const pattern of patterns) {
        foundPatterns[pattern] = await this._detectPattern(db, projectId, pattern);
      }
      
      // Count total instances
      const totalInstances = Object.values(foundPatterns)
        .reduce((sum, instances) => sum + instances.length, 0);
      
      return {
        projectId,
        patternsSearched: patterns.length,
        totalInstances,
        patterns: foundPatterns
      };
      
    } catch (error) {
      logger.error('Pattern detection failed:', error);
      throw error;
    }
  }
  
  async _generateCallGraph({ projectId, entryPoint, maxDepth }) {
    try {
      const db = await sqliteDb.getConnection();
      
      // Build call graph
      const graph = {
        nodes: new Map(),
        edges: []
      };
      
      // Find entry point
      let startPoi;
      if (entryPoint) {
        startPoi = await db.get(`
          SELECT p.* FROM pois p
          JOIN files f ON p.file_id = f.id
          WHERE f.project_id = ?
          AND (p.name = ? OR f.file_path = ?)
          LIMIT 1
        `, [projectId, entryPoint, entryPoint]);
      } else {
        // Find main entry points
        startPoi = await db.get(`
          SELECT p.* FROM pois p
          JOIN files f ON p.file_id = f.id
          WHERE f.project_id = ?
          AND p.name IN ('main', 'index', 'app', 'start')
          LIMIT 1
        `, [projectId]);
      }
      
      if (!startPoi) {
        throw new Error('Entry point not found');
      }
      
      // Trace calls recursively
      await this._traceCallsRecursive(db, startPoi, graph, 0, maxDepth, new Set());
      
      return {
        projectId,
        entryPoint: startPoi.name,
        nodeCount: graph.nodes.size,
        edgeCount: graph.edges.length,
        graph: {
          nodes: Array.from(graph.nodes.values()),
          edges: graph.edges
        }
      };
      
    } catch (error) {
      logger.error('Call graph generation failed:', error);
      throw error;
    }
  }
  
  async _analyzeDependencies({ projectId, scope, includeExternal }) {
    try {
      const db = await sqliteDb.getConnection();
      
      // Get all imports/dependencies
      const dependencies = await db.all(`
        SELECT 
          f1.file_path as source_file,
          f2.file_path as target_file,
          r.type,
          COUNT(*) as reference_count
        FROM relationships r
        JOIN pois p1 ON r.source_poi_id = p1.id
        JOIN pois p2 ON r.target_poi_id = p2.id
        JOIN files f1 ON p1.file_id = f1.id
        JOIN files f2 ON p2.file_id = f2.id
        WHERE f1.project_id = ?
        AND r.type IN ('IMPORTS', 'DEPENDS_ON', 'USES')
        GROUP BY f1.file_path, f2.file_path, r.type
      `, [projectId]);
      
      // Group by scope
      const grouped = this._groupDependenciesByScope(dependencies, scope);
      
      // Filter external if needed
      const filtered = includeExternal ? grouped : 
        grouped.filter(d => !this._isExternalDependency(d.target));
      
      // Detect circular dependencies
      const circular = this._detectCircularDependencies(filtered);
      
      return {
        projectId,
        scope,
        totalDependencies: filtered.length,
        circularDependencies: circular.length,
        dependencies: filtered,
        circular
      };
      
    } catch (error) {
      logger.error('Dependency analysis failed:', error);
      throw error;
    }
  }
  
  // Resource handlers
  
  async _getCodeMetrics() {
    try {
      const db = await sqliteDb.getConnection();
      
      const metrics = await db.get(`
        SELECT 
          COUNT(DISTINCT f.id) as total_files,
          COUNT(DISTINCT f.language) as languages,
          COUNT(p.id) as total_pois,
          COUNT(CASE WHEN p.type = 'FUNCTION' THEN 1 END) as functions,
          COUNT(CASE WHEN p.type = 'CLASS' THEN 1 END) as classes,
          COUNT(r.id) as relationships,
          AVG(f.size) as avg_file_size,
          MAX(f.size) as max_file_size
        FROM files f
        LEFT JOIN pois p ON f.id = p.file_id
        LEFT JOIN relationships r ON p.id = r.source_poi_id
      `);
      
      return {
        type: 'application/json',
        data: metrics
      };
      
    } catch (error) {
      logger.error('Failed to get code metrics:', error);
      return {
        type: 'text/plain',
        text: 'Failed to retrieve code metrics'
      };
    }
  }
  
  async _getQualityReport() {
    try {
      const db = await sqliteDb.getConnection();
      
      // Aggregate quality metrics
      const report = {
        summary: {
          overallScore: 0,
          strengths: [],
          weaknesses: [],
          recommendations: []
        },
        metrics: {},
        issues: []
      };
      
      // Check for common issues
      
      // Large files
      const largeFiles = await db.all(`
        SELECT file_path, size 
        FROM files 
        WHERE size > 1000
        ORDER BY size DESC
        LIMIT 10
      `);
      
      if (largeFiles.length > 0) {
        report.issues.push({
          type: 'large_files',
          severity: 'medium',
          count: largeFiles.length,
          files: largeFiles
        });
      }
      
      // Complex functions
      const complexFunctions = await db.all(`
        SELECT p.name, f.file_path, p.complexity_score
        FROM pois p
        JOIN files f ON p.file_id = f.id
        WHERE p.type = 'FUNCTION'
        AND p.complexity_score > 10
        ORDER BY p.complexity_score DESC
        LIMIT 10
      `);
      
      if (complexFunctions.length > 0) {
        report.issues.push({
          type: 'complex_functions',
          severity: 'high',
          count: complexFunctions.length,
          functions: complexFunctions
        });
      }
      
      // Calculate overall score
      report.summary.overallScore = this._calculateQualityScore(report);
      
      // Generate recommendations
      report.summary.recommendations = this._generateRecommendations(report);
      
      return {
        type: 'application/json',
        data: report
      };
      
    } catch (error) {
      logger.error('Failed to generate quality report:', error);
      return {
        type: 'text/plain',
        text: 'Failed to generate quality report'
      };
    }
  }
  
  // Helper methods
  
  _calculateCyclomaticComplexity(content, pois) {
    // Simplified cyclomatic complexity calculation
    const functions = pois.filter(p => p.type === 'FUNCTION');
    const complexities = {};
    
    for (const func of functions) {
      // Count decision points
      const funcContent = this._extractFunctionContent(content, func);
      const decisionPoints = (funcContent.match(/if|else|case|for|while|catch|\?/g) || []).length;
      complexities[func.name] = decisionPoints + 1;
    }
    
    return {
      functions: complexities,
      average: Object.values(complexities).reduce((a, b) => a + b, 0) / functions.length || 0
    };
  }
  
  _calculateCognitiveComplexity(content, pois) {
    // Simplified cognitive complexity calculation
    const functions = pois.filter(p => p.type === 'FUNCTION');
    const complexities = {};
    
    for (const func of functions) {
      const funcContent = this._extractFunctionContent(content, func);
      let complexity = 0;
      
      // Increment for control flow
      complexity += (funcContent.match(/if|else if|else/g) || []).length;
      complexity += (funcContent.match(/for|while|do/g) || []).length * 2;
      complexity += (funcContent.match(/catch/g) || []).length;
      
      // Increment for nesting (simplified)
      const nestingLevel = this._estimateNestingLevel(funcContent);
      complexity += nestingLevel;
      
      complexities[func.name] = complexity;
    }
    
    return {
      functions: complexities,
      average: Object.values(complexities).reduce((a, b) => a + b, 0) / functions.length || 0
    };
  }
  
  _calculateHalsteadMetrics(content) {
    // Simplified Halstead metrics
    const operators = content.match(/[+\-*/%=<>!&|^~?:]/g) || [];
    const operands = content.match(/\b\w+\b/g) || [];
    
    const n1 = new Set(operators).size; // Unique operators
    const n2 = new Set(operands).size;  // Unique operands
    const N1 = operators.length;         // Total operators
    const N2 = operands.length;          // Total operands
    
    const vocabulary = n1 + n2;
    const length = N1 + N2;
    const volume = length * Math.log2(vocabulary);
    const difficulty = (n1 / 2) * (N2 / n2);
    const effort = volume * difficulty;
    
    return {
      vocabulary,
      length,
      volume: Math.round(volume),
      difficulty: Math.round(difficulty),
      effort: Math.round(effort)
    };
  }
  
  _calculateMaintainabilityIndex(metrics) {
    // Simplified maintainability index
    const halstead = metrics.halstead || { volume: 1000, effort: 10000 };
    const cyclomatic = metrics.cyclomatic?.average || 5;
    
    // MI = 171 - 5.2 * ln(V) - 0.23 * CC - 16.2 * ln(LOC)
    const mi = Math.max(0, Math.min(100, 
      171 - 5.2 * Math.log(halstead.volume) - 0.23 * cyclomatic
    ));
    
    return {
      index: Math.round(mi),
      rating: mi > 85 ? 'A' : mi > 65 ? 'B' : mi > 50 ? 'C' : 'D'
    };
  }
  
  _extractFunctionContent(content, func) {
    // Simplified function extraction
    const lines = content.split('\n');
    const startLine = func.line_start || 0;
    const endLine = func.line_end || lines.length;
    
    return lines.slice(startLine - 1, endLine).join('\n');
  }
  
  _estimateNestingLevel(content) {
    // Simplified nesting level estimation
    let maxNesting = 0;
    let currentNesting = 0;
    
    for (const char of content) {
      if (char === '{') {
        currentNesting++;
        maxNesting = Math.max(maxNesting, currentNesting);
      } else if (char === '}') {
        currentNesting--;
      }
    }
    
    return maxNesting;
  }
  
  _getComplexitySummary(metrics) {
    const summary = {
      overall: 'good',
      concerns: []
    };
    
    if (metrics.cyclomatic?.average > 10) {
      summary.concerns.push('High cyclomatic complexity');
      summary.overall = 'needs-attention';
    }
    
    if (metrics.cognitive?.average > 15) {
      summary.concerns.push('High cognitive complexity');
      summary.overall = 'needs-attention';
    }
    
    if (metrics.maintainability?.rating === 'D') {
      summary.concerns.push('Low maintainability');
      summary.overall = 'poor';
    }
    
    return summary;
  }
  
  async _detectPattern(db, projectId, pattern) {
    // Pattern detection logic would be implemented here
    // This is a simplified example
    const instances = [];
    
    switch (pattern) {
      case 'singleton':
        // Look for singleton pattern
        const singletons = await db.all(`
          SELECT p.*, f.file_path
          FROM pois p
          JOIN files f ON p.file_id = f.id
          WHERE f.project_id = ?
          AND p.type = 'CLASS'
          AND p.description LIKE '%getInstance%'
        `, [projectId]);
        
        instances.push(...singletons.map(s => ({
          file: s.file_path,
          name: s.name,
          line: s.line_start
        })));
        break;
        
      case 'god-class':
        // Look for classes with too many methods
        const godClasses = await db.all(`
          SELECT p.name, f.file_path, COUNT(*) as method_count
          FROM pois p
          JOIN files f ON p.file_id = f.id
          JOIN pois methods ON methods.file_id = f.id
          WHERE f.project_id = ?
          AND p.type = 'CLASS'
          AND methods.type = 'METHOD'
          GROUP BY p.id
          HAVING method_count > 20
        `, [projectId]);
        
        instances.push(...godClasses.map(g => ({
          file: g.file_path,
          name: g.name,
          methodCount: g.method_count
        })));
        break;
    }
    
    return instances;
  }
  
  async _traceCallsRecursive(db, poi, graph, depth, maxDepth, visited) {
    if (depth >= maxDepth || visited.has(poi.id)) {
      return;
    }
    
    visited.add(poi.id);
    
    // Add node
    if (!graph.nodes.has(poi.id)) {
      graph.nodes.set(poi.id, {
        id: poi.id,
        name: poi.name,
        type: poi.type,
        depth
      });
    }
    
    // Find calls from this POI
    const calls = await db.all(`
      SELECT r.*, p.*
      FROM relationships r
      JOIN pois p ON r.target_poi_id = p.id
      WHERE r.source_poi_id = ?
      AND r.type IN ('CALLS', 'INVOKES', 'USES')
    `, [poi.id]);
    
    for (const call of calls) {
      // Add edge
      graph.edges.push({
        source: poi.id,
        target: call.target_poi_id,
        type: call.type
      });
      
      // Recurse
      await this._traceCallsRecursive(db, call, graph, depth + 1, maxDepth, visited);
    }
  }
  
  _groupDependenciesByScope(dependencies, scope) {
    switch (scope) {
      case 'file':
        return dependencies;
        
      case 'module':
        // Group by directory
        const modules = {};
        for (const dep of dependencies) {
          const sourceModule = path.dirname(dep.source_file);
          const targetModule = path.dirname(dep.target_file);
          const key = `${sourceModule}:${targetModule}`;
          
          if (!modules[key]) {
            modules[key] = {
              source: sourceModule,
              target: targetModule,
              references: 0
            };
          }
          modules[key].references += dep.reference_count;
        }
        return Object.values(modules);
        
      case 'package':
        // Group by top-level directory
        // Implementation would go here
        return dependencies;
    }
  }
  
  _isExternalDependency(path) {
    return path.includes('node_modules') || 
           path.startsWith('http') ||
           !path.startsWith('.');
  }
  
  _detectCircularDependencies(dependencies) {
    const circular = [];
    const graph = new Map();
    
    // Build adjacency list
    for (const dep of dependencies) {
      if (!graph.has(dep.source)) {
        graph.set(dep.source, []);
      }
      graph.get(dep.source).push(dep.target);
    }
    
    // DFS to detect cycles
    const visited = new Set();
    const recursionStack = new Set();
    
    const hasCycle = (node, path = []) => {
      visited.add(node);
      recursionStack.add(node);
      path.push(node);
      
      const neighbors = graph.get(node) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (hasCycle(neighbor, [...path])) {
            return true;
          }
        } else if (recursionStack.has(neighbor)) {
          // Found cycle
          const cycleStart = path.indexOf(neighbor);
          circular.push({
            cycle: path.slice(cycleStart).concat(neighbor),
            length: path.length - cycleStart + 1
          });
          return true;
        }
      }
      
      recursionStack.delete(node);
      return false;
    };
    
    for (const node of graph.keys()) {
      if (!visited.has(node)) {
        hasCycle(node);
      }
    }
    
    return circular;
  }
  
  _calculateQualityScore(report) {
    let score = 100;
    
    // Deduct points for issues
    for (const issue of report.issues) {
      switch (issue.severity) {
        case 'high':
          score -= issue.count * 5;
          break;
        case 'medium':
          score -= issue.count * 2;
          break;
        case 'low':
          score -= issue.count * 1;
          break;
      }
    }
    
    return Math.max(0, Math.min(100, score));
  }
  
  _generateRecommendations(report) {
    const recommendations = [];
    
    for (const issue of report.issues) {
      switch (issue.type) {
        case 'large_files':
          recommendations.push('Consider breaking down large files into smaller, more focused modules');
          break;
        case 'complex_functions':
          recommendations.push('Refactor complex functions to reduce cyclomatic complexity');
          break;
        case 'circular_dependencies':
          recommendations.push('Remove circular dependencies to improve modularity');
          break;
      }
    }
    
    return recommendations;
  }
  
  async shutdown() {
    logger.info('Shutting down CodeAnalysis plugin');
  }
}