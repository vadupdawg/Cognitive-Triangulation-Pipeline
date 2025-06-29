/**
 * MCP Server Interface Definitions
 * 
 * This file contains all TypeScript interface definitions for the modular
 * MCP server implementation of the Cognitive Triangulation Pipeline.
 */

// ============================================================================
// Core MCP Protocol Interfaces
// ============================================================================

export interface MCPMessage {
  jsonrpc: '2.0';
  id?: string | number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: MCPError;
}

export interface MCPError {
  code: number;
  message: string;
  data?: unknown;
}

export interface MCPServerConfig {
  name: string;
  version: string;
  transport: TransportConfig;
  pipeline?: PipelineConfig;
  storage?: StorageConfig;
  plugins?: PluginConfig;
}

export interface TransportConfig {
  type: 'stdio' | 'websocket' | 'tcp';
  options?: {
    port?: number;
    host?: string;
    path?: string;
  };
}

// ============================================================================
// Project Mapping Interfaces
// ============================================================================

export interface ProjectMapper {
  analyzeProject(path: string, options?: AnalysisOptions): Promise<ProjectAnalysis>;
  getEntityGraph(projectId: string): Promise<EntityGraph>;
  queryRelationships(query: RelationshipQuery): Promise<Relationship[]>;
  getProjectSummary(projectId: string): Promise<ProjectSummary>;
  watchProject(path: string, callback: WatchCallback): Promise<Watcher>;
}

export interface AnalysisOptions {
  depth?: number;
  includeTests?: boolean;
  includeNodeModules?: boolean;
  languages?: string[];
  filePatterns?: string[];
  excludePatterns?: string[];
  incremental?: boolean;
  parallelism?: number;
}

export interface ProjectAnalysis {
  id: string;
  path: string;
  startTime: Date;
  endTime?: Date;
  status: 'pending' | 'analyzing' | 'completed' | 'failed';
  summary?: ProjectSummary;
  errors?: AnalysisError[];
}

export interface ProjectSummary {
  totalFiles: number;
  totalDirectories: number;
  languages: LanguageStats[];
  entities: EntityStats;
  relationships: RelationshipStats;
  complexity: ComplexityMetrics;
}

export interface EntityGraph {
  nodes: EntityNode[];
  edges: RelationshipEdge[];
  metadata: GraphMetadata;
}

export interface EntityNode {
  id: string;
  type: EntityType;
  name: string;
  filePath: string;
  position: CodePosition;
  properties: Record<string, unknown>;
  confidence: number;
}

export interface RelationshipEdge {
  id: string;
  source: string;
  target: string;
  type: RelationshipType;
  properties: Record<string, unknown>;
  confidence: number;
}

// ============================================================================
// Analysis Engine Interfaces
// ============================================================================

export interface AnalysisEngine {
  startAnalysis(projectPath: string, options: AnalysisOptions): Promise<AnalysisSession>;
  getAnalysisStatus(sessionId: string): Promise<AnalysisStatus>;
  cancelAnalysis(sessionId: string): Promise<void>;
  getResults(sessionId: string): Promise<AnalysisResults>;
}

export interface AnalysisSession {
  id: string;
  projectPath: string;
  options: AnalysisOptions;
  startTime: Date;
  status: AnalysisStatus;
}

export interface AnalysisStatus {
  phase: 'discovery' | 'analysis' | 'aggregation' | 'resolution' | 'validation' | 'completed';
  progress: number;
  currentFile?: string;
  filesProcessed: number;
  totalFiles: number;
  errors: AnalysisError[];
}

export interface AnalysisResults {
  entities: Entity[];
  relationships: Relationship[];
  directorySummaries: DirectorySummary[];
  metrics: ProjectMetrics;
}

// ============================================================================
// Entity and Relationship Interfaces
// ============================================================================

export type EntityType = 
  | 'class'
  | 'interface'
  | 'function'
  | 'variable'
  | 'constant'
  | 'module'
  | 'package'
  | 'component'
  | 'service'
  | 'api_endpoint'
  | 'database_schema'
  | 'configuration';

export interface Entity {
  id: string;
  type: EntityType;
  name: string;
  filePath: string;
  position: CodePosition;
  language: string;
  description?: string;
  signature?: string;
  visibility?: 'public' | 'private' | 'protected';
  metadata: EntityMetadata;
  confidence: number;
}

