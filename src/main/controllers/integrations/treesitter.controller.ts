/**
 * Tree-sitter Controller
 *
 * Type-safe tRPC controller for code parsing and analysis.
 * Provides symbol extraction, definition lookup, and codebase indexing.
 *
 * Migrated from handlers.ts (10 handlers):
 * - treesitter:parseFile
 * - treesitter:indexCodebase
 * - treesitter:searchSymbols
 * - treesitter:findDefinition
 * - treesitter:findReferences
 * - treesitter:getFileOutline
 * - treesitter:getCodebaseStructure
 * - treesitter:clearCache
 * - treesitter:clearIndex
 * - treesitter:getStats
 * - treesitter:getConfig
 * - treesitter:updateConfig
 *
 * @module treesitter.controller
 */

import { z } from 'zod'
import { router, publicProcedure, auditedProcedure } from '../../trpc/trpc'
import {
  treeSitterService,
  type FileParseResult,
  type CodeSymbol,
  type TreeSitterStats,
  type TreeSitterConfig,
  type SymbolKind,
} from '../../services/treesitter'

// ============================================================================
// Schemas
// ============================================================================

const FilePathSchema = z.object({
  filePath: z
    .string()
    .min(1, 'File path cannot be empty')
    .max(4096, 'File path cannot exceed 4096 characters'),
})

const RootPathSchema = z.object({
  rootPath: z
    .string()
    .min(1, 'Root path cannot be empty')
    .max(4096, 'Root path cannot exceed 4096 characters'),
})

const SymbolSearchSchema = z.object({
  query: z.string().min(1, 'Query cannot be empty').max(200, 'Query cannot exceed 200 characters'),
  options: z
    .object({
      kind: z
        .enum([
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
        ])
        .optional(),
      rootPath: z.string().max(4096).optional(),
      limit: z.number().int().min(1).max(1000).optional(),
      caseSensitive: z.boolean().optional(),
    })
    .optional(),
})

const FindSymbolSchema = z.object({
  symbolName: z
    .string()
    .min(1, 'Symbol name cannot be empty')
    .max(200, 'Symbol name cannot exceed 200 characters'),
  rootPath: z.string().max(4096).optional(),
})

const ClearCacheSchema = z.object({
  filePath: z.string().max(4096).optional(),
})

const UpdateConfigSchema = z.object({
  config: z.object({
    maxFileSize: z.number().int().min(1024).max(10485760).optional(), // 1KB to 10MB
    excludePatterns: z.array(z.string().max(100)).max(100).optional(),
    includeExtensions: z.array(z.string().max(20)).max(100).optional(),
    maxDepth: z.number().int().min(1).max(100).optional(),
    parallelParsing: z.boolean().optional(),
    cacheResults: z.boolean().optional(),
  }),
})

// ============================================================================
// Types for Codebase Structure
// ============================================================================

interface CodebaseStructureItem {
  path: string
  name: string
  type: 'file' | 'directory'
  language?: string
  symbolCount?: number
  children?: CodebaseStructureItem[]
}

// ============================================================================
// Router
// ============================================================================

export const treesitterRouter = router({
  /**
   * Parse a single file and extract symbols
   */
  parseFile: publicProcedure.input(FilePathSchema).query(({ input }): FileParseResult | null => {
    return treeSitterService.parseFile(input.filePath)
  }),

  /**
   * Index an entire codebase
   * Returns indexing statistics
   */
  indexCodebase: publicProcedure.input(RootPathSchema).mutation(async ({ input }) => {
    const index = await treeSitterService.indexCodebase(input.rootPath)
    return index.stats
  }),

  /**
   * Search for symbols by name
   */
  searchSymbols: publicProcedure.input(SymbolSearchSchema).query(({ input }): CodeSymbol[] => {
    return treeSitterService.searchSymbols(
      input.query,
      input.options as {
        kind?: SymbolKind
        rootPath?: string
        limit?: number
        caseSensitive?: boolean
      }
    )
  }),

  /**
   * Find the definition of a symbol
   */
  findDefinition: publicProcedure.input(FindSymbolSchema).query(({ input }): CodeSymbol | null => {
    return treeSitterService.findDefinition(input.symbolName, input.rootPath)
  }),

  /**
   * Find all references to a symbol
   */
  findReferences: publicProcedure.input(FindSymbolSchema).query(({ input }): CodeSymbol[] => {
    return treeSitterService.findReferences(input.symbolName, input.rootPath)
  }),

  /**
   * Get file outline (list of symbols)
   */
  getFileOutline: publicProcedure.input(FilePathSchema).query(({ input }): CodeSymbol[] => {
    return treeSitterService.getFileOutline(input.filePath)
  }),

  /**
   * Get codebase structure (directory tree with symbol counts)
   */
  getCodebaseStructure: publicProcedure
    .input(RootPathSchema)
    .query(({ input }): CodebaseStructureItem[] => {
      return treeSitterService.getCodebaseStructure(input.rootPath)
    }),

  /**
   * Clear parse cache for a file or all files
   */
  clearCache: auditedProcedure.input(ClearCacheSchema).mutation(({ input }): boolean => {
    treeSitterService.clearCache(input.filePath)
    return true
  }),

  /**
   * Clear codebase index
   */
  clearIndex: auditedProcedure.input(RootPathSchema).mutation(({ input }): boolean => {
    treeSitterService.clearIndex(input.rootPath)
    return true
  }),

  /**
   * Get parsing statistics
   */
  getStats: publicProcedure.query((): TreeSitterStats => {
    return treeSitterService.getStats()
  }),

  /**
   * Get current configuration
   */
  getConfig: publicProcedure.query((): TreeSitterConfig => {
    return treeSitterService.getConfig()
  }),

  /**
   * Update configuration
   */
  updateConfig: auditedProcedure.input(UpdateConfigSchema).mutation(({ input }): boolean => {
    treeSitterService.updateConfig(input.config)
    return true
  }),
})
