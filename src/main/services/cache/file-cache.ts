/**
 * File Cache Service
 *
 * Stat-based file caching with automatic invalidation.
 * Inspired by Webmin's configuration file caching patterns.
 *
 * @module services/cache/file-cache
 */

import { promises as fsPromises, Stats } from 'fs'
import { createHash } from 'crypto'
import { EventEmitter } from 'events'

// ============================================================================
// Types
// ============================================================================

interface FileCacheEntry<T> {
  data: T
  mtime: number
  size: number
  checksum?: string
  cachedAt: number
}

interface FileCacheOptions {
  /** Maximum number of entries in cache */
  maxEntries?: number
  /** Default TTL in milliseconds (0 = infinite) */
  defaultTtl?: number
  /** Whether to compute checksums for validation */
  useChecksum?: boolean
  /** Enable automatic cleanup of expired entries */
  autoCleanup?: boolean
  /** Cleanup interval in milliseconds */
  cleanupInterval?: number
}

interface CacheStats {
  hits: number
  misses: number
  evictions: number
  entries: number
  hitRate: number
}

// ============================================================================
// File Cache Implementation
// ============================================================================

/**
 * Generic file cache with stat-based invalidation.
 * Caches parsed file contents and automatically invalidates when file changes.
 *
 * @example
 * const jsonCache = new FileCache<Record<string, unknown>>()
 * const config = await jsonCache.get('/path/to/config.json', JSON.parse)
 */