export interface CodePosition {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

export interface EntityMetadata {
  hash: string;
  size: number;
  complexity?: number;
  dependencies?: string[];
  exports?: string[];
  annotations?: string[];
  [key: string]: unknown;
}

export type RelationshipType =
  | 'imports'
  | 'exports'
  | 'extends'
  | 'implements'
  | 'uses'
  | 'calls'
  | 'instantiates'
  | 'configures'
  | 'tests'
  | 'documents'
  | 'depends_on';

export interface Relationship {
  id: string;
  sourceId: string;
  targetId: string;
  type: RelationshipType;
  confidence: number;
  evidence: Evidence[];
  metadata?: Record<string, unknown>;
}

export interface Evidence {
  type: 'direct' | 'inferred' | 'triangulated';
  location: CodePosition;
  snippet: string;
  confidence: number;
}

// ============================================================================
// Plugin System Interfaces
// ============================================================================

export interface Plugin {
  name: string;
  version: string;
  type: PluginType;
  supportedFileTypes: string[];
  supportedLanguages?: string[];
  initialize(context: PluginContext): Promise<void>;
  destroy(): Promise<void>;
}

export type PluginType = 'analyzer' | 'detector' | 'transformer' | 'validator';

export interface AnalyzerPlugin extends Plugin {
  type: 'analyzer';
  analyze(file: FileInfo, content: string): Promise<AnalysisResult>;
}

export interface DetectorPlugin extends Plugin {
  type: 'detector';
  detect(project: ProjectInfo): Promise<DetectionResult>;
}

export interface PluginContext {
  logger: Logger;
  config: PluginConfig;
  storage: StorageAdapter;
  eventBus: EventEmitter;
}

export interface AnalysisResult {
  entities: Entity[];
  relationships: Relationship[];
  metrics?: FileMetrics;
  issues?: Issue[];
}

// ============================================================================
// Storage and Resource Management Interfaces
// ============================================================================

export interface StorageAdapter {
  initialize(): Promise<void>;
  close(): Promise<void>;
  
  // Entity operations
  saveEntity(entity: Entity): Promise<void>;
  getEntity(id: string): Promise<Entity | null>;
  queryEntities(query: EntityQuery): Promise<Entity[]>;
  
  // Relationship operations
  saveRelationship(relationship: Relationship): Promise<void>;
  getRelationship(id: string): Promise<Relationship | null>;
  queryRelationships(query: RelationshipQuery): Promise<Relationship[]>;
  
  // Project operations
  saveProject(project: ProjectInfo): Promise<void>;
  getProject(id: string): Promise<ProjectInfo | null>;
  
