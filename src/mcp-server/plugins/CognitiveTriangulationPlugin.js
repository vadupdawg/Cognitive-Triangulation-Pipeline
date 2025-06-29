/**
 * CognitiveTriangulationPlugin - Provides cognitive triangulation capabilities
 * 
 * This plugin implements the cognitive triangulation approach for enhanced
 * code understanding through multiple analysis perspectives and confidence scoring.
 */

import path from 'path';
import { ConfidenceScoringService } from '../../services/cognitive_triangulation/ConfidenceScoringService.js';
import { directoryResolutionWorker } from '../../workers/directoryResolutionWorker.js';
import { globalResolutionWorker } from '../../workers/globalResolutionWorker.js';
import { fileAnalysisWorker } from '../../workers/fileAnalysisWorker.js';
import sqliteDb from '../../utils/sqliteDb.js';
import logger from '../../utils/logger.js';

export default class CognitiveTriangulationPlugin {
  constructor(server) {
    this.server = server;
    this.name = 'cognitive-triangulation';
    this.description = 'Multi-perspective code analysis with confidence scoring';
    this.dependencies = ['project-mapper'];
    
    // Services
    this.confidenceScorer = new ConfidenceScoringService();
    
    // Analysis cache
    this.analysisCache = new Map();
  }
  
  async initialize() {
    logger.info('Initializing CognitiveTriangulation plugin');
    
    // Register tools
    this._registerTools();
    
    // Register resources
    this._registerResources();
    
    // Register prompts
    this._registerPrompts();
  }
  
