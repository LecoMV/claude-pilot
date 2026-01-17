/**
 * EmbeddingCache
 *
 * Local SQLite cache for embeddings to avoid re-computing identical content.
 * Features:
 * - Content-hash based deduplication
 * - Model version tracking
 * - Efficient binary storage for vectors
 * - Automatic cache invalidation on model change
 */

import Database from 'better-sqlite3'
import { createHash } from 'crypto'
import { mkdirSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { homedir } from 'os'

export interface CacheStats {
  totalEntries: number
  totalSize: number
  hitCount: number
  missCount: number
  hitRate: number
}

export class EmbeddingCache {
  private db: Database.Database
  private hitCount = 0
  private missCount = 0
  private modelDigests: Map<string, string> = new Map()

  constructor(dbPath?: string) {
    const path = dbPath || join(homedir(), '.cache', 'claude-pilot', 'embeddings.db')

    // Ensure directory exists
    const dir = dirname(path)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }

    this.db = new Database(path)
    this.initialize()
  }

  /**
   * Initialize database schema
   */
  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS embeddings (
        content_hash TEXT PRIMARY KEY,
        model TEXT NOT NULL,
        model_digest TEXT,
        embedding BLOB NOT NULL,
        dimensions INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_embeddings_model ON embeddings (model);
      CREATE INDEX IF NOT EXISTS idx_embeddings_created ON embeddings (created_at);

      -- Model version tracking
      CREATE TABLE IF NOT EXISTS model_versions (
        model TEXT PRIMARY KEY,
        digest TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `)
  }

  /**
   * Get embedding from cache
   */
  get(text: string, model: string): number[] | null {
    const hash = this.hash(text, model)

    const row = this.db
      .prepare('SELECT embedding, dimensions FROM embeddings WHERE content_hash = ?')
      .get(hash) as { embedding: Buffer; dimensions: number } | undefined

    if (row) {
      this.hitCount++
      return this.deserialize(row.embedding, row.dimensions)
    }

    this.missCount++
    return null
  }

  /**
   * Store embedding in cache
   */
  set(text: string, model: string, embedding: number[], modelDigest?: string): void {
    const hash = this.hash(text, model)
    const buffer = this.serialize(embedding)

    this.db
      .prepare(
        `
        INSERT OR REPLACE INTO embeddings
        (content_hash, model, model_digest, embedding, dimensions, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      )
      .run(hash, model, modelDigest || null, buffer, embedding.length, Date.now())
  }

  /**
   * Check if content is cached
   */
  has(text: string, model: string): boolean {
    const hash = this.hash(text, model)
    const row = this.db
      .prepare('SELECT 1 FROM embeddings WHERE content_hash = ?')
      .get(hash)
    return !!row
  }

  /**
   * Delete specific entry from cache
   */
  delete(text: string, model: string): boolean {
    const hash = this.hash(text, model)
    const result = this.db.prepare('DELETE FROM embeddings WHERE content_hash = ?').run(hash)
    return result.changes > 0
  }

  /**
   * Clear all entries for a specific model
   */
  clearModel(model: string): number {
    const result = this.db.prepare('DELETE FROM embeddings WHERE model = ?').run(model)
    return result.changes
  }

  /**
   * Clear entire cache
   */
  clearAll(): number {
    const result = this.db.prepare('DELETE FROM embeddings').run()
    this.hitCount = 0
    this.missCount = 0
    return result.changes
  }

  /**
   * Check if model version changed and invalidate cache if needed
   */
  checkModelVersion(model: string, newDigest: string): boolean {
    const row = this.db
      .prepare('SELECT digest FROM model_versions WHERE model = ?')
      .get(model) as { digest: string } | undefined

    if (row && row.digest !== newDigest) {
      console.info(`[EmbeddingCache] Model ${model} version changed, invalidating cache`)
      this.clearModel(model)

      // Update stored digest
      this.db
        .prepare(
          'INSERT OR REPLACE INTO model_versions (model, digest, updated_at) VALUES (?, ?, ?)'
        )
        .run(model, newDigest, Date.now())

      return true // Cache was invalidated
    }

    if (!row) {
      // First time seeing this model
      this.db
        .prepare(
          'INSERT OR REPLACE INTO model_versions (model, digest, updated_at) VALUES (?, ?, ?)'
        )
        .run(model, newDigest, Date.now())
    }

    return false // No invalidation
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const countRow = this.db.prepare('SELECT COUNT(*) as count FROM embeddings').get() as {
      count: number
    }

    // Estimate size (content_hash ~64 bytes + model ~30 bytes + embedding ~4KB for 1024 dims)
    const sizeRow = this.db
      .prepare('SELECT SUM(LENGTH(embedding)) as size FROM embeddings')
      .get() as { size: number | null }

    const total = this.hitCount + this.missCount

    return {
      totalEntries: countRow.count,
      totalSize: sizeRow.size || 0,
      hitCount: this.hitCount,
      missCount: this.missCount,
      hitRate: total > 0 ? this.hitCount / total : 0,
    }
  }

  /**
   * Prune old entries to keep cache size manageable
   */
  prune(maxEntries: number = 100000, maxAge?: number): number {
    let deleted = 0

    // Delete by age if specified
    if (maxAge) {
      const cutoff = Date.now() - maxAge
      const result = this.db.prepare('DELETE FROM embeddings WHERE created_at < ?').run(cutoff)
      deleted += result.changes
    }

    // Delete oldest if over max entries
    const countRow = this.db.prepare('SELECT COUNT(*) as count FROM embeddings').get() as {
      count: number
    }

    if (countRow.count > maxEntries) {
      const toDelete = countRow.count - maxEntries
      const result = this.db
        .prepare(
          `
          DELETE FROM embeddings WHERE content_hash IN (
            SELECT content_hash FROM embeddings ORDER BY created_at ASC LIMIT ?
          )
        `
        )
        .run(toDelete)
      deleted += result.changes
    }

    return deleted
  }

  /**
   * Get multiple embeddings at once (batch lookup)
   */
  getMany(items: Array<{ text: string; model: string }>): Map<string, number[]> {
    const results = new Map<string, number[]>()
    const hashes = items.map((item) => this.hash(item.text, item.model))

    // Batch query
    const placeholders = hashes.map(() => '?').join(',')
    const rows = this.db
      .prepare(
        `SELECT content_hash, embedding, dimensions FROM embeddings WHERE content_hash IN (${placeholders})`
      )
      .all(...hashes) as Array<{ content_hash: string; embedding: Buffer; dimensions: number }>

    for (const row of rows) {
      results.set(row.content_hash, this.deserialize(row.embedding, row.dimensions))
      this.hitCount++
    }

    // Count misses
    this.missCount += hashes.length - results.size

    return results
  }

  /**
   * Store multiple embeddings at once (batch insert)
   */
  setMany(
    items: Array<{ text: string; model: string; embedding: number[]; modelDigest?: string }>
  ): void {
    const insert = this.db.prepare(`
      INSERT OR REPLACE INTO embeddings
      (content_hash, model, model_digest, embedding, dimensions, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `)

    const insertMany = this.db.transaction((items: typeof items) => {
      const now = Date.now()
      for (const item of items) {
        const hash = this.hash(item.text, item.model)
        const buffer = this.serialize(item.embedding)
        insert.run(
          hash,
          item.model,
          item.modelDigest || null,
          buffer,
          item.embedding.length,
          now
        )
      }
    })

    insertMany(items)
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close()
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private hash(text: string, model: string): string {
    return createHash('sha256').update(`${model}:${text}`).digest('hex')
  }

  private serialize(embedding: number[]): Buffer {
    const buffer = Buffer.allocUnsafe(embedding.length * 4)
    for (let i = 0; i < embedding.length; i++) {
      buffer.writeFloatLE(embedding[i], i * 4)
    }
    return buffer
  }

  private deserialize(buffer: Buffer, dimensions: number): number[] {
    const embedding: number[] = new Array(dimensions)
    for (let i = 0; i < dimensions; i++) {
      embedding[i] = buffer.readFloatLE(i * 4)
    }
    return embedding
  }
}

// Export factory function
export function createEmbeddingCache(dbPath?: string): EmbeddingCache {
  return new EmbeddingCache(dbPath)
}