  // Transaction support
  beginTransaction(): Promise<Transaction>;
}

export interface CacheAdapter {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

export interface QueueAdapter {
  createQueue<T>(name: string): Queue<T>;
  getQueue<T>(name: string): Queue<T> | null;
  closeAll(): Promise<void>;
}

export interface Queue<T> {
  add(data: T, options?: JobOptions): Promise<Job<T>>;
  addBulk(data: T[], options?: JobOptions): Promise<Job<T>[]>;
  process(processor: JobProcessor<T>): void;
  getJobCounts(): Promise<JobCounts>;
}

// ============================================================================
// MCP Tool Definitions
// ============================================================================

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: JSONSchema;
  handler: ToolHandler;
}

export type ToolHandler = (params: unknown) => Promise<unknown>;

export interface MCPResource {
  name: string;
  description: string;
  mimeType: string;
  provider: ResourceProvider;
}

export type ResourceProvider = (uri: string) => Promise<ResourceContent>;

export interface ResourceContent {
  uri: string;
  mimeType: string;
  content: string | Buffer;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Event and Monitoring Interfaces
// ============================================================================

export interface EventEmitter {
  on(event: string, handler: EventHandler): void;
  off(event: string, handler: EventHandler): void;
  emit(event: string, data: unknown): void;
}

export type EventHandler = (data: unknown) => void;

export interface Logger {
  debug(message: string, meta?: unknown): void;
  info(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): void;
}

export interface Metrics {
  increment(name: string, value?: number, tags?: Record<string, string>): void;
  gauge(name: string, value: number, tags?: Record<string, string>): void;
  histogram(name: string, value: number, tags?: Record<string, string>): void;
  timing(name: string, value: number, tags?: Record<string, string>): void;
}

// ============================================================================
// Utility Types
// ============================================================================

export interface FileInfo {
  path: string;
  relativePath: string;
  size: number;
  hash: string;
  language?: string;
  encoding?: string;
}

export interface DirectorySummary {
  path: string;
  fileCount: number;
  totalSize: number;
  languages: LanguageStats[];
  entityCount: number;
  complexity: ComplexityMetrics;
}

export interface LanguageStats {
  language: string;
  fileCount: number;
  lineCount: number;
  byteCount: number;
}

export interface ComplexityMetrics {
  cyclomatic: number;
  cognitive: number;
  halstead: HalsteadMetrics;
}

export interface HalsteadMetrics {
  vocabulary: number;
  length: number;
  volume: number;
  difficulty: number;
  effort: number;
}

export interface ProjectMetrics {
  totalFiles: number;
  totalLines: number;
  totalBytes: number;
  languages: LanguageStats[];
  complexity: ComplexityMetrics;
  entityStats: EntityStats;
  relationshipStats: RelationshipStats;
}

export interface EntityStats {
  total: number;
  byType: Record<EntityType, number>;
  byLanguage: Record<string, number>;
}

export interface RelationshipStats {
  total: number;
  byType: Record<RelationshipType, number>;
  averageConfidence: number;
}

export interface Issue {
  type: 'error' | 'warning' | 'info';
  message: string;
  location?: CodePosition;
  rule?: string;
  severity?: number;
}

export interface WatchCallback {
  (event: WatchEvent): void;
}

export interface WatchEvent {
  type: 'added' | 'modified' | 'deleted';
  path: string;
  timestamp: Date;
}

export interface Watcher {
  stop(): void;
}

// ============================================================================
// Query Interfaces
// ============================================================================

export interface EntityQuery {
  type?: EntityType | EntityType[];
  name?: string | RegExp;
  filePath?: string | RegExp;
  language?: string | string[];
  limit?: number;
  offset?: number;
}

export interface RelationshipQuery {
  type?: RelationshipType | RelationshipType[];
  sourceId?: string;
  targetId?: string;
  minConfidence?: number;
  limit?: number;
  offset?: number;
}

export interface GraphQuery {
  startNodes?: string[];
  depth?: number;
  relationshipTypes?: RelationshipType[];
  direction?: 'incoming' | 'outgoing' | 'both';
}

// ============================================================================
// Configuration Interfaces
// ============================================================================

export interface PipelineConfig {
  workers?: number;
  batchSize?: number;
  timeout?: number;
  retries?: number;
  llm?: LLMConfig;
}

export interface StorageConfig {
  sqlite?: SQLiteConfig;
  neo4j?: Neo4jConfig;
  redis?: RedisConfig;
}

export interface PluginConfig {
  enabled?: string[];
  custom?: string[];
  options?: Record<string, unknown>;
}

export interface LLMConfig {
  provider: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  timeout?: number;
  maxTokens?: number;
}

export interface SQLiteConfig {
  path: string;
  options?: Record<string, unknown>;
}

export interface Neo4jConfig {
  uri: string;
  username: string;
  password: string;
  database?: string;
}

export interface RedisConfig {
  url: string;
  password?: string;
  db?: number;
}

// ============================================================================
// Job Processing Interfaces
// ============================================================================

export interface Job<T> {
  id: string;
  data: T;
  status: JobStatus;
  progress: number;
  result?: unknown;
  error?: Error;
  createdAt: Date;
  updatedAt: Date;
}

export type JobStatus = 'waiting' | 'active' | 'completed' | 'failed' | 'delayed';

export interface JobOptions {
  priority?: number;
  delay?: number;
  attempts?: number;
  backoff?: BackoffOptions;
}

export interface BackoffOptions {
  type: 'fixed' | 'exponential';
  delay: number;
}

export type JobProcessor<T> = (job: Job<T>) => Promise<unknown>;

export interface JobCounts {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

// ============================================================================
// Transaction Interfaces
// ============================================================================

export interface Transaction {
  commit(): Promise<void>;
  rollback(): Promise<void>;
  saveEntity(entity: Entity): Promise<void>;
  saveRelationship(relationship: Relationship): Promise<void>;
}

// ============================================================================
// JSON Schema Types
// ============================================================================

export interface JSONSchema {
  type: string;
  properties?: Record<string, JSONSchema>;
  items?: JSONSchema;
  required?: string[];
  enum?: unknown[];
  description?: string;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  pattern?: string;
}

// ============================================================================
// Error Types
// ============================================================================

export class MCPError extends Error {
  constructor(
    public code: number,
    message: string,
    public data?: unknown
  ) {
    super(message);
    this.name = 'MCPError';
  }
}

export class AnalysisError extends Error {
  constructor(
    message: string,
    public filePath?: string,
    public phase?: string
  ) {
    super(message);
    this.name = 'AnalysisError';
  }
}

export interface GraphMetadata {
  projectId: string;
  createdAt: Date;
  updatedAt: Date;
  version: string;
  stats: {
    nodeCount: number;
    edgeCount: number;
    connectedComponents: number;
    averageDegree: number;
  };
}