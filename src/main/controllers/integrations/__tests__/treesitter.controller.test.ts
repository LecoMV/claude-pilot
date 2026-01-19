/**
 * Tree-sitter Controller Tests
 *
 * Comprehensive tests for the Tree-sitter tRPC controller.
 * Tests all 12 procedures: parseFile, indexCodebase, searchSymbols,
 * findDefinition, findReferences, getFileOutline, getCodebaseStructure,
 * clearCache, clearIndex, getStats, getConfig, updateConfig
 *
 * @module treesitter.controller.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { treesitterRouter } from '../treesitter.controller'

// Mock the treeSitterService
vi.mock('../../../services/treesitter', () => ({
  treeSitterService: {
    parseFile: vi.fn(),
    indexCodebase: vi.fn(),
    searchSymbols: vi.fn(),
    findDefinition: vi.fn(),
    findReferences: vi.fn(),
    getFileOutline: vi.fn(),
    getCodebaseStructure: vi.fn(),
    clearCache: vi.fn(),
    clearIndex: vi.fn(),
    getStats: vi.fn(),
    getConfig: vi.fn(),
    updateConfig: vi.fn(),
  },
}))

import { treeSitterService } from '../../../services/treesitter'
import type { FileParseResult, CodeSymbol, TreeSitterStats, TreeSitterConfig } from '../../../services/treesitter'

// Create a test caller
const createTestCaller = () => treesitterRouter.createCaller({})

// Helper to create mock parse result
function createMockParseResult(overrides: Partial<FileParseResult> = {}): FileParseResult {
  return {
    filePath: '/path/to/file.ts',
    language: 'typescript',
    symbols: [],
    imports: [],
    exports: [],
    parseTime: 10,
    errors: [],
    size: 1000,
    lineCount: 50,
    ...overrides,
  }
}

// Helper to create mock symbol
function createMockSymbol(overrides: Partial<CodeSymbol> = {}): CodeSymbol {
  return {
    name: 'testFunction',
    kind: 'function',
    filePath: '/path/to/file.ts',
    startLine: 10,
    endLine: 20,
    startColumn: 0,
    endColumn: 1,
    ...overrides,
  }
}

describe('treesitter.controller', () => {
  let caller: ReturnType<typeof createTestCaller>

  beforeEach(() => {
    vi.clearAllMocks()
    caller = createTestCaller()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ===========================================================================
  // PARSE FILE PROCEDURE
  // ===========================================================================
  describe('parseFile', () => {
    it('should parse file and return result', async () => {
      const mockResult = createMockParseResult({
        symbols: [createMockSymbol()],
      })
      vi.mocked(treeSitterService.parseFile).mockReturnValueOnce(mockResult)

      const result = await caller.parseFile({ filePath: '/path/to/file.ts' })

      expect(result).toEqual(mockResult)
      expect(treeSitterService.parseFile).toHaveBeenCalledWith('/path/to/file.ts')
    })

    it('should return null when file not found', async () => {
      vi.mocked(treeSitterService.parseFile).mockReturnValueOnce(null)

      const result = await caller.parseFile({ filePath: '/nonexistent/file.ts' })

      expect(result).toBeNull()
    })

    it('should reject empty file path', async () => {
      await expect(caller.parseFile({ filePath: '' })).rejects.toThrow()
    })

    it('should reject file path exceeding 4096 characters', async () => {
      const longPath = '/a'.repeat(2049)
      await expect(caller.parseFile({ filePath: longPath })).rejects.toThrow()
    })

    it('should accept file path at max length', async () => {
      vi.mocked(treeSitterService.parseFile).mockReturnValueOnce(null)

      const maxPath = '/a'.repeat(2048)
      await expect(caller.parseFile({ filePath: maxPath })).resolves.toBeNull()
    })

    it('should return file with parse errors', async () => {
      const mockResult = createMockParseResult({
        errors: [{ message: 'Syntax error', line: 5, column: 10 }],
      })
      vi.mocked(treeSitterService.parseFile).mockReturnValueOnce(mockResult)

      const result = await caller.parseFile({ filePath: '/path/to/broken.ts' })

      expect(result?.errors).toHaveLength(1)
      expect(result?.errors[0].message).toBe('Syntax error')
    })
  })

  // ===========================================================================
  // INDEX CODEBASE PROCEDURE
  // ===========================================================================
  describe('indexCodebase', () => {
    it('should index codebase and return stats', async () => {
      const mockStats = {
        totalFiles: 100,
        totalSymbols: 500,
        byLanguage: { typescript: 80, javascript: 20 },
        byKind: {
          function: 200,
          method: 100,
          class: 50,
          interface: 30,
          type: 20,
          variable: 80,
          constant: 10,
          enum: 5,
          property: 5,
          parameter: 0,
          module: 0,
          namespace: 0,
          import: 0,
          export: 0,
        },
      }
      vi.mocked(treeSitterService.indexCodebase).mockResolvedValueOnce({
        rootPath: '/project',
        files: new Map(),
        symbols: new Map(),
        imports: new Map(),
        exports: new Map(),
        lastUpdated: Date.now(),
        stats: mockStats,
      })

      const result = await caller.indexCodebase({ rootPath: '/project' })

      expect(result).toEqual(mockStats)
      expect(treeSitterService.indexCodebase).toHaveBeenCalledWith('/project')
    })

    it('should reject empty root path', async () => {
      await expect(caller.indexCodebase({ rootPath: '' })).rejects.toThrow()
    })

    it('should reject root path exceeding 4096 characters', async () => {
      const longPath = '/a'.repeat(2049)
      await expect(caller.indexCodebase({ rootPath: longPath })).rejects.toThrow()
    })

    it('should propagate errors from service', async () => {
      vi.mocked(treeSitterService.indexCodebase).mockRejectedValueOnce(
        new Error('Path does not exist')
      )

      await expect(caller.indexCodebase({ rootPath: '/nonexistent' })).rejects.toThrow(
        'Path does not exist'
      )
    })
  })

  // ===========================================================================
  // SEARCH SYMBOLS PROCEDURE
  // ===========================================================================
  describe('searchSymbols', () => {
    it('should search symbols by query', async () => {
      const mockSymbols = [
        createMockSymbol({ name: 'handleClick' }),
        createMockSymbol({ name: 'handleSubmit' }),
      ]
      vi.mocked(treeSitterService.searchSymbols).mockReturnValueOnce(mockSymbols)

      const result = await caller.searchSymbols({ query: 'handle' })

      expect(result).toHaveLength(2)
      expect(treeSitterService.searchSymbols).toHaveBeenCalledWith('handle', undefined)
    })

    it('should search with kind filter', async () => {
      vi.mocked(treeSitterService.searchSymbols).mockReturnValueOnce([])

      await caller.searchSymbols({
        query: 'test',
        options: { kind: 'function' },
      })

      expect(treeSitterService.searchSymbols).toHaveBeenCalledWith('test', { kind: 'function' })
    })

    it('should search with all options', async () => {
      vi.mocked(treeSitterService.searchSymbols).mockReturnValueOnce([])

      await caller.searchSymbols({
        query: 'test',
        options: {
          kind: 'class',
          rootPath: '/project',
          limit: 50,
          caseSensitive: true,
        },
      })

      expect(treeSitterService.searchSymbols).toHaveBeenCalledWith('test', {
        kind: 'class',
        rootPath: '/project',
        limit: 50,
        caseSensitive: true,
      })
    })

    it('should reject empty query', async () => {
      await expect(caller.searchSymbols({ query: '' })).rejects.toThrow()
    })

    it('should reject query exceeding 200 characters', async () => {
      const longQuery = 'a'.repeat(201)
      await expect(caller.searchSymbols({ query: longQuery })).rejects.toThrow()
    })

    it('should accept query at max length', async () => {
      vi.mocked(treeSitterService.searchSymbols).mockReturnValueOnce([])

      const maxQuery = 'a'.repeat(200)
      await expect(caller.searchSymbols({ query: maxQuery })).resolves.toEqual([])
    })

    it('should reject invalid kind', async () => {
      await expect(
        caller.searchSymbols({
          query: 'test',
          options: { kind: 'invalid' as unknown as 'function' },
        })
      ).rejects.toThrow()
    })

    it('should reject limit out of range', async () => {
      await expect(
        caller.searchSymbols({
          query: 'test',
          options: { limit: 0 },
        })
      ).rejects.toThrow()

      await expect(
        caller.searchSymbols({
          query: 'test',
          options: { limit: 1001 },
        })
      ).rejects.toThrow()
    })
  })

  // ===========================================================================
  // FIND DEFINITION PROCEDURE
  // ===========================================================================
  describe('findDefinition', () => {
    it('should find symbol definition', async () => {
      const mockSymbol = createMockSymbol({ name: 'MyClass', kind: 'class' })
      vi.mocked(treeSitterService.findDefinition).mockReturnValueOnce(mockSymbol)

      const result = await caller.findDefinition({ symbolName: 'MyClass' })

      expect(result).toEqual(mockSymbol)
      expect(treeSitterService.findDefinition).toHaveBeenCalledWith('MyClass', undefined)
    })

    it('should find definition in specific project', async () => {
      vi.mocked(treeSitterService.findDefinition).mockReturnValueOnce(null)

      await caller.findDefinition({
        symbolName: 'MyClass',
        rootPath: '/project',
      })

      expect(treeSitterService.findDefinition).toHaveBeenCalledWith('MyClass', '/project')
    })

    it('should return null when definition not found', async () => {
      vi.mocked(treeSitterService.findDefinition).mockReturnValueOnce(null)

      const result = await caller.findDefinition({ symbolName: 'NonExistent' })

      expect(result).toBeNull()
    })

    it('should reject empty symbol name', async () => {
      await expect(caller.findDefinition({ symbolName: '' })).rejects.toThrow()
    })

    it('should reject symbol name exceeding 200 characters', async () => {
      const longName = 'a'.repeat(201)
      await expect(caller.findDefinition({ symbolName: longName })).rejects.toThrow()
    })
  })

  // ===========================================================================
  // FIND REFERENCES PROCEDURE
  // ===========================================================================
  describe('findReferences', () => {
    it('should find all symbol references', async () => {
      const mockSymbols = [
        createMockSymbol({ name: 'MyClass', filePath: '/a.ts', startLine: 10 }),
        createMockSymbol({ name: 'MyClass', filePath: '/b.ts', startLine: 5 }),
      ]
      vi.mocked(treeSitterService.findReferences).mockReturnValueOnce(mockSymbols)

      const result = await caller.findReferences({ symbolName: 'MyClass' })

      expect(result).toHaveLength(2)
      expect(treeSitterService.findReferences).toHaveBeenCalledWith('MyClass', undefined)
    })

    it('should find references in specific project', async () => {
      vi.mocked(treeSitterService.findReferences).mockReturnValueOnce([])

      await caller.findReferences({
        symbolName: 'MyClass',
        rootPath: '/project',
      })

      expect(treeSitterService.findReferences).toHaveBeenCalledWith('MyClass', '/project')
    })

    it('should return empty array when no references found', async () => {
      vi.mocked(treeSitterService.findReferences).mockReturnValueOnce([])

      const result = await caller.findReferences({ symbolName: 'Unused' })

      expect(result).toEqual([])
    })

    it('should reject empty symbol name', async () => {
      await expect(caller.findReferences({ symbolName: '' })).rejects.toThrow()
    })
  })

  // ===========================================================================
  // GET FILE OUTLINE PROCEDURE
  // ===========================================================================
  describe('getFileOutline', () => {
    it('should return file outline', async () => {
      const mockSymbols = [
        createMockSymbol({ name: 'MyClass', kind: 'class', startLine: 1 }),
        createMockSymbol({ name: 'constructor', kind: 'method', startLine: 5 }),
        createMockSymbol({ name: 'myMethod', kind: 'method', startLine: 10 }),
      ]
      vi.mocked(treeSitterService.getFileOutline).mockReturnValueOnce(mockSymbols)

      const result = await caller.getFileOutline({ filePath: '/path/to/file.ts' })

      expect(result).toHaveLength(3)
      expect(treeSitterService.getFileOutline).toHaveBeenCalledWith('/path/to/file.ts')
    })

    it('should return empty array for non-existent file', async () => {
      vi.mocked(treeSitterService.getFileOutline).mockReturnValueOnce([])

      const result = await caller.getFileOutline({ filePath: '/nonexistent.ts' })

      expect(result).toEqual([])
    })

    it('should reject empty file path', async () => {
      await expect(caller.getFileOutline({ filePath: '' })).rejects.toThrow()
    })
  })

  // ===========================================================================
  // GET CODEBASE STRUCTURE PROCEDURE
  // ===========================================================================
  describe('getCodebaseStructure', () => {
    it('should return codebase structure', async () => {
      const mockStructure = [
        {
          path: 'src',
          name: 'src',
          type: 'directory' as const,
          children: [
            {
              path: 'src/index.ts',
              name: 'index.ts',
              type: 'file' as const,
              language: 'typescript',
              symbolCount: 10,
            },
          ],
        },
      ]
      vi.mocked(treeSitterService.getCodebaseStructure).mockReturnValueOnce(mockStructure)

      const result = await caller.getCodebaseStructure({ rootPath: '/project' })

      expect(result).toEqual(mockStructure)
      expect(treeSitterService.getCodebaseStructure).toHaveBeenCalledWith('/project')
    })

    it('should return empty array for non-indexed project', async () => {
      vi.mocked(treeSitterService.getCodebaseStructure).mockReturnValueOnce([])

      const result = await caller.getCodebaseStructure({ rootPath: '/unindexed' })

      expect(result).toEqual([])
    })

    it('should reject empty root path', async () => {
      await expect(caller.getCodebaseStructure({ rootPath: '' })).rejects.toThrow()
    })
  })

  // ===========================================================================
  // CLEAR CACHE PROCEDURE
  // ===========================================================================
  describe('clearCache', () => {
    it('should clear all cache when no file path provided', async () => {
      vi.mocked(treeSitterService.clearCache).mockReturnValueOnce(undefined)

      const result = await caller.clearCache({})

      expect(result).toBe(true)
      expect(treeSitterService.clearCache).toHaveBeenCalledWith(undefined)
    })

    it('should clear cache for specific file', async () => {
      vi.mocked(treeSitterService.clearCache).mockReturnValueOnce(undefined)

      const result = await caller.clearCache({ filePath: '/path/to/file.ts' })

      expect(result).toBe(true)
      expect(treeSitterService.clearCache).toHaveBeenCalledWith('/path/to/file.ts')
    })

    it('should accept empty file path (clears all)', async () => {
      vi.mocked(treeSitterService.clearCache).mockReturnValueOnce(undefined)

      const result = await caller.clearCache({ filePath: '' })

      expect(result).toBe(true)
    })

    it('should reject file path exceeding 4096 characters', async () => {
      const longPath = '/a'.repeat(2049)
      await expect(caller.clearCache({ filePath: longPath })).rejects.toThrow()
    })
  })

  // ===========================================================================
  // CLEAR INDEX PROCEDURE
  // ===========================================================================
  describe('clearIndex', () => {
    it('should clear index for project', async () => {
      vi.mocked(treeSitterService.clearIndex).mockReturnValueOnce(undefined)

      const result = await caller.clearIndex({ rootPath: '/project' })

      expect(result).toBe(true)
      expect(treeSitterService.clearIndex).toHaveBeenCalledWith('/project')
    })

    it('should reject empty root path', async () => {
      await expect(caller.clearIndex({ rootPath: '' })).rejects.toThrow()
    })
  })

  // ===========================================================================
  // GET STATS PROCEDURE
  // ===========================================================================
  describe('getStats', () => {
    it('should return parsing statistics', async () => {
      const mockStats: TreeSitterStats = {
        filesParsed: 100,
        symbolsExtracted: 500,
        parseErrors: 5,
        cacheHits: 80,
        cacheMisses: 20,
        avgParseTime: 15,
        indexedProjects: 2,
      }
      vi.mocked(treeSitterService.getStats).mockReturnValueOnce(mockStats)

      const result = await caller.getStats()

      expect(result).toEqual(mockStats)
    })

    it('should return empty stats when nothing parsed', async () => {
      const emptyStats: TreeSitterStats = {
        filesParsed: 0,
        symbolsExtracted: 0,
        parseErrors: 0,
        cacheHits: 0,
        cacheMisses: 0,
        avgParseTime: 0,
        indexedProjects: 0,
      }
      vi.mocked(treeSitterService.getStats).mockReturnValueOnce(emptyStats)

      const result = await caller.getStats()

      expect(result).toEqual(emptyStats)
    })
  })

  // ===========================================================================
  // GET CONFIG PROCEDURE
  // ===========================================================================
  describe('getConfig', () => {
    it('should return current configuration', async () => {
      const mockConfig: TreeSitterConfig = {
        maxFileSize: 1024 * 1024,
        excludePatterns: ['node_modules', '.git'],
        includeExtensions: ['.ts', '.js'],
        maxDepth: 20,
        parallelParsing: true,
        cacheResults: true,
      }
      vi.mocked(treeSitterService.getConfig).mockReturnValueOnce(mockConfig)

      const result = await caller.getConfig()

      expect(result).toEqual(mockConfig)
    })
  })

  // ===========================================================================
  // UPDATE CONFIG PROCEDURE
  // ===========================================================================
  describe('updateConfig', () => {
    it('should update configuration', async () => {
      vi.mocked(treeSitterService.updateConfig).mockReturnValueOnce(undefined)

      const result = await caller.updateConfig({
        config: {
          maxFileSize: 2 * 1024 * 1024,
          cacheResults: false,
        },
      })

      expect(result).toBe(true)
      expect(treeSitterService.updateConfig).toHaveBeenCalledWith({
        maxFileSize: 2 * 1024 * 1024,
        cacheResults: false,
      })
    })

    it('should update partial configuration', async () => {
      vi.mocked(treeSitterService.updateConfig).mockReturnValueOnce(undefined)

      const result = await caller.updateConfig({
        config: { parallelParsing: false },
      })

      expect(result).toBe(true)
      expect(treeSitterService.updateConfig).toHaveBeenCalledWith({ parallelParsing: false })
    })

    it('should reject maxFileSize below 1024', async () => {
      await expect(
        caller.updateConfig({
          config: { maxFileSize: 1023 },
        })
      ).rejects.toThrow()
    })

    it('should reject maxFileSize above 10MB', async () => {
      await expect(
        caller.updateConfig({
          config: { maxFileSize: 10 * 1024 * 1024 + 1 },
        })
      ).rejects.toThrow()
    })

    it('should accept maxFileSize at boundaries', async () => {
      vi.mocked(treeSitterService.updateConfig).mockReturnValue(undefined)

      await expect(
        caller.updateConfig({ config: { maxFileSize: 1024 } })
      ).resolves.toBe(true)

      await expect(
        caller.updateConfig({ config: { maxFileSize: 10 * 1024 * 1024 } })
      ).resolves.toBe(true)
    })

    it('should reject maxDepth out of range', async () => {
      await expect(
        caller.updateConfig({ config: { maxDepth: 0 } })
      ).rejects.toThrow()

      await expect(
        caller.updateConfig({ config: { maxDepth: 101 } })
      ).rejects.toThrow()
    })

    it('should reject exclude patterns with too long items', async () => {
      const longPattern = 'a'.repeat(101)
      await expect(
        caller.updateConfig({
          config: { excludePatterns: [longPattern] },
        })
      ).rejects.toThrow()
    })

    it('should reject too many exclude patterns', async () => {
      const manyPatterns = Array.from({ length: 101 }, (_, i) => `pattern${i}`)
      await expect(
        caller.updateConfig({
          config: { excludePatterns: manyPatterns },
        })
      ).rejects.toThrow()
    })

    it('should reject include extensions with too long items', async () => {
      const longExt = '.'.repeat(21)
      await expect(
        caller.updateConfig({
          config: { includeExtensions: [longExt] },
        })
      ).rejects.toThrow()
    })
  })

  // ===========================================================================
  // SECURITY TESTS
  // ===========================================================================
  describe('security', () => {
    it('should accept file paths with special but valid characters', async () => {
      vi.mocked(treeSitterService.parseFile).mockReturnValue(null)

      // Valid path characters
      await expect(caller.parseFile({ filePath: '/path/to/file.ts' })).resolves.toBeNull()
      await expect(caller.parseFile({ filePath: '/path-with-dashes/file.ts' })).resolves.toBeNull()
      await expect(caller.parseFile({ filePath: '/path_with_underscores/file.ts' })).resolves.toBeNull()
      await expect(caller.parseFile({ filePath: '/path.with.dots/file.ts' })).resolves.toBeNull()
    })

    it('should handle paths with spaces', async () => {
      vi.mocked(treeSitterService.parseFile).mockReturnValue(null)

      // Paths with spaces are valid
      await expect(
        caller.parseFile({ filePath: '/path with spaces/file.ts' })
      ).resolves.toBeNull()
    })

    it('should handle symbol names that look like code', async () => {
      vi.mocked(treeSitterService.findDefinition).mockReturnValue(null)

      // These are valid symbol queries even if they contain special chars
      await expect(
        caller.findDefinition({ symbolName: 'function_name' })
      ).resolves.toBeNull()
    })
  })

  // ===========================================================================
  // EDGE CASES
  // ===========================================================================
  describe('edge cases', () => {
    it('should handle concurrent parseFile calls', async () => {
      vi.mocked(treeSitterService.parseFile).mockReturnValue(createMockParseResult())

      const results = await Promise.all([
        caller.parseFile({ filePath: '/file1.ts' }),
        caller.parseFile({ filePath: '/file2.ts' }),
        caller.parseFile({ filePath: '/file3.ts' }),
      ])

      expect(results).toHaveLength(3)
      expect(treeSitterService.parseFile).toHaveBeenCalledTimes(3)
    })

    it('should handle concurrent searchSymbols calls', async () => {
      vi.mocked(treeSitterService.searchSymbols).mockReturnValue([createMockSymbol()])

      const results = await Promise.all([
        caller.searchSymbols({ query: 'test1' }),
        caller.searchSymbols({ query: 'test2' }),
        caller.searchSymbols({ query: 'test3' }),
      ])

      expect(results).toHaveLength(3)
      results.forEach((r) => expect(r).toHaveLength(1))
    })

    it('should handle file with many symbols', async () => {
      const manySymbols = Array.from({ length: 1000 }, (_, i) =>
        createMockSymbol({ name: `symbol${i}`, startLine: i })
      )
      vi.mocked(treeSitterService.parseFile).mockReturnValueOnce(
        createMockParseResult({ symbols: manySymbols })
      )

      const result = await caller.parseFile({ filePath: '/large-file.ts' })

      expect(result?.symbols).toHaveLength(1000)
    })

    it('should handle deeply nested codebase structure', async () => {
      const deepStructure = [
        {
          path: 'level1',
          name: 'level1',
          type: 'directory' as const,
          children: [
            {
              path: 'level1/level2',
              name: 'level2',
              type: 'directory' as const,
              children: [
                {
                  path: 'level1/level2/level3',
                  name: 'level3',
                  type: 'directory' as const,
                  children: [
                    {
                      path: 'level1/level2/level3/file.ts',
                      name: 'file.ts',
                      type: 'file' as const,
                      language: 'typescript',
                      symbolCount: 5,
                    },
                  ],
                },
              ],
            },
          ],
        },
      ]
      vi.mocked(treeSitterService.getCodebaseStructure).mockReturnValueOnce(deepStructure)

      const result = await caller.getCodebaseStructure({ rootPath: '/project' })

      expect(result[0].children?.[0]?.children?.[0]?.children?.[0]?.name).toBe('file.ts')
    })

    it('should handle all valid symbol kinds', async () => {
      const validKinds = [
        'function',
        'method',
        'class',
        'interface',
        'type',
        'variable',
        'constant',
        'enum',
        'property',
        'parameter',
        'module',
        'namespace',
        'import',
        'export',
      ] as const

      for (const kind of validKinds) {
        vi.mocked(treeSitterService.searchSymbols).mockReturnValueOnce([])
        await expect(
          caller.searchSymbols({ query: 'test', options: { kind } })
        ).resolves.toEqual([])
      }
    })
  })
})
