/**
 * File Cache Service Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { FileCache, JsonFileCache, YamlFileCache } from '../file-cache'
import { promises as fsPromises, Stats } from 'fs'

// Mock fs
vi.mock('fs', () => ({
  promises: {
    stat: vi.fn(),
    readFile: vi.fn(),
  },
}))

describe('FileCache', () => {
  let cache: FileCache<Record<string, unknown>>

  beforeEach(() => {
    vi.clearAllMocks()
    cache = new FileCache()
  })

  afterEach(() => {
    cache.dispose()
  })

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const stats = cache.getStats()
      expect(stats.hits).toBe(0)
      expect(stats.misses).toBe(0)
      expect(stats.entries).toBe(0)
      expect(stats.hitRate).toBe(0)
    })

    it('should accept custom options', () => {
      const customCache = new FileCache({
        maxEntries: 50,
        defaultTtl: 5000,
        useChecksum: true,
      })
      expect(customCache).toBeInstanceOf(FileCache)
      customCache.dispose()
    })

    it('should start cleanup timer when autoCleanup and TTL are set', async () => {
      vi.useFakeTimers()
      const cleanupCache = new FileCache({
        autoCleanup: true,
        defaultTtl: 1000,
        cleanupInterval: 100,
      })

      // Set a cached entry
      cleanupCache.set('/test.json', { data: 'test' })
      expect(cleanupCache.has('/test.json')).toBe(true)

      // Advance time past TTL and cleanup interval
      vi.advanceTimersByTime(1200)

      // Entry should be cleaned up
      expect(cleanupCache.has('/test.json')).toBe(false)

      cleanupCache.dispose()
      vi.useRealTimers()
    })
  })

  describe('get', () => {
    const mockStats = {
      mtimeMs: 1000,
      size: 100,
    } as Stats

    it('should read and cache file on miss', async () => {
      const content = '{"key": "value"}'
      vi.mocked(fsPromises.stat).mockResolvedValue(mockStats)
      vi.mocked(fsPromises.readFile).mockResolvedValue(content)

      const result = await cache.get('/test.json', JSON.parse)

      expect(result).toEqual({ key: 'value' })
      expect(fsPromises.readFile).toHaveBeenCalledWith('/test.json', 'utf-8')

      const stats = cache.getStats()
      expect(stats.misses).toBe(1)
      expect(stats.entries).toBe(1)
    })

    it('should return cached data on hit', async () => {
      const content = '{"key": "value"}'
      vi.mocked(fsPromises.stat).mockResolvedValue(mockStats)
      vi.mocked(fsPromises.readFile).mockResolvedValue(content)

      // First call - miss
      await cache.get('/test.json', JSON.parse)

      // Reset readFile mock
      vi.mocked(fsPromises.readFile).mockClear()

      // Second call - hit
      const result = await cache.get('/test.json', JSON.parse)

      expect(result).toEqual({ key: 'value' })
      expect(fsPromises.readFile).not.toHaveBeenCalled()

      const stats = cache.getStats()
      expect(stats.hits).toBe(1)
      expect(stats.misses).toBe(1)
    })

    it('should invalidate cache when file mtime changes', async () => {
      const content = '{"key": "value"}'
      vi.mocked(fsPromises.stat).mockResolvedValue(mockStats)
      vi.mocked(fsPromises.readFile).mockResolvedValue(content)

      // First call
      await cache.get('/test.json', JSON.parse)

      // File changed (new mtime)
      const newStats = { mtimeMs: 2000, size: 100 } as Stats
      const newContent = '{"key": "updated"}'
      vi.mocked(fsPromises.stat).mockResolvedValue(newStats)
      vi.mocked(fsPromises.readFile).mockResolvedValue(newContent)

      // Second call - should re-read
      const result = await cache.get('/test.json', JSON.parse)

      expect(result).toEqual({ key: 'updated' })
      expect(fsPromises.readFile).toHaveBeenCalledTimes(2)
    })

    it('should invalidate cache when file size changes', async () => {
      const content = '{"key": "value"}'
      vi.mocked(fsPromises.stat).mockResolvedValue(mockStats)
      vi.mocked(fsPromises.readFile).mockResolvedValue(content)

      await cache.get('/test.json', JSON.parse)

      // File changed (new size)
      const newStats = { mtimeMs: 1000, size: 200 } as Stats
      vi.mocked(fsPromises.stat).mockResolvedValue(newStats)
      vi.mocked(fsPromises.readFile).mockResolvedValue('{"key": "bigger"}')

      await cache.get('/test.json', JSON.parse)

      expect(fsPromises.readFile).toHaveBeenCalledTimes(2)
    })

    it('should deduplicate concurrent requests for same pending read', async () => {
      const content = '{"key": "value"}'
      // First stat call triggers read, subsequent calls join pending
      let statCallCount = 0
      vi.mocked(fsPromises.stat).mockImplementation(
        () =>
          new Promise((resolve) => {
            statCallCount++
            // First call is slow, allowing second call to join
            const delay = statCallCount === 1 ? 50 : 10
            setTimeout(() => resolve(mockStats), delay)
          })
      )
      vi.mocked(fsPromises.readFile).mockResolvedValue(content)

      // Start two requests - second should join the pending read
      const promise1 = cache.get('/test.json', JSON.parse)
      // Give first call time to set pendingReads
      await new Promise((r) => setTimeout(r, 60))
      const promise2 = cache.get('/test.json', JSON.parse)

      const [result1, result2] = await Promise.all([promise1, promise2])

      expect(result1).toEqual({ key: 'value' })
      expect(result2).toEqual({ key: 'value' })
    })

    it('should throw when file does not exist', async () => {
      vi.mocked(fsPromises.stat).mockRejectedValue(new Error('ENOENT'))

      await expect(cache.get('/nonexistent.json', JSON.parse)).rejects.toThrow('ENOENT')
    })

    it('should respect custom TTL', async () => {
      vi.useFakeTimers()
      const content = '{"key": "value"}'
      vi.mocked(fsPromises.stat).mockResolvedValue(mockStats)
      vi.mocked(fsPromises.readFile).mockResolvedValue(content)

      // First call with 100ms TTL
      await cache.get('/test.json', JSON.parse, 100)

      // Advance 50ms - should still be cached
      vi.advanceTimersByTime(50)
      await cache.get('/test.json', JSON.parse, 100)
      expect(fsPromises.readFile).toHaveBeenCalledTimes(1)

      // Advance another 100ms - past TTL
      vi.advanceTimersByTime(100)
      await cache.get('/test.json', JSON.parse, 100)
      expect(fsPromises.readFile).toHaveBeenCalledTimes(2)

      vi.useRealTimers()
    })
  })

  describe('getCached', () => {
    it('should return cached data without reading file', () => {
      cache.set('/test.json', { key: 'value' })
      const result = cache.getCached('/test.json')
      expect(result).toEqual({ key: 'value' })
    })

    it('should return undefined for uncached files', () => {
      const result = cache.getCached('/nonexistent.json')
      expect(result).toBeUndefined()
    })
  })

  describe('has', () => {
    it('should return true for cached files', () => {
      cache.set('/test.json', { key: 'value' })
      expect(cache.has('/test.json')).toBe(true)
    })

    it('should return false for uncached files', () => {
      expect(cache.has('/nonexistent.json')).toBe(false)
    })
  })

  describe('set', () => {
    it('should manually set cache entry', () => {
      cache.set('/test.json', { key: 'value' })

      expect(cache.has('/test.json')).toBe(true)
      expect(cache.getCached('/test.json')).toEqual({ key: 'value' })
      expect(cache.getStats().entries).toBe(1)
    })

    it('should emit set event', () => {
      const callback = vi.fn()
      cache.on('set', callback)

      cache.set('/test.json', { key: 'value' })

      expect(callback).toHaveBeenCalledWith({
        filePath: '/test.json',
        data: { key: 'value' },
      })
    })

    it('should enforce maxEntries', () => {
      const smallCache = new FileCache({ maxEntries: 2 })

      smallCache.set('/file1.json', { id: 1 })
      smallCache.set('/file2.json', { id: 2 })
      smallCache.set('/file3.json', { id: 3 })

      expect(smallCache.getStats().entries).toBe(2)
      // First entry should be evicted (FIFO)
      expect(smallCache.has('/file1.json')).toBe(false)
      expect(smallCache.has('/file2.json')).toBe(true)
      expect(smallCache.has('/file3.json')).toBe(true)

      smallCache.dispose()
    })
  })

  describe('invalidate', () => {
    it('should remove specific entry', () => {
      cache.set('/test.json', { key: 'value' })
      const deleted = cache.invalidate('/test.json')

      expect(deleted).toBe(true)
      expect(cache.has('/test.json')).toBe(false)
      expect(cache.getStats().evictions).toBe(1)
    })

    it('should return false for non-existent entry', () => {
      const deleted = cache.invalidate('/nonexistent.json')
      expect(deleted).toBe(false)
    })

    it('should emit invalidate event', () => {
      const callback = vi.fn()
      cache.on('invalidate', callback)

      cache.set('/test.json', { key: 'value' })
      cache.invalidate('/test.json')

      expect(callback).toHaveBeenCalledWith({ filePath: '/test.json' })
    })
  })

  describe('invalidatePattern', () => {
    it('should remove entries matching string pattern', () => {
      cache.set('/config/app.json', { app: true })
      cache.set('/config/db.json', { db: true })
      cache.set('/data/users.json', { users: true })

      const count = cache.invalidatePattern('/config/')

      expect(count).toBe(2)
      expect(cache.has('/config/app.json')).toBe(false)
      expect(cache.has('/config/db.json')).toBe(false)
      expect(cache.has('/data/users.json')).toBe(true)
    })

    it('should remove entries matching regex pattern', () => {
      cache.set('/test1.json', { id: 1 })
      cache.set('/test2.json', { id: 2 })
      cache.set('/data.json', { data: true })

      const count = cache.invalidatePattern(/test\d+/)

      expect(count).toBe(2)
      expect(cache.has('/test1.json')).toBe(false)
      expect(cache.has('/test2.json')).toBe(false)
      expect(cache.has('/data.json')).toBe(true)
    })

    it('should return 0 when no matches', () => {
      cache.set('/test.json', { key: 'value' })
      const count = cache.invalidatePattern('/nonexistent/')
      expect(count).toBe(0)
    })
  })

  describe('clear', () => {
    it('should remove all entries', () => {
      cache.set('/test1.json', { id: 1 })
      cache.set('/test2.json', { id: 2 })

      cache.clear()

      expect(cache.getStats().entries).toBe(0)
      expect(cache.keys()).toHaveLength(0)
    })

    it('should emit clear event', () => {
      const callback = vi.fn()
      cache.on('clear', callback)

      cache.set('/test1.json', { id: 1 })
      cache.set('/test2.json', { id: 2 })
      cache.clear()

      expect(callback).toHaveBeenCalledWith({ count: 2 })
    })
  })

  describe('getStats', () => {
    it('should return statistics', () => {
      const stats = cache.getStats()
      expect(stats).toHaveProperty('hits')
      expect(stats).toHaveProperty('misses')
      expect(stats).toHaveProperty('evictions')
      expect(stats).toHaveProperty('entries')
      expect(stats).toHaveProperty('hitRate')
    })

    it('should calculate hit rate correctly', async () => {
      const mockStats = { mtimeMs: 1000, size: 100 } as Stats
      vi.mocked(fsPromises.stat).mockResolvedValue(mockStats)
      vi.mocked(fsPromises.readFile).mockResolvedValue('{"key": "value"}')

      // 1 miss
      await cache.get('/test.json', JSON.parse)
      // 3 hits
      await cache.get('/test.json', JSON.parse)
      await cache.get('/test.json', JSON.parse)
      await cache.get('/test.json', JSON.parse)

      const stats = cache.getStats()
      expect(stats.hits).toBe(3)
      expect(stats.misses).toBe(1)
      expect(stats.hitRate).toBe(0.75) // 3/4
    })
  })

  describe('resetStats', () => {
    it('should reset statistics', () => {
      cache.set('/test.json', { key: 'value' })
      cache.invalidate('/test.json')

      cache.resetStats()

      const stats = cache.getStats()
      expect(stats.hits).toBe(0)
      expect(stats.misses).toBe(0)
      expect(stats.evictions).toBe(0)
      expect(stats.hitRate).toBe(0)
    })
  })

  describe('keys', () => {
    it('should return list of cached file paths', () => {
      cache.set('/test1.json', { id: 1 })
      cache.set('/test2.json', { id: 2 })

      const keys = cache.keys()

      expect(keys).toContain('/test1.json')
      expect(keys).toContain('/test2.json')
      expect(keys).toHaveLength(2)
    })
  })

  describe('dispose', () => {
    it('should clean up resources', () => {
      cache.set('/test.json', { key: 'value' })
      cache.dispose()

      expect(cache.keys()).toHaveLength(0)
    })
  })

  describe('events', () => {
    const mockStats = { mtimeMs: 1000, size: 100 } as Stats

    it('should emit hit event on cache hit', async () => {
      const callback = vi.fn()
      cache.on('hit', callback)

      vi.mocked(fsPromises.stat).mockResolvedValue(mockStats)
      vi.mocked(fsPromises.readFile).mockResolvedValue('{"key": "value"}')

      await cache.get('/test.json', JSON.parse)
      await cache.get('/test.json', JSON.parse)

      expect(callback).toHaveBeenCalledTimes(1)
      expect(callback).toHaveBeenCalledWith({
        filePath: '/test.json',
        cached: expect.any(Object),
      })
    })

    it('should emit miss event on cache miss', async () => {
      const callback = vi.fn()
      cache.on('miss', callback)

      vi.mocked(fsPromises.stat).mockResolvedValue(mockStats)
      vi.mocked(fsPromises.readFile).mockResolvedValue('{"key": "value"}')

      await cache.get('/test.json', JSON.parse)

      expect(callback).toHaveBeenCalledTimes(1)
      expect(callback).toHaveBeenCalledWith({
        filePath: '/test.json',
        data: { key: 'value' },
      })
    })
  })
})

describe('JsonFileCache', () => {
  let cache: JsonFileCache

  beforeEach(() => {
    vi.clearAllMocks()
    cache = new JsonFileCache()
  })

  afterEach(() => {
    cache.dispose()
  })

  it('should parse JSON automatically', async () => {
    const mockStats = { mtimeMs: 1000, size: 100 } as Stats
    vi.mocked(fsPromises.stat).mockResolvedValue(mockStats)
    vi.mocked(fsPromises.readFile).mockResolvedValue('{"name": "test", "value": 42}')

    const result = await cache.getJson('/config.json')

    expect(result).toEqual({ name: 'test', value: 42 })
  })

  it('should throw on invalid JSON', async () => {
    const mockStats = { mtimeMs: 1000, size: 100 } as Stats
    vi.mocked(fsPromises.stat).mockResolvedValue(mockStats)
    vi.mocked(fsPromises.readFile).mockResolvedValue('not valid json')

    await expect(cache.getJson('/invalid.json')).rejects.toThrow()
  })
})

describe('YamlFileCache', () => {
  let cache: YamlFileCache

  beforeEach(() => {
    vi.clearAllMocks()
    cache = new YamlFileCache()
  })

  afterEach(() => {
    cache.dispose()
  })

  it('should parse YAML automatically', async () => {
    const mockStats = { mtimeMs: 1000, size: 100 } as Stats
    vi.mocked(fsPromises.stat).mockResolvedValue(mockStats)
    vi.mocked(fsPromises.readFile).mockResolvedValue('name: test\nvalue: 42')

    const result = await cache.getYaml('/config.yaml')

    expect(result).toEqual({ name: 'test', value: 42 })
  })
})
