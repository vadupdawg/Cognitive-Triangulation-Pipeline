/**
 * ProjectMapperPlugin - Provides project structure mapping capabilities
 * 
 * This plugin exposes tools and resources for analyzing and mapping
 * project structures, including file discovery, dependency analysis,
 * and code structure visualization.
 */

import path from 'path';
import { promises as fs } from 'fs';
import { EntityScout } from '../../agents/EntityScout.js';
import sqliteDb from '../../utils/sqliteDb.js';
import logger from '../../utils/logger.js';

export default class ProjectMapperPlugin {
  constructor(server) {
    this.server = server;
    this.name = 'project-mapper';
    this.description = 'Maps and analyzes project structures';
    this.dependencies = [];
    
    // Cache for project structures
    this.projectCache = new Map();
  }
  
  async initialize() {
    logger.info('Initializing ProjectMapper plugin');
    
    // Register tools
    this._registerTools();
    
    // Register resources
    this._registerResources();
    
    // Register prompts
    this._registerPrompts();
  }
  
  _registerTools() {
    // Tool: Scan project structure
    this.server.registerTool('project-mapper/scan', {
      description: 'Scan a project directory and map its structure',
      inputSchema: {
        type: 'object',
        properties: {
          projectPath: {
            type: 'string',
            description: 'Path to the project directory'
          },
          includePatterns: {
            type: 'array',
            items: { type: 'string' },
            description: 'File patterns to include (glob patterns)'
          },
          excludePatterns: {
            type: 'array',
            items: { type: 'string' },
            description: 'File patterns to exclude (glob patterns)'
          },
          maxDepth: {
            type: 'integer',
            description: 'Maximum directory depth to scan',
            default: 10
          }
        },
        required: ['projectPath']
      },
      handler: this._scanProject.bind(this)
    });
    
    // Tool: Analyze file dependencies
    this.server.registerTool('project-mapper/analyze-dependencies', {
      description: 'Analyze dependencies for a specific file',
      inputSchema: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'Path to the file to analyze'
          },
          projectId: {
            type: 'string',
            description: 'Project ID from previous scan'
          }
        },
        required: ['filePath']
      },
      handler: this._analyzeDependencies.bind(this)
    });
    
    // Tool: Get project structure
    this.server.registerTool('project-mapper/get-structure', {
      description: 'Get the hierarchical structure of a project',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: {
            type: 'string',
            description: 'Project ID from scan'
          },
          format: {
            type: 'string',
            enum: ['tree', 'flat', 'graph'],
            default: 'tree'
          }
        },
        required: ['projectId']
      },
      handler: this._getProjectStructure.bind(this)
    });
    
    // Tool: Find files by pattern
    this.server.registerTool('project-mapper/find-files', {
      description: 'Find files matching specific patterns or criteria',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: {
            type: 'string',
            description: 'Project ID from scan'
          },
          patterns: {
            type: 'array',
            items: { type: 'string' },
            description: 'File name patterns to match'
          },
          contentPattern: {
            type: 'string',
            description: 'Pattern to search in file contents'
          },
          fileType: {
            type: 'string',
            description: 'File type filter (e.g., "javascript", "python")'
          }
        },
        required: ['projectId']
      },
      handler: this._findFiles.bind(this)
    });
  }
  
  _registerResources() {
    // Resource: Current project structure
    this.server.registerResource('project-mapper://current-structure', {
      name: 'Current Project Structure',
      description: 'The currently mapped project structure',
      mimeType: 'application/json',
      handler: this._getCurrentStructure.bind(this)
    });
    
    // Resource: Project statistics
    this.server.registerResource('project-mapper://statistics', {
      name: 'Project Statistics',
      description: 'Statistics about the current project',
      mimeType: 'application/json',
      handler: this._getProjectStatistics.bind(this)
    });
  }
  
  _registerPrompts() {
    // Prompt: Analyze project structure
    this.server.registerPrompt('analyze-project', {
      name: 'Analyze Project Structure',
      description: 'Generate analysis prompt for project structure',
      arguments: [
        {
          name: 'projectPath',
          description: 'Path to the project',
          required: true
        }
      ],
      handler: this._generateAnalysisPrompt.bind(this)
    });
  }
  
  // Tool handlers
  
  async _scanProject({ projectPath, includePatterns, excludePatterns, maxDepth }) {
    try {
      // Validate project path
      const stats = await fs.stat(projectPath);
      if (!stats.isDirectory()) {
        throw new Error('Project path must be a directory');
      }
      
      // Generate project ID
      const projectId = `project-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Initialize database for this project
      const db = await sqliteDb.getConnection();
      
      // Create project entry
      await db.run(`
        INSERT INTO projects (id, path, created_at)
        VALUES (?, ?, datetime('now'))
      `, [projectId, projectPath]);
      
      // Use EntityScout for file discovery
      const scout = new EntityScout({
        targetPath: projectPath,
        projectId,
        includePatterns,
        excludePatterns,
        maxDepth
      });
      
      // Run discovery
      await scout.run();
      
      // Get discovered files
      const files = await db.all(`
        SELECT * FROM files
        WHERE project_id = ?
        ORDER BY file_path
      `, [projectId]);
      
      // Cache project data
      this.projectCache.set(projectId, {
        id: projectId,
        path: projectPath,
        files,
        scannedAt: new Date()
      });
      
      return {
        projectId,
        path: projectPath,
        filesDiscovered: files.length,
        message: `Successfully scanned project with ${files.length} files`
      };
      
    } catch (error) {
      logger.error('Project scan failed:', error);
      throw error;
    }
  }
  
  async _analyzeDependencies({ filePath, projectId }) {
    try {
      const db = await sqliteDb.getConnection();
      
      // Get file info
      const file = await db.get(`
        SELECT * FROM files
        WHERE file_path = ?
        ${projectId ? 'AND project_id = ?' : ''}
      `, projectId ? [filePath, projectId] : [filePath]);
      
      if (!file) {
        throw new Error('File not found in project');
      }
      
      // Get POIs (Points of Interest) for the file
      const pois = await db.all(`
        SELECT * FROM pois
        WHERE file_id = ?
      `, [file.id]);
      
      // Get relationships
      const relationships = await db.all(`
        SELECT r.*, 
               p1.name as source_name, 
               p2.name as target_name,
               f1.file_path as source_file,
               f2.file_path as target_file
        FROM relationships r
        JOIN pois p1 ON r.source_poi_id = p1.id
        JOIN pois p2 ON r.target_poi_id = p2.id
        JOIN files f1 ON p1.file_id = f1.id
        JOIN files f2 ON p2.file_id = f2.id
        WHERE p1.file_id = ? OR p2.file_id = ?
      `, [file.id, file.id]);
      
      // Group dependencies
      const imports = relationships.filter(r => r.type === 'IMPORTS');
      const exports = pois.filter(p => p.type === 'EXPORT');
      const dependencies = {
        imports: imports.map(i => ({
          from: i.target_file,
          name: i.target_name
        })),
        exports: exports.map(e => ({
          name: e.name,
          type: e.poi_type
        })),
        references: relationships.filter(r => r.type !== 'IMPORTS')
      };
      
      return {
        file: filePath,
        language: file.language,
        dependencies
      };
      
    } catch (error) {
      logger.error('Dependency analysis failed:', error);
      throw error;
    }
  }
  
  async _getProjectStructure({ projectId, format }) {
    try {
      const project = this.projectCache.get(projectId);
      if (!project) {
        throw new Error('Project not found. Please scan first.');
      }
      
      const db = await sqliteDb.getConnection();
      
      // Get all files with their metadata
      const files = await db.all(`
        SELECT f.*, 
               COUNT(p.id) as poi_count
        FROM files f
        LEFT JOIN pois p ON f.id = p.file_id
        WHERE f.project_id = ?
        GROUP BY f.id
        ORDER BY f.file_path
      `, [projectId]);
      
      switch (format) {
        case 'tree':
          return this._buildTreeStructure(files);
        
        case 'flat':
          return {
            projectId,
            files: files.map(f => ({
              path: f.file_path,
              language: f.language,
              size: f.size,
              poiCount: f.poi_count
            }))
          };
        
        case 'graph':
          return await this._buildGraphStructure(projectId, files);
        
        default:
          throw new Error(`Unknown format: ${format}`);
      }
      
    } catch (error) {
      logger.error('Get project structure failed:', error);
      throw error;
    }
  }
  
  async _findFiles({ projectId, patterns, contentPattern, fileType }) {
    try {
      const db = await sqliteDb.getConnection();
      
      let query = `
        SELECT DISTINCT f.*
        FROM files f
        WHERE f.project_id = ?
      `;
      const params = [projectId];
      
      // Add pattern matching
      if (patterns && patterns.length > 0) {
        const patternConditions = patterns.map(() => 'f.file_path LIKE ?').join(' OR ');
        query += ` AND (${patternConditions})`;
        params.push(...patterns.map(p => `%${p}%`));
      }
      
      // Add file type filter
      if (fileType) {
        query += ` AND f.language = ?`;
        params.push(fileType);
      }
      
      // Add content pattern matching
      if (contentPattern) {
        query += ` AND EXISTS (
          SELECT 1 FROM pois p 
          WHERE p.file_id = f.id 
          AND (p.name LIKE ? OR p.description LIKE ?)
        )`;
        params.push(`%${contentPattern}%`, `%${contentPattern}%`);
      }
      
      const files = await db.all(query, params);
      
      return {
        projectId,
        matchCount: files.length,
        files: files.map(f => ({
          path: f.file_path,
          language: f.language,
          size: f.size
        }))
      };
      
    } catch (error) {
      logger.error('Find files failed:', error);
      throw error;
    }
  }
  
  // Resource handlers
  
  async _getCurrentStructure() {
    const projects = Array.from(this.projectCache.values());
    
    if (projects.length === 0) {
      return {
        type: 'text/plain',
        text: 'No projects currently mapped. Use project-mapper/scan to map a project.'
      };
    }
    
    const currentProject = projects[projects.length - 1];
    
    return {
      type: 'application/json',
      data: {
        projectId: currentProject.id,
        path: currentProject.path,
        fileCount: currentProject.files.length,
        scannedAt: currentProject.scannedAt
      }
    };
  }
  
  async _getProjectStatistics() {
    const projects = Array.from(this.projectCache.values());
    
    if (projects.length === 0) {
      return {
        type: 'text/plain',
        text: 'No projects to analyze.'
      };
    }
    
    const stats = {
      totalProjects: projects.length,
      projects: []
    };
    
    for (const project of projects) {
      const db = await sqliteDb.getConnection();
      
      const fileStats = await db.get(`
        SELECT 
          COUNT(DISTINCT f.id) as file_count,
          COUNT(DISTINCT f.language) as language_count,
          COUNT(p.id) as poi_count,
          COUNT(r.id) as relationship_count
        FROM files f
        LEFT JOIN pois p ON f.id = p.file_id
        LEFT JOIN relationships r ON p.id = r.source_poi_id OR p.id = r.target_poi_id
        WHERE f.project_id = ?
      `, [project.id]);
      
      stats.projects.push({
        id: project.id,
        path: project.path,
        ...fileStats
      });
    }
    
    return {
      type: 'application/json',
      data: stats
    };
  }
  
  // Prompt handlers
  
  async _generateAnalysisPrompt({ projectPath }) {
    return {
      messages: [
        {
          role: 'user',
          content: `Please analyze the project structure at: ${projectPath}\n\nUse the project-mapper/scan tool to discover the project structure, then use project-mapper/get-structure to visualize it. Finally, provide insights about the project organization, architecture patterns, and any recommendations for improvement.`
        }
      ]
    };
  }
  
  // Helper methods
  
  _buildTreeStructure(files) {
    const tree = { name: 'root', children: {} };
    
    for (const file of files) {
      const parts = file.file_path.split(path.sep);
      let current = tree;
      
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!current.children[part]) {
          current.children[part] = { name: part, children: {} };
        }
        current = current.children[part];
      }
      
      // Add file
      const fileName = parts[parts.length - 1];
      current.children[fileName] = {
        name: fileName,
        type: 'file',
        language: file.language,
        size: file.size,
        poiCount: file.poi_count
      };
    }
    
    return tree;
  }
  
  async _buildGraphStructure(projectId, files) {
    const db = await sqliteDb.getConnection();
    
    // Get all relationships
    const relationships = await db.all(`
      SELECT r.*, 
             f1.file_path as source_file,
             f2.file_path as target_file
      FROM relationships r
      JOIN pois p1 ON r.source_poi_id = p1.id
      JOIN pois p2 ON r.target_poi_id = p2.id
      JOIN files f1 ON p1.file_id = f1.id
      JOIN files f2 ON p2.file_id = f2.id
      WHERE f1.project_id = ?
    `, [projectId]);
    
    // Build nodes and edges
    const nodes = files.map(f => ({
      id: f.file_path,
      label: path.basename(f.file_path),
      type: 'file',
      language: f.language
    }));
    
    const edges = relationships.map(r => ({
      source: r.source_file,
      target: r.target_file,
      type: r.type
    }));
    
    return {
      projectId,
      nodes,
      edges
    };
  }
  
  async shutdown() {
    logger.info('Shutting down ProjectMapper plugin');
    this.projectCache.clear();
  }
}