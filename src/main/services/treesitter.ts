/**
 * Tree-sitter Codebase Parsing Service
 * Incremental parsing and code analysis for Claude Pilot
 * Feature: deploy-4u2e
 */

import { EventEmitter } from 'events'
import { readFileSync, existsSync, readdirSync, statSync } from 'fs'
import { join, extname, relative } from 'path'

// Symbol types that can be extracted from code
export type SymbolKind =
  | 'function'
  | 'method'
  | 'class'
  | 'interface'
  | 'type'
  | 'variable'
  | 'constant'
  | 'enum'
  | 'property'
  | 'parameter'
  | 'module'
  | 'namespace'
  | 'import'
  | 'export'

export interface CodeSymbol {
  name: string
  kind: SymbolKind
  filePath: string
  startLine: number
  endLine: number
  startColumn: number
  endColumn: number
  signature?: string
  docstring?: string
  parent?: string // Parent symbol name (e.g., class for methods)
  children?: string[] // Child symbols (e.g., methods in a class)
  modifiers?: string[] // public, private, async, etc.
  returnType?: string
  parameters?: Array<{ name: string; type?: string; defaultValue?: string }>
}

export interface FileParseResult {
  filePath: string
  language: string
  symbols: CodeSymbol[]
  imports: Array<{ module: string; symbols: string[]; alias?: string; line: number }>
  exports: Array<{ name: string; kind: SymbolKind; line: number }>
  parseTime: number
  errors: Array<{ message: string; line: number; column: number }>
  size: number
  lineCount: number
}

export interface CodebaseIndex {
  rootPath: string
  files: Map<string, FileParseResult>
  symbols: Map<string, CodeSymbol[]> // symbol name -> all occurrences
  imports: Map<string, string[]> // module -> files that import it
  exports: Map<string, string[]> // export name -> files that export it
  lastUpdated: number
  stats: {
    totalFiles: number
    totalSymbols: number
    byLanguage: Record<string, number>
    byKind: Record<SymbolKind, number>
  }
}

export interface TreeSitterConfig {
  maxFileSize: number // bytes
  excludePatterns: string[]
  includeExtensions: string[]
  maxDepth: number
  parallelParsing: boolean
  cacheResults: boolean
}

export interface TreeSitterStats {
  filesParsed: number
  symbolsExtracted: number
  parseErrors: number
  cacheHits: number
  cacheMisses: number
  avgParseTime: number
  indexedProjects: number
}

// Language detection based on file extension
const LANGUAGE_MAP: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.js': 'javascript',
  '.jsx': 'jsx',
  '.py': 'python',
  '.rs': 'rust',
  '.go': 'go',
  '.java': 'java',
  '.c': 'c',
  '.cpp': 'cpp',
  '.h': 'c',
  '.hpp': 'cpp',
  '.cs': 'csharp',
  '.rb': 'ruby',
  '.php': 'php',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.scala': 'scala',
  '.sql': 'sql',
  '.sh': 'bash',
  '.bash': 'bash',
  '.zsh': 'bash',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.md': 'markdown',
  '.html': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.vue': 'vue',
  '.svelte': 'svelte',
}

const DEFAULT_CONFIG: TreeSitterConfig = {
  maxFileSize: 1024 * 1024, // 1MB
  excludePatterns: [
    'node_modules',
    '.git',
    'dist',
    'build',
    'out',
    'coverage',
    '__pycache__',
    '.venv',
    'venv',
    '.idea',
    '.vscode',
  ],
  includeExtensions: Object.keys(LANGUAGE_MAP),
  maxDepth: 20,
  parallelParsing: true,
  cacheResults: true,
}

