/**
 * Database Mock Factory
 *
 * Provides mock factories for PostgreSQL, Memgraph, and Qdrant database clients.
 * Use these factories in tests that need custom database behavior.
 *
 * @module database.mock
 */

import { vi } from 'vitest'

// ===========================================================================
// POSTGRESQL POOL MOCK
// ===========================================================================

export interface MockPoolClient {
  query: ReturnType<typeof vi.fn>
  release: ReturnType<typeof vi.fn>
}

export interface MockPool {
  query: ReturnType<typeof vi.fn>
  connect: ReturnType<typeof vi.fn>
  end: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
  totalCount: number
  idleCount: number
  waitingCount: number
}

export interface CreateMockPoolOptions {
  queryResult?: { rows: unknown[]; rowCount: number }
  totalCount?: number
  idleCount?: number
  waitingCount?: number
}

export const createMockPoolClient = (
  queryResult: { rows: unknown[]; rowCount: number } = { rows: [], rowCount: 0 }
): MockPoolClient => ({
  query: vi.fn().mockResolvedValue(queryResult),
  release: vi.fn(),
})

export const createMockPool = (options: CreateMockPoolOptions = {}): MockPool => {
  const { queryResult = { rows: [], rowCount: 0 }, totalCount = 5, idleCount = 3, waitingCount = 0 } =
    options

  const client = createMockPoolClient(queryResult)

  return {
    query: vi.fn().mockResolvedValue(queryResult),
    connect: vi.fn().mockResolvedValue(client),
    end: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    totalCount,
    idleCount,
    waitingCount,
  }
}

// ===========================================================================
// POSTGRESQL QUERY RESULT FACTORIES
// ===========================================================================

export interface LearningRow {
  id: number
  content: string
  source: string
  category: string
  tags: string[]
  created_at: Date
  embedding?: number[]
}

export interface SessionRow {
  id: string
  project_path: string
  created_at: Date
  last_activity: Date
  message_count: number
  is_active: boolean
}

export const createLearningRow = (overrides: Partial<LearningRow> = {}): LearningRow => ({
  id: 1,
  content: 'Test learning content',
  source: 'test',
  category: 'general',
  tags: ['test', 'mock'],
  created_at: new Date(),
  embedding: undefined,
  ...overrides,
})

export const createSessionRow = (overrides: Partial<SessionRow> = {}): SessionRow => ({
  id: 'test-session-1',
  project_path: '/home/user/projects/test',
  created_at: new Date(),
  last_activity: new Date(),
  message_count: 10,
  is_active: false,
  ...overrides,
})

export const createQueryResult = <T>(rows: T[], rowCount?: number) => ({
  rows,
  rowCount: rowCount ?? rows.length,
})

// ===========================================================================
// MEMGRAPH/NEO4J DRIVER MOCK
// ===========================================================================

export interface MockRecord {
  get: ReturnType<typeof vi.fn>
  toObject: ReturnType<typeof vi.fn>
  keys: string[]
}

export interface MockResult {
  records: MockRecord[]
  summary: {
    counters: {
      nodesCreated: ReturnType<typeof vi.fn>
      nodesDeleted: ReturnType<typeof vi.fn>
      relationshipsCreated: ReturnType<typeof vi.fn>
      relationshipsDeleted: ReturnType<typeof vi.fn>
    }
  }
}

export interface MockSession {
  run: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
  beginTransaction: ReturnType<typeof vi.fn>
}

export interface MockDriver {
  session: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
  verifyConnectivity: ReturnType<typeof vi.fn>
}

export const createMockRecord = (data: Record<string, unknown> = {}): MockRecord => ({
  get: vi.fn((key: string) => data[key]),
  toObject: vi.fn().mockReturnValue(data),
  keys: Object.keys(data),
})

export const createMockResult = (records: MockRecord[] = []): MockResult => ({
  records,
  summary: {
    counters: {
      nodesCreated: vi.fn().mockReturnValue(0),
      nodesDeleted: vi.fn().mockReturnValue(0),
      relationshipsCreated: vi.fn().mockReturnValue(0),
      relationshipsDeleted: vi.fn().mockReturnValue(0),
    },
  },
})

export const createMockSession = (result?: MockResult): MockSession => ({
  run: vi.fn().mockResolvedValue(result ?? createMockResult()),
  close: vi.fn().mockResolvedValue(undefined),
  beginTransaction: vi.fn().mockReturnValue({
    run: vi.fn().mockResolvedValue(result ?? createMockResult()),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
  }),
})

export const createMockDriver = (session?: MockSession): MockDriver => ({
  session: vi.fn().mockReturnValue(session ?? createMockSession()),
  close: vi.fn().mockResolvedValue(undefined),
  verifyConnectivity: vi.fn().mockResolvedValue(undefined),
})

// ===========================================================================
// QDRANT MOCK
// ===========================================================================

export interface QdrantPoint {
  id: string | number
  vector: number[]
  payload?: Record<string, unknown>
}

export interface QdrantSearchResult {
  id: string | number
  score: number
  payload?: Record<string, unknown>
  vector?: number[]
}

export interface MockQdrantClient {
  getCollections: ReturnType<typeof vi.fn>
  createCollection: ReturnType<typeof vi.fn>
  deleteCollection: ReturnType<typeof vi.fn>
  getCollection: ReturnType<typeof vi.fn>
  upsert: ReturnType<typeof vi.fn>
  search: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
  retrieve: ReturnType<typeof vi.fn>
  scroll: ReturnType<typeof vi.fn>
  count: ReturnType<typeof vi.fn>
}

export const createQdrantPoint = (overrides: Partial<QdrantPoint> = {}): QdrantPoint => ({
  id: 'point-1',
  vector: Array(384).fill(0.1),
  payload: { content: 'test content', category: 'test' },
  ...overrides,
})

export const createQdrantSearchResult = (
  overrides: Partial<QdrantSearchResult> = {}
): QdrantSearchResult => ({
  id: 'point-1',
  score: 0.95,
  payload: { content: 'test content', category: 'test' },
  ...overrides,
})

export const createMockQdrantClient = (): MockQdrantClient => ({
  getCollections: vi.fn().mockResolvedValue({
    collections: [{ name: 'test_collection' }, { name: 'claude_memories' }],
  }),
  createCollection: vi.fn().mockResolvedValue(true),
  deleteCollection: vi.fn().mockResolvedValue(true),
  getCollection: vi.fn().mockResolvedValue({
    name: 'test_collection',
    vectors_count: 100,
    points_count: 100,
    status: 'green',
  }),
  upsert: vi.fn().mockResolvedValue({ status: 'completed' }),
  search: vi
    .fn()
    .mockResolvedValue([createQdrantSearchResult(), createQdrantSearchResult({ id: 'point-2', score: 0.9 })]),
  delete: vi.fn().mockResolvedValue({ status: 'completed' }),
  retrieve: vi.fn().mockResolvedValue([createQdrantPoint()]),
  scroll: vi.fn().mockResolvedValue({
    points: [createQdrantPoint()],
    next_page_offset: null,
  }),
  count: vi.fn().mockResolvedValue({ count: 100 }),
})

// ===========================================================================
// OLLAMA MOCK
// ===========================================================================

export interface OllamaModel {
  name: string
  modified_at: string
  size: number
  digest: string
  details: {
    format: string
    family: string
    parameter_size: string
    quantization_level: string
  }
}

export interface OllamaEmbeddingResult {
  embedding: number[]
}

export interface MockOllamaClient {
  list: ReturnType<typeof vi.fn>
  show: ReturnType<typeof vi.fn>
  embeddings: ReturnType<typeof vi.fn>
  generate: ReturnType<typeof vi.fn>
  pull: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
}

export const createOllamaModel = (overrides: Partial<OllamaModel> = {}): OllamaModel => ({
  name: 'nomic-embed-text:latest',
  modified_at: new Date().toISOString(),
  size: 274000000,
  digest: 'abc123',
  details: {
    format: 'gguf',
    family: 'nomic-bert',
    parameter_size: '137M',
    quantization_level: 'Q4_0',
  },
  ...overrides,
})

export const createMockOllamaClient = (): MockOllamaClient => ({
  list: vi.fn().mockResolvedValue({
    models: [createOllamaModel(), createOllamaModel({ name: 'llama3.2:latest' })],
  }),
  show: vi.fn().mockResolvedValue(createOllamaModel()),
  embeddings: vi.fn().mockResolvedValue({ embedding: Array(768).fill(0.1) }),
  generate: vi.fn().mockResolvedValue({ response: 'Generated text response' }),
  pull: vi.fn().mockResolvedValue({ status: 'success' }),
  delete: vi.fn().mockResolvedValue({ status: 'success' }),
})

// ===========================================================================
// DATABASE ERROR SIMULATION
// ===========================================================================

export class MockDatabaseError extends Error {
  code: string
  detail?: string
  constraint?: string
  table?: string

  constructor(
    message: string,
    options: { code?: string; detail?: string; constraint?: string; table?: string } = {}
  ) {
    super(message)
    this.name = 'MockDatabaseError'
    this.code = options.code ?? 'UNKNOWN'
    this.detail = options.detail
    this.constraint = options.constraint
    this.table = options.table
  }
}

export const createConnectionError = () =>
  new MockDatabaseError('Connection refused', { code: 'ECONNREFUSED' })

export const createTimeoutError = () =>
  new MockDatabaseError('Query timeout', { code: 'QUERY_TIMEOUT' })

export const createUniqueViolationError = (table: string, constraint: string) =>
  new MockDatabaseError('Unique violation', {
    code: '23505',
    constraint,
    table,
    detail: `Key already exists`,
  })

export const createForeignKeyViolationError = (table: string, constraint: string) =>
  new MockDatabaseError('Foreign key violation', {
    code: '23503',
    constraint,
    table,
    detail: `Key is not present in referenced table`,
  })