export class FileCache<T> extends EventEmitter {
  private cache = new Map<string, FileCacheEntry<T>>()
  private pendingReads = new Map<string, Promise<T>>()
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    entries: 0,
    hitRate: 0,
  }
  private options: Required<FileCacheOptions>
  private cleanupTimer?: NodeJS.Timeout

  constructor(options: FileCacheOptions = {}) {
    super()
    this.options = {
      maxEntries: options.maxEntries ?? 1000,
      defaultTtl: options.defaultTtl ?? 0, // No expiry by default
      useChecksum: options.useChecksum ?? false,
      autoCleanup: options.autoCleanup ?? true,
      cleanupInterval: options.cleanupInterval ?? 60000, // 1 minute
    }

    if (this.options.autoCleanup && this.options.defaultTtl > 0) {
      this.startCleanup()
    }
  }

  /**
   * Get cached data or fetch and parse the file.
   * Uses stat-based invalidation to detect file changes.
   */
  async get(filePath: string, parser: (content: string) => T, ttl?: number): Promise<T> {
    // Check for pending read (deduplicate concurrent requests)
    const pending = this.pendingReads.get(filePath)
    if (pending) {
      return pending
    }

    // Check cache validity
    try {
      const fileStats = await fsPromises.stat(filePath)
      const cached = this.cache.get(filePath)

      if (cached && this.isValid(cached, fileStats, ttl ?? this.options.defaultTtl)) {
        this.stats.hits++
        this.updateHitRate()
        this.emit('hit', { filePath, cached })
        return cached.data
      }
    } catch (error) {
      // File doesn't exist or can't be accessed - remove from cache
      this.cache.delete(filePath)
      throw error
    }

    // Cache miss - read and parse file
    this.stats.misses++
    this.updateHitRate()

    const readPromise = this.readAndCache(filePath, parser)
    this.pendingReads.set(filePath, readPromise)

    try {
      const result = await readPromise
      return result
    } finally {
      this.pendingReads.delete(filePath)
    }
  }

  /**
   * Get cached data if available and valid, without reading file.
   */
  getCached(filePath: string): T | undefined {
    const cached = this.cache.get(filePath)
    return cached?.data
  }

  /**
   * Check if file is cached (may still be invalid).
   */
  has(filePath: string): boolean {
    return this.cache.has(filePath)
  }

  /**
   * Manually set cache entry.
   */
  set(filePath: string, data: T, stats?: Stats): void {
    const mtime = stats?.mtimeMs ?? Date.now()
    const size = stats?.size ?? 0

    this.enforceMaxEntries()

    this.cache.set(filePath, {
      data,
      mtime,
      size,
      cachedAt: Date.now(),
    })

    this.stats.entries = this.cache.size
    this.emit('set', { filePath, data })
  }

  /**
   * Invalidate specific cache entry.
   */
  invalidate(filePath: string): boolean {
    const deleted = this.cache.delete(filePath)
    if (deleted) {
      this.stats.evictions++
      this.stats.entries = this.cache.size
      this.emit('invalidate', { filePath })
    }
    return deleted
  }

  /**
   * Invalidate entries matching a pattern.
   */
  invalidatePattern(pattern: string | RegExp): number {
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern
    let count = 0

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key)
        count++
      }
    }

    if (count > 0) {
      this.stats.evictions += count
      this.stats.entries = this.cache.size
      this.emit('invalidatePattern', { pattern: pattern.toString(), count })
    }

    return count
  }

  /**
   * Invalidate all cache entries.
   */
  clear(): void {
    const count = this.cache.size
    this.cache.clear()
    this.stats.evictions += count
    this.stats.entries = 0
    this.emit('clear', { count })
  }

  /**
   * Get cache statistics.
   */
  getStats(): CacheStats {
    return { ...this.stats }
  }

  /**
   * Reset statistics.
   */
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      entries: this.cache.size,
      hitRate: 0,
    }
  }

  /**
   * Get list of cached file paths.
   */
  keys(): string[] {
    return Array.from(this.cache.keys())
  }

  /**
   * Clean up resources.
   */
  dispose(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = undefined
    }
    this.cache.clear()
    this.pendingReads.clear()
    this.removeAllListeners()
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async readAndCache(filePath: string, parser: (content: string) => T): Promise<T> {
    const [content, fileStats] = await Promise.all([
      fsPromises.readFile(filePath, 'utf-8'),
      fsPromises.stat(filePath),
    ])

    const data = parser(content)

    this.enforceMaxEntries()

    const entry: FileCacheEntry<T> = {
      data,
      mtime: fileStats.mtimeMs,
      size: fileStats.size,
      cachedAt: Date.now(),
    }

    if (this.options.useChecksum) {
      entry.checksum = this.computeChecksum(content)
    }

    this.cache.set(filePath, entry)
    this.stats.entries = this.cache.size
    this.emit('miss', { filePath, data })

    return data
  }

  private isValid(entry: FileCacheEntry<T>, fileStats: Stats, ttl: number): boolean {
    // Check stat-based invalidation
    if (entry.mtime !== fileStats.mtimeMs || entry.size !== fileStats.size) {
      return false
    }

    // Check TTL
    if (ttl > 0 && Date.now() - entry.cachedAt > ttl) {
      return false
    }

    return true
  }

  private computeChecksum(content: string): string {
    return createHash('md5').update(content).digest('hex')
  }

  private enforceMaxEntries(): void {
    if (this.cache.size >= this.options.maxEntries) {
      // Evict oldest entry (FIFO)
      const oldest = this.cache.keys().next().value
      if (oldest) {
        this.cache.delete(oldest)
        this.stats.evictions++
      }
    }
  }

  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0
  }

  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now()
      let cleaned = 0

      for (const [key, entry] of this.cache.entries()) {
        if (this.options.defaultTtl > 0 && now - entry.cachedAt > this.options.defaultTtl) {
          this.cache.delete(key)
          cleaned++
        }
      }

      if (cleaned > 0) {
        this.stats.evictions += cleaned
        this.stats.entries = this.cache.size
        this.emit('cleanup', { cleaned })
      }
    }, this.options.cleanupInterval)
  }
}

// ============================================================================
// Specialized Caches
// ============================================================================

/**
 * JSON file cache with automatic parsing.
 */
export class JsonFileCache<T = Record<string, unknown>> extends FileCache<T> {
  constructor(options?: FileCacheOptions) {
    super(options)
  }

  getJson(filePath: string, ttl?: number): Promise<T> {
    return this.get(filePath, (content) => JSON.parse(content) as T, ttl)
  }
}

/**
 * YAML file cache with automatic parsing.
 * Requires js-yaml to be installed.
 */
export class YamlFileCache<T = Record<string, unknown>> extends FileCache<T> {
  private yaml: typeof import('js-yaml') | null = null

  constructor(options?: FileCacheOptions) {
    super(options)
  }

  async getYaml(filePath: string, ttl?: number): Promise<T> {
    if (!this.yaml) {
      this.yaml = await import('js-yaml')
    }
    const yaml = this.yaml
    return this.get(filePath, (content) => yaml.load(content) as T, ttl)
  }
}

// ============================================================================
// Singleton Instances
// ============================================================================

// Global JSON cache for configuration files
export const configCache = new JsonFileCache({
  maxEntries: 100,
  defaultTtl: 0, // Config files don't expire, rely on stat-based invalidation
})

// Global cache for session transcripts
export const transcriptCache = new FileCache<string[]>({
  maxEntries: 50,
  defaultTtl: 30000, // 30 second TTL for transcripts
})