// Regex patterns for extracting symbols from different languages
// This is a simplified implementation - full Tree-sitter would use actual parser
const PATTERNS: Record<string, Record<string, RegExp>> = {
  typescript: {
    function:
      /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*(?:<[^>]*>)?\s*\(([^)]*)\)(?:\s*:\s*([^{]+))?\s*\{/g,
    arrowFunction:
      /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*(?::\s*[^=]+)?\s*=\s*(?:async\s+)?(?:\([^)]*\)|[^=]+)\s*=>/g,
    class: /(?:export\s+)?(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([^{]+))?\s*\{/g,
    interface: /(?:export\s+)?interface\s+(\w+)(?:\s+extends\s+([^{]+))?\s*\{/g,
    type: /(?:export\s+)?type\s+(\w+)(?:<[^>]*>)?\s*=/g,
    enum: /(?:export\s+)?(?:const\s+)?enum\s+(\w+)\s*\{/g,
    variable: /(?:export\s+)?(?:const|let|var)\s+(\w+)(?:\s*:\s*([^=]+))?\s*=/g,
    import:
      /import\s+(?:(\w+)|(?:\{\s*([^}]+)\s*\})|(?:\*\s+as\s+(\w+)))\s+from\s+['"]([^'"]+)['"]/g,
    export: /export\s+(?:default\s+)?(?:const|let|var|function|class|interface|type|enum)\s+(\w+)/g,
  },
  javascript: {
    function:
      /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)\s*\{/g,
    arrowFunction:
      /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[^=]+)\s*=>/g,
    class: /(?:export\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?\s*\{/g,
    variable: /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=/g,
    import:
      /import\s+(?:(\w+)|(?:\{\s*([^}]+)\s*\})|(?:\*\s+as\s+(\w+)))\s+from\s+['"]([^'"]+)['"]/g,
    export: /export\s+(?:default\s+)?(?:const|let|var|function|class)\s+(\w+)/g,
  },
  python: {
    function: /(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)(?:\s*->\s*([^:]+))?\s*:/g,
    class: /class\s+(\w+)(?:\s*\(([^)]*)\))?\s*:/g,
    variable: /^(\w+)\s*(?::\s*([^=]+))?\s*=/gm,
    import: /(?:from\s+(\S+)\s+)?import\s+([^#\n]+)/g,
  },
  rust: {
    function: /(?:pub\s+)?(?:async\s+)?fn\s+(\w+)(?:<[^>]*>)?\s*\(([^)]*)\)(?:\s*->\s*([^{]+))?\s*\{/g,
    struct: /(?:pub\s+)?struct\s+(\w+)(?:<[^>]*>)?\s*(?:\{|;)/g,
    enum: /(?:pub\s+)?enum\s+(\w+)(?:<[^>]*>)?\s*\{/g,
    trait: /(?:pub\s+)?trait\s+(\w+)(?:<[^>]*>)?\s*\{/g,
    impl: /impl(?:<[^>]*>)?\s+(?:(\w+)(?:<[^>]*>)?\s+for\s+)?(\w+)(?:<[^>]*>)?\s*\{/g,
    use: /use\s+([^;]+);/g,
  },
  go: {
    function: /func\s+(?:\((\w+)\s+\*?(\w+)\)\s+)?(\w+)\s*\(([^)]*)\)(?:\s*\(?([^{]*)\)?)?\s*\{/g,
    struct: /type\s+(\w+)\s+struct\s*\{/g,
    interface: /type\s+(\w+)\s+interface\s*\{/g,
    variable: /(?:var|const)\s+(\w+)\s+/g,
    import: /import\s+(?:"([^"]+)"|(?:\(\s*([^)]+)\s*\)))/g,
  },
}

class TreeSitterService extends EventEmitter {
  private config: TreeSitterConfig = DEFAULT_CONFIG
  private indexes: Map<string, CodebaseIndex> = new Map()
  private fileCache: Map<string, FileParseResult> = new Map()
  private stats: TreeSitterStats = {
    filesParsed: 0,
    symbolsExtracted: 0,
    parseErrors: 0,
    cacheHits: 0,
    cacheMisses: 0,
    avgParseTime: 0,
    indexedProjects: 0,
  }
  private totalParseTime = 0
  private initialized = false

  /**
   * Initialize the Tree-sitter service
   */
  async initialize(config?: Partial<TreeSitterConfig>): Promise<void> {
    if (this.initialized) return

    this.config = { ...DEFAULT_CONFIG, ...config }
    this.initialized = true
    console.info('[TreeSitter] Initialized')
  }

  /**
   * Parse a single file
   */
  parseFile(filePath: string): FileParseResult | null {
    if (!existsSync(filePath)) {
      return null
    }

    // Check cache
    if (this.config.cacheResults && this.fileCache.has(filePath)) {
      this.stats.cacheHits++
      return this.fileCache.get(filePath)!
    }

    this.stats.cacheMisses++
    const startTime = Date.now()

    try {
      const stats = statSync(filePath)
      if (stats.size > this.config.maxFileSize) {
        return {
          filePath,
          language: 'unknown',
          symbols: [],
          imports: [],
          exports: [],
          parseTime: 0,
          errors: [{ message: 'File too large', line: 0, column: 0 }],
          size: stats.size,
          lineCount: 0,
        }
      }

      const content = readFileSync(filePath, 'utf-8')
      const ext = extname(filePath).toLowerCase()
      const language = LANGUAGE_MAP[ext] || 'unknown'
      const lines = content.split('\n')

      const result: FileParseResult = {
        filePath,
        language,
        symbols: [],
        imports: [],
        exports: [],
        parseTime: 0,
        errors: [],
        size: stats.size,
        lineCount: lines.length,
      }

      // Extract symbols using regex patterns
      const patterns = PATTERNS[language] || PATTERNS.javascript

      // Parse functions
      if (patterns.function) {
        const matches = content.matchAll(patterns.function)
        for (const match of matches) {
          const line = this.getLineNumber(content, match.index!)
          result.symbols.push({
            name: match[1],
            kind: 'function',
            filePath,
            startLine: line,
            endLine: line, // Would need full parse for accurate end
            startColumn: 0,
            endColumn: 0,
            parameters: this.parseParameters(match[2]),
            returnType: match[3]?.trim(),
          })
        }
      }

      // Parse arrow functions (TypeScript/JavaScript)
      if (patterns.arrowFunction) {
        const matches = content.matchAll(patterns.arrowFunction)
        for (const match of matches) {
          const line = this.getLineNumber(content, match.index!)
          result.symbols.push({
            name: match[1],
            kind: 'function',
            filePath,
            startLine: line,
            endLine: line,
            startColumn: 0,
            endColumn: 0,
          })
        }
      }

      // Parse classes
      if (patterns.class) {
        const matches = content.matchAll(patterns.class)
        for (const match of matches) {
          const line = this.getLineNumber(content, match.index!)
          result.symbols.push({
            name: match[1],
            kind: 'class',
            filePath,
            startLine: line,
            endLine: line,
            startColumn: 0,
            endColumn: 0,
          })
        }
      }

      // Parse interfaces (TypeScript)
      if (patterns.interface) {
        const matches = content.matchAll(patterns.interface)
        for (const match of matches) {
          const line = this.getLineNumber(content, match.index!)
          result.symbols.push({
            name: match[1],
            kind: 'interface',
            filePath,
            startLine: line,
            endLine: line,
            startColumn: 0,
            endColumn: 0,
          })
        }
      }

      // Parse types (TypeScript)
      if (patterns.type) {
        const matches = content.matchAll(patterns.type)
        for (const match of matches) {
          const line = this.getLineNumber(content, match.index!)
          result.symbols.push({
            name: match[1],
            kind: 'type',
            filePath,
            startLine: line,
            endLine: line,
            startColumn: 0,
            endColumn: 0,
          })
        }
      }

      // Parse enums
      if (patterns.enum) {
        const matches = content.matchAll(patterns.enum)
        for (const match of matches) {
          const line = this.getLineNumber(content, match.index!)
          result.symbols.push({
            name: match[1],
            kind: 'enum',
            filePath,
            startLine: line,
            endLine: line,
            startColumn: 0,
            endColumn: 0,
          })
        }
      }

      // Parse structs (Rust, Go)
      if (patterns.struct) {
        const matches = content.matchAll(patterns.struct)
        for (const match of matches) {
          const line = this.getLineNumber(content, match.index!)
          result.symbols.push({
            name: match[1],
            kind: 'class', // Map struct to class
            filePath,
            startLine: line,
            endLine: line,
            startColumn: 0,
            endColumn: 0,
          })
        }
      }

      // Parse traits (Rust)
      if (patterns.trait) {
        const matches = content.matchAll(patterns.trait)
        for (const match of matches) {
          const line = this.getLineNumber(content, match.index!)
          result.symbols.push({
            name: match[1],
            kind: 'interface', // Map trait to interface
            filePath,
            startLine: line,
            endLine: line,
            startColumn: 0,
            endColumn: 0,
          })
        }
      }

      // Parse imports
      if (patterns.import) {
        const matches = content.matchAll(patterns.import)
        for (const match of matches) {
          const line = this.getLineNumber(content, match.index!)
          const module = match[4] || match[1] || match[0]
          const symbols = match[2]
            ? match[2].split(',').map((s) => s.trim().split(/\s+as\s+/)[0])
            : match[1]
              ? [match[1]]
              : []

          result.imports.push({
            module,
            symbols,
            line,
          })
        }
      }

      // Parse exports
      if (patterns.export) {
        const matches = content.matchAll(patterns.export)
        for (const match of matches) {
          const line = this.getLineNumber(content, match.index!)
          result.exports.push({
            name: match[1],
            kind: 'variable', // Would need more context for accurate kind
            line,
          })
        }
      }

      result.parseTime = Date.now() - startTime
      this.stats.filesParsed++
      this.stats.symbolsExtracted += result.symbols.length
      this.totalParseTime += result.parseTime
      this.stats.avgParseTime = this.totalParseTime / this.stats.filesParsed

      // Cache result
      if (this.config.cacheResults) {
        this.fileCache.set(filePath, result)
      }

      this.emit('file:parsed', result)
      return result
    } catch (error) {
      this.stats.parseErrors++
      const errorResult: FileParseResult = {
        filePath,
        language: 'unknown',
        symbols: [],
        imports: [],
        exports: [],
        parseTime: Date.now() - startTime,
        errors: [{ message: (error as Error).message, line: 0, column: 0 }],
        size: 0,
        lineCount: 0,
      }
      return errorResult
    }
  }

  /**
   * Get line number from character offset
   */
  private getLineNumber(content: string, offset: number): number {
    const lines = content.substring(0, offset).split('\n')
    return lines.length
  }

  /**
   * Parse function parameters from parameter string
   */
  private parseParameters(
    paramString?: string
  ): Array<{ name: string; type?: string; defaultValue?: string }> {
    if (!paramString || !paramString.trim()) return []

    const params: Array<{ name: string; type?: string; defaultValue?: string }> = []
    const parts = paramString.split(',')

    for (const part of parts) {
      const trimmed = part.trim()
      if (!trimmed) continue

      // TypeScript style: name: type = default
      const tsMatch = trimmed.match(/^(\w+)(?:\s*:\s*([^=]+))?(?:\s*=\s*(.+))?$/)
      if (tsMatch) {
        params.push({
          name: tsMatch[1],
          type: tsMatch[2]?.trim(),
          defaultValue: tsMatch[3]?.trim(),
        })
      }
    }

    return params
  }

  /**
   * Index an entire codebase
   */
  async indexCodebase(rootPath: string): Promise<CodebaseIndex> {
    if (!existsSync(rootPath)) {
      throw new Error(`Path does not exist: ${rootPath}`)
    }

    const index: CodebaseIndex = {
      rootPath,
      files: new Map(),
      symbols: new Map(),
      imports: new Map(),
      exports: new Map(),
      lastUpdated: Date.now(),
      stats: {
        totalFiles: 0,
        totalSymbols: 0,
        byLanguage: {},
        byKind: {
          function: 0,
          method: 0,
          class: 0,
          interface: 0,
          type: 0,
          variable: 0,
          constant: 0,
          enum: 0,
          property: 0,
          parameter: 0,
          module: 0,
          namespace: 0,
          import: 0,
          export: 0,
        },
      },
    }

    // Collect all files
    const files = this.collectFiles(rootPath, 0)

    // Parse files
    for (const filePath of files) {
      const result = this.parseFile(filePath)
      if (!result) continue

      index.files.set(filePath, result)
      index.stats.totalFiles++
      index.stats.byLanguage[result.language] = (index.stats.byLanguage[result.language] || 0) + 1

      // Index symbols
      for (const symbol of result.symbols) {
        index.stats.totalSymbols++
        index.stats.byKind[symbol.kind]++

        const existing = index.symbols.get(symbol.name) || []
        existing.push(symbol)
        index.symbols.set(symbol.name, existing)
      }

      // Index imports
      for (const imp of result.imports) {
        const existing = index.imports.get(imp.module) || []
        if (!existing.includes(filePath)) {
          existing.push(filePath)
        }
        index.imports.set(imp.module, existing)
      }

      // Index exports
      for (const exp of result.exports) {
        const existing = index.exports.get(exp.name) || []
        if (!existing.includes(filePath)) {
          existing.push(filePath)
        }
        index.exports.set(exp.name, existing)
      }
    }

    this.indexes.set(rootPath, index)
    this.stats.indexedProjects = this.indexes.size

    this.emit('codebase:indexed', {
      rootPath,
      totalFiles: index.stats.totalFiles,
      totalSymbols: index.stats.totalSymbols,
    })

    return index
  }

  /**
   * Collect all parseable files in a directory
   */
  private collectFiles(dir: string, depth: number): string[] {
    if (depth > this.config.maxDepth) return []

    const files: string[] = []

    try {
      const entries = readdirSync(dir, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = join(dir, entry.name)

        // Skip excluded patterns
        if (this.config.excludePatterns.some((p) => entry.name.includes(p))) {
          continue
        }

        if (entry.isDirectory()) {
          files.push(...this.collectFiles(fullPath, depth + 1))
        } else if (entry.isFile()) {
          const ext = extname(entry.name).toLowerCase()
          if (this.config.includeExtensions.includes(ext)) {
            files.push(fullPath)
          }
        }
      }
    } catch {
      // Skip directories we can't read
    }

    return files
  }

  /**
   * Search for symbols by name
   */
  searchSymbols(
    query: string,
    options?: {
      kind?: SymbolKind
      rootPath?: string
      limit?: number
      caseSensitive?: boolean
    }
  ): CodeSymbol[] {
    const results: CodeSymbol[] = []
    const limit = options?.limit || 100
    const caseSensitive = options?.caseSensitive ?? false

    const indexes = options?.rootPath
      ? [this.indexes.get(options.rootPath)].filter(Boolean)
      : Array.from(this.indexes.values())

    const searchQuery = caseSensitive ? query : query.toLowerCase()

    for (const index of indexes) {
      if (!index) continue

      for (const [name, symbols] of index.symbols) {
        const compareName = caseSensitive ? name : name.toLowerCase()

        if (compareName.includes(searchQuery)) {
          for (const symbol of symbols) {
            if (options?.kind && symbol.kind !== options.kind) continue

            results.push(symbol)
            if (results.length >= limit) break
          }
        }

        if (results.length >= limit) break
      }

      if (results.length >= limit) break
    }

    return results
  }

  /**
   * Find definition of a symbol
   */
  findDefinition(symbolName: string, rootPath?: string): CodeSymbol | null {
    const indexes = rootPath
      ? [this.indexes.get(rootPath)].filter(Boolean)
      : Array.from(this.indexes.values())

    for (const index of indexes) {
      if (!index) continue

      const symbols = index.symbols.get(symbolName)
      if (symbols && symbols.length > 0) {
        // Return the first definition (usually the actual definition)
        return symbols[0]
      }
    }

    return null
  }

  /**
   * Find all references to a symbol
   */
  findReferences(symbolName: string, rootPath?: string): CodeSymbol[] {
    const indexes = rootPath
      ? [this.indexes.get(rootPath)].filter(Boolean)
      : Array.from(this.indexes.values())

    const results: CodeSymbol[] = []

    for (const index of indexes) {
      if (!index) continue

      const symbols = index.symbols.get(symbolName)
      if (symbols) {
        results.push(...symbols)
      }
    }

    return results
  }

  /**
   * Get file structure (outline)
   */
  getFileOutline(filePath: string): CodeSymbol[] {
    const cached = this.fileCache.get(filePath)
    if (cached) {
      return cached.symbols
    }

    const result = this.parseFile(filePath)
    return result?.symbols || []
  }

  /**
   * Get codebase structure (files and their symbols)
   */
  getCodebaseStructure(rootPath: string): {
    path: string
    name: string
    type: 'file' | 'directory'
    language?: string
    symbolCount?: number
    children?: Array<{
      path: string
      name: string
      type: 'file' | 'directory'
      language?: string
      symbolCount?: number
    }>
  }[] {
    const index = this.indexes.get(rootPath)
    if (!index) return []

    const structure: Map<
      string,
      {
        path: string
        name: string
        type: 'file' | 'directory'
        language?: string
        symbolCount?: number
        children: Map<string, unknown>
      }
    > = new Map()

    for (const [filePath, result] of index.files) {
      const relativePath = relative(rootPath, filePath)
      const parts = relativePath.split('/')

      let current = structure
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i]
        if (!current.has(part)) {
          current.set(part, {
            path: parts.slice(0, i + 1).join('/'),
            name: part,
            type: 'directory',
            children: new Map(),
          })
        }
        current = (current.get(part) as { children: Map<string, unknown> }).children as Map<
          string,
          {
            path: string
            name: string
            type: 'file' | 'directory'
            children: Map<string, unknown>
          }
        >
      }

      const fileName = parts[parts.length - 1]
      current.set(fileName, {
        path: relativePath,
        name: fileName,
        type: 'file',
        language: result.language,
        symbolCount: result.symbols.length,
        children: new Map(),
      })
    }

    // Convert to array format
    const convertToArray = (
      map: Map<string, unknown>
    ): Array<{
      path: string
      name: string
      type: 'file' | 'directory'
      language?: string
      symbolCount?: number
      children?: Array<unknown>
    }> => {
      const result: Array<{
        path: string
        name: string
        type: 'file' | 'directory'
        language?: string
        symbolCount?: number
        children?: Array<unknown>
      }> = []
      for (const [, value] of map) {
        const item = value as {
          path: string
          name: string
          type: 'file' | 'directory'
          language?: string
          symbolCount?: number
          children: Map<string, unknown>
        }
        const converted: {
          path: string
          name: string
          type: 'file' | 'directory'
          language?: string
          symbolCount?: number
          children?: Array<unknown>
        } = {
          path: item.path,
          name: item.name,
          type: item.type,
        }
        if (item.language) converted.language = item.language
        if (item.symbolCount !== undefined) converted.symbolCount = item.symbolCount
        if (item.children.size > 0) {
          converted.children = convertToArray(item.children)
        }
        result.push(converted)
      }
      return result.sort((a, b) => {
        // Directories first, then files
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
        return a.name.localeCompare(b.name)
      })
    }

    return convertToArray(structure)
  }

  /**
   * Get index for a codebase
   */
  getIndex(rootPath: string): CodebaseIndex | null {
    return this.indexes.get(rootPath) || null
  }

  /**
   * Clear cache for a file or all files
   */
  clearCache(filePath?: string): void {
    if (filePath) {
      this.fileCache.delete(filePath)
    } else {
      this.fileCache.clear()
    }
  }

  /**
   * Clear index for a codebase
   */
  clearIndex(rootPath: string): void {
    this.indexes.delete(rootPath)
    this.stats.indexedProjects = this.indexes.size
  }

  /**
   * Get statistics
   */
  getStats(): TreeSitterStats {
    return { ...this.stats }
  }

  /**
   * Get configuration
   */
  getConfig(): TreeSitterConfig {
    return { ...this.config }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<TreeSitterConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /**
   * Shutdown the service
   */
  shutdown(): void {
    this.fileCache.clear()
    this.indexes.clear()
    this.initialized = false
    console.info('[TreeSitter] Shutdown complete')
  }
}

// Export singleton
export const treeSitterService = new TreeSitterService()

// Export class for testing
export { TreeSitterService }