  _registerTools() {
    // Tool: Triangulate analysis
    this.server.registerTool('cognitive-triangulation/analyze', {
      description: 'Perform cognitive triangulation analysis on code',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: {
            type: 'string',
            description: 'Project ID from project-mapper scan'
          },
          targetPath: {
            type: 'string',
            description: 'Specific file or directory to analyze'
          },
          analysisDepth: {
            type: 'string',
            enum: ['shallow', 'normal', 'deep'],
            default: 'normal',
            description: 'Depth of analysis'
          },
          perspectives: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['structural', 'semantic', 'behavioral', 'architectural']
            },
            default: ['structural', 'semantic', 'behavioral'],
            description: 'Analysis perspectives to use'
          }
        },
        required: ['projectId']
      },
      handler: this._performTriangulation.bind(this)
    });
    
    // Tool: Calculate confidence scores
    this.server.registerTool('cognitive-triangulation/confidence-score', {
      description: 'Calculate confidence scores for relationships',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: {
            type: 'string',
            description: 'Project ID'
          },
          relationshipId: {
            type: 'string',
            description: 'Specific relationship ID to score'
          },
          scoreType: {
            type: 'string',
            enum: ['individual', 'aggregate', 'comparative'],
            default: 'aggregate'
          }
        },
        required: ['projectId']
      },
      handler: this._calculateConfidence.bind(this)
    });
    
    // Tool: Resolve conflicts
    this.server.registerTool('cognitive-triangulation/resolve-conflicts', {
      description: 'Resolve conflicting analysis results',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: {
            type: 'string',
            description: 'Project ID'
          },
          conflictType: {
            type: 'string',
            enum: ['relationship', 'entity', 'classification'],
            description: 'Type of conflict to resolve'
          },
          strategy: {
            type: 'string',
            enum: ['consensus', 'weighted', 'expert', 'manual'],
            default: 'consensus',
            description: 'Resolution strategy'
          }
        },
        required: ['projectId', 'conflictType']
      },
      handler: this._resolveConflicts.bind(this)
    });
    
    // Tool: Generate insights
    this.server.registerTool('cognitive-triangulation/insights', {
      description: 'Generate insights from triangulated analysis',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: {
            type: 'string',
            description: 'Project ID'
          },
          insightType: {
            type: 'string',
            enum: ['architecture', 'dependencies', 'complexity', 'quality', 'all'],
            default: 'all'
          },
          threshold: {
            type: 'number',
            minimum: 0,
            maximum: 1,
            default: 0.7,
            description: 'Minimum confidence threshold for insights'
          }
        },
        required: ['projectId']
      },
      handler: this._generateInsights.bind(this)
    });
  }
  
  _registerResources() {
    // Resource: Analysis status
    this.server.registerResource('cognitive-triangulation://status', {
      name: 'Triangulation Analysis Status',
      description: 'Current status of triangulation analyses',
      mimeType: 'application/json',
      handler: this._getAnalysisStatus.bind(this)
    });
    
    // Resource: Confidence metrics
    this.server.registerResource('cognitive-triangulation://confidence-metrics', {
      name: 'Confidence Metrics',
      description: 'Aggregate confidence metrics across analyses',
      mimeType: 'application/json',
      handler: this._getConfidenceMetrics.bind(this)
    });
    
    // Resource: Conflict report
    this.server.registerResource('cognitive-triangulation://conflicts', {
      name: 'Analysis Conflicts',
      description: 'Current unresolved analysis conflicts',
      mimeType: 'application/json',
      handler: this._getConflictReport.bind(this)
    });
  }
  
  _registerPrompts() {
    // Prompt: Triangulation analysis
    this.server.registerPrompt('triangulate-code', {
      name: 'Triangulate Code Analysis',
      description: 'Generate prompt for cognitive triangulation analysis',
      arguments: [
        {
          name: 'projectId',
          description: 'Project ID to analyze',
          required: true
        },
        {
          name: 'focus',
          description: 'Specific area of focus',
          required: false
        }
      ],
      handler: this._generateTriangulationPrompt.bind(this)
    });
  }
  
  // Tool handlers
  
  async _performTriangulation({ projectId, targetPath, analysisDepth, perspectives }) {
    try {
      const analysisId = `analysis-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Initialize analysis record
      const analysis = {
        id: analysisId,
        projectId,
        targetPath,
        analysisDepth,
        perspectives,
        status: 'in_progress',
        startTime: new Date(),
        results: {}
      };
      
      this.analysisCache.set(analysisId, analysis);
      
      const db = await sqliteDb.getConnection();
      
      // Get files to analyze
      let filesToAnalyze;
      if (targetPath) {
        filesToAnalyze = await db.all(`
          SELECT * FROM files
          WHERE project_id = ?
          AND file_path LIKE ?
        `, [projectId, `${targetPath}%`]);
      } else {
        filesToAnalyze = await db.all(`
          SELECT * FROM files
          WHERE project_id = ?
        `, [projectId]);
      }
      
      // Perform multi-perspective analysis
      const analysisResults = await this._runMultiPerspectiveAnalysis(
        filesToAnalyze,
        perspectives,
        analysisDepth
      );
      
      // Calculate confidence scores
      const confidenceScores = await this._calculateAnalysisConfidence(analysisResults);
      
      // Identify conflicts
      const conflicts = await this._identifyConflicts(analysisResults);
      
      // Update analysis record
      analysis.results = analysisResults;
      analysis.confidenceScores = confidenceScores;
      analysis.conflicts = conflicts;
      analysis.status = 'completed';
      analysis.endTime = new Date();
      
      // Store results in database
      await this._storeAnalysisResults(analysis);
      
      return {
        analysisId,
        projectId,
        filesAnalyzed: filesToAnalyze.length,
        perspectives: perspectives.length,
        averageConfidence: this._calculateAverageConfidence(confidenceScores),
        conflictsFound: conflicts.length,
        message: 'Triangulation analysis completed successfully'
      };
      
    } catch (error) {
      logger.error('Triangulation analysis failed:', error);
      throw error;
    }
  }
  
  async _calculateConfidence({ projectId, relationshipId, scoreType }) {
    try {
      const db = await sqliteDb.getConnection();
      
      if (relationshipId) {
        // Score specific relationship
        const relationship = await db.get(`
          SELECT * FROM relationships
          WHERE id = ?
        `, [relationshipId]);
        
        if (!relationship) {
          throw new Error('Relationship not found');
        }
        
        const score = await this.confidenceScorer.scoreRelationship(relationship);
        
        return {
          relationshipId,
          score: score.overall,
          components: score.components,
          scoreType
        };
      } else {
        // Score all relationships in project
        const relationships = await db.all(`
          SELECT r.*
          FROM relationships r
          JOIN pois p ON r.source_poi_id = p.id
          JOIN files f ON p.file_id = f.id
          WHERE f.project_id = ?
        `, [projectId]);
        
        const scores = await Promise.all(
          relationships.map(r => this.confidenceScorer.scoreRelationship(r))
        );
        
        if (scoreType === 'aggregate') {
          const aggregateScore = this._aggregateScores(scores);
          return {
            projectId,
            totalRelationships: relationships.length,
            aggregateScore,
            distribution: this._getScoreDistribution(scores)
          };
        } else {
          return {
            projectId,
            scores: scores.map((s, i) => ({
              relationshipId: relationships[i].id,
              score: s.overall
            }))
          };
        }
      }
      
    } catch (error) {
      logger.error('Confidence calculation failed:', error);
      throw error;
    }
  }
  
  async _resolveConflicts({ projectId, conflictType, strategy }) {
    try {
      const db = await sqliteDb.getConnection();
      
      // Get conflicts based on type
      let conflicts;
      switch (conflictType) {
        case 'relationship':
          conflicts = await this._getRelationshipConflicts(projectId);
          break;
        case 'entity':
          conflicts = await this._getEntityConflicts(projectId);
          break;
        case 'classification':
          conflicts = await this._getClassificationConflicts(projectId);
          break;
      }
      
      if (!conflicts || conflicts.length === 0) {
        return {
          message: 'No conflicts found',
          conflictType,
          resolved: 0
        };
      }
      
      // Apply resolution strategy
      const resolutions = await this._applyResolutionStrategy(conflicts, strategy);
      
      // Update database with resolutions
      await this._applyResolutions(resolutions);
      
      return {
        conflictType,
        strategy,
        conflictsFound: conflicts.length,
        resolved: resolutions.length,
        resolutions: resolutions.map(r => ({
          id: r.id,
          resolution: r.resolution,
          confidence: r.confidence
        }))
      };
      
    } catch (error) {
      logger.error('Conflict resolution failed:', error);
      throw error;
    }
  }
  
  async _generateInsights({ projectId, insightType, threshold }) {
    try {
      const db = await sqliteDb.getConnection();
      
      // Gather data for insight generation
      const projectData = await this._gatherProjectData(projectId);
      
      let insights = [];
      
      if (insightType === 'all' || insightType === 'architecture') {
        insights.push(...await this._generateArchitectureInsights(projectData, threshold));
      }
      
      if (insightType === 'all' || insightType === 'dependencies') {
        insights.push(...await this._generateDependencyInsights(projectData, threshold));
      }
      
      if (insightType === 'all' || insightType === 'complexity') {
        insights.push(...await this._generateComplexityInsights(projectData, threshold));
      }
      
      if (insightType === 'all' || insightType === 'quality') {
        insights.push(...await this._generateQualityInsights(projectData, threshold));
      }
      
      // Filter by confidence threshold
      insights = insights.filter(i => i.confidence >= threshold);
      
      // Sort by confidence and severity
      insights.sort((a, b) => {
        if (a.severity !== b.severity) {
          const severityOrder = { high: 3, medium: 2, low: 1 };
          return severityOrder[b.severity] - severityOrder[a.severity];
        }
        return b.confidence - a.confidence;
      });
      
      return {
        projectId,
        insightType,
        threshold,
        totalInsights: insights.length,
        insights
      };
      
    } catch (error) {
      logger.error('Insight generation failed:', error);
      throw error;
    }
  }
  
  // Resource handlers
  
  async _getAnalysisStatus() {
    const analyses = Array.from(this.analysisCache.values());
    
    const summary = {
      total: analyses.length,
      inProgress: analyses.filter(a => a.status === 'in_progress').length,
      completed: analyses.filter(a => a.status === 'completed').length,
      failed: analyses.filter(a => a.status === 'failed').length,
      analyses: analyses.map(a => ({
        id: a.id,
        projectId: a.projectId,
        status: a.status,
        startTime: a.startTime,
        endTime: a.endTime,
        averageConfidence: a.confidenceScores ? 
          this._calculateAverageConfidence(a.confidenceScores) : null
      }))
    };
    
    return {
      type: 'application/json',
      data: summary
    };
  }
  
  async _getConfidenceMetrics() {
    const db = await sqliteDb.getConnection();
    
    // Get aggregate confidence metrics
    const metrics = await db.get(`
      SELECT 
        COUNT(*) as total_relationships,
        AVG(confidence_score) as avg_confidence,
        MIN(confidence_score) as min_confidence,
        MAX(confidence_score) as max_confidence,
        COUNT(CASE WHEN confidence_score >= 0.8 THEN 1 END) as high_confidence,
        COUNT(CASE WHEN confidence_score < 0.5 THEN 1 END) as low_confidence
      FROM relationship_confidence
    `);
    
    return {
      type: 'application/json',
      data: {
        ...metrics,
        confidenceDistribution: await this._getConfidenceDistribution()
      }
    };
  }
  
  async _getConflictReport() {
    const conflicts = [];
    
    // Aggregate conflicts from all analyses
    for (const analysis of this.analysisCache.values()) {
      if (analysis.conflicts && analysis.conflicts.length > 0) {
        conflicts.push(...analysis.conflicts);
      }
    }
    
    // Group by type
    const groupedConflicts = conflicts.reduce((acc, conflict) => {
      if (!acc[conflict.type]) {
        acc[conflict.type] = [];
      }
      acc[conflict.type].push(conflict);
      return acc;
    }, {});
    
    return {
      type: 'application/json',
      data: {
        totalConflicts: conflicts.length,
        byType: groupedConflicts,
        unresolvedCount: conflicts.filter(c => !c.resolved).length
      }
    };
  }
  
  // Helper methods
  
  async _runMultiPerspectiveAnalysis(files, perspectives, depth) {
    const results = {
      structural: {},
      semantic: {},
      behavioral: {},
      architectural: {}
    };
    
    for (const perspective of perspectives) {
      switch (perspective) {
        case 'structural':
          results.structural = await this._analyzeStructure(files, depth);
          break;
        case 'semantic':
          results.semantic = await this._analyzeSemantic(files, depth);
          break;
        case 'behavioral':
          results.behavioral = await this._analyzeBehavior(files, depth);
          break;
        case 'architectural':
          results.architectural = await this._analyzeArchitecture(files, depth);
          break;
      }
    }
    
    return results;
  }
  
  async _analyzeStructure(files, depth) {
    // Structural analysis focuses on code organization and syntax
    const results = {};
    
    for (const file of files) {
      const analysis = await fileAnalysisWorker.analyzeFile({
        fileId: file.id,
        filePath: file.file_path,
        analysisType: 'structural',
        depth
      });
      
      results[file.file_path] = analysis;
    }
    
    return results;
  }
  
  async _analyzeSemantic(files, depth) {
    // Semantic analysis focuses on meaning and relationships
    const results = {};
    
    for (const file of files) {
      const analysis = await fileAnalysisWorker.analyzeFile({
        fileId: file.id,
        filePath: file.file_path,
        analysisType: 'semantic',
        depth
      });
      
      results[file.file_path] = analysis;
    }
    
    return results;
  }
  
  async _analyzeBehavior(files, depth) {
    // Behavioral analysis focuses on runtime behavior and patterns
    const results = {};
    
    for (const file of files) {
      const analysis = await fileAnalysisWorker.analyzeFile({
        fileId: file.id,
        filePath: file.file_path,
        analysisType: 'behavioral',
        depth
      });
      
      results[file.file_path] = analysis;
    }
    
    return results;
  }
  
  async _analyzeArchitecture(files, depth) {
    // Architectural analysis focuses on high-level design patterns
    const directoryGroups = this._groupFilesByDirectory(files);
    const results = {};
    
    for (const [dir, dirFiles] of Object.entries(directoryGroups)) {
      const analysis = await directoryResolutionWorker.analyzeDirectory({
        directory: dir,
        files: dirFiles,
        depth
      });
      
      results[dir] = analysis;
    }
    
    return results;
  }
  
  _groupFilesByDirectory(files) {
    const groups = {};
    
    for (const file of files) {
      const dir = path.dirname(file.file_path);
      if (!groups[dir]) {
        groups[dir] = [];
      }
      groups[dir].push(file);
    }
    
    return groups;
  }
  
  async _calculateAnalysisConfidence(results) {
    const scores = {};
    
    for (const [perspective, perspectiveResults] of Object.entries(results)) {
      scores[perspective] = await this.confidenceScorer.scorePerspective(
        perspective,
        perspectiveResults
      );
    }
    
    return scores;
  }
  
  async _identifyConflicts(results) {
    const conflicts = [];
    
    // Compare results across perspectives
    const perspectives = Object.keys(results);
    
    for (let i = 0; i < perspectives.length; i++) {
      for (let j = i + 1; j < perspectives.length; j++) {
        const p1 = perspectives[i];
        const p2 = perspectives[j];
        
        const perspectiveConflicts = await this._comparePerspectives(
          p1,
          results[p1],
          p2,
          results[p2]
        );
        
        conflicts.push(...perspectiveConflicts);
      }
    }
    
    return conflicts;
  }
  
  async _comparePerspectives(p1, r1, p2, r2) {
    // Compare results from two perspectives to identify conflicts
    const conflicts = [];
    
    // This is a simplified comparison - in practice, this would be more sophisticated
    for (const key of Object.keys(r1)) {
      if (r2[key] && JSON.stringify(r1[key]) !== JSON.stringify(r2[key])) {
        conflicts.push({
          type: 'perspective_mismatch',
          perspectives: [p1, p2],
          key,
          values: {
            [p1]: r1[key],
            [p2]: r2[key]
          }
        });
      }
    }
    
    return conflicts;
  }
  
  _calculateAverageConfidence(scores) {
    const values = Object.values(scores).flat();
    if (values.length === 0) return 0;
    
    const sum = values.reduce((acc, val) => acc + (typeof val === 'number' ? val : val.overall || 0), 0);
    return sum / values.length;
  }
  
  async _storeAnalysisResults(analysis) {
    const db = await sqliteDb.getConnection();
    
    await db.run(`
      INSERT INTO triangulation_analyses 
      (id, project_id, target_path, analysis_depth, perspectives, status, 
       start_time, end_time, results, confidence_scores, conflicts)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      analysis.id,
      analysis.projectId,
      analysis.targetPath,
      analysis.analysisDepth,
      JSON.stringify(analysis.perspectives),
      analysis.status,
      analysis.startTime.toISOString(),
      analysis.endTime?.toISOString(),
      JSON.stringify(analysis.results),
      JSON.stringify(analysis.confidenceScores),
      JSON.stringify(analysis.conflicts)
    ]);
  }
  
  // Prompt handler
  
  async _generateTriangulationPrompt({ projectId, focus }) {
    const focusClause = focus ? 
      `\n\nPlease focus particularly on: ${focus}` : '';
    
    return {
      messages: [
        {
          role: 'user',
          content: `Perform a comprehensive cognitive triangulation analysis on project ${projectId}.${focusClause}

Use the cognitive-triangulation/analyze tool with all available perspectives to get a multi-dimensional understanding of the code. Then:

1. Calculate confidence scores for the discovered relationships
2. Identify and resolve any conflicts in the analysis
3. Generate insights about the project's architecture, dependencies, complexity, and quality
4. Provide specific recommendations for improvements based on the triangulated analysis

Focus on areas where multiple perspectives agree (high confidence) and highlight areas where perspectives conflict (requiring further investigation).`
        }
      ]
    };
  }
  
  async shutdown() {
    logger.info('Shutting down CognitiveTriangulation plugin');
    this.analysisCache.clear();
  }
}