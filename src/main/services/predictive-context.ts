// Predictive Context Service - File prediction based on prompts and patterns
// Uses keyword matching, co-occurrence tracking, and session history analysis

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs'
import { join, basename, dirname, extname } from 'path'
import { homedir } from 'os'
import type {
  FilePrediction,
  FileAccessPattern,
  PredictiveContextStats,
  PredictiveContextConfig,
} from '../../shared/types'

const HOME = homedir()
const CACHE_DIR = join(HOME, '.config', 'claude-pilot', 'context-cache')
const CONFIG_PATH = join(HOME, '.config', 'claude-pilot', 'predictive-context.json')
const PATTERNS_PATH = join(CACHE_DIR, 'patterns.json')

// Default configuration
const DEFAULT_CONFIG: PredictiveContextConfig = {
  enabled: true,
  maxPredictions: 10,
  minConfidence: 0.3,
  trackHistory: true,
  preloadEnabled: false,
  cacheSize: 1000,
}

// Common file patterns by keyword
const KEYWORD_FILE_PATTERNS: Record<string, string[]> = {
  // Configuration
  config: ['*.config.*', 'config.*', '.env*', 'settings.*', '*.json', '*.yaml', '*.yml', '*.toml'],
  env: ['.env', '.env.*', 'env.*'],
  settings: ['settings.*', '*settings*', 'config.*'],

  // Frontend
  react: ['*.tsx', '*.jsx', 'components/**', 'hooks/**', 'pages/**'],
  component: ['components/**/*.tsx', 'components/**/*.jsx', 'src/components/**'],
  style: ['*.css', '*.scss', '*.sass', 'styles/**', '*.tailwind*'],
  hook: ['hooks/**', 'use*.ts', 'use*.tsx'],

  // Backend
  api: ['api/**', 'routes/**', 'endpoints/**', 'handlers/**'],
  handler: ['handlers/**', '*Handler*', '*handler*'],
  route: ['routes/**', 'router.*', 'routing.*'],
  middleware: ['middleware/**', '*Middleware*'],
  service: ['services/**', '*Service*', '*service*'],

  // Database
  database: ['**/db/**', 'database/**', '*.sql', 'migrations/**', 'schema.*'],
  schema: ['schema.*', '*.prisma', 'migrations/**', 'models/**'],
  migration: ['migrations/**', 'migrate.*'],
  model: ['models/**', '*Model*', '*.model.*'],

  // Testing
  test: ['*.test.*', '*.spec.*', '__tests__/**', 'tests/**', 'test/**'],
  spec: ['*.spec.*', 'specs/**'],

  // Types
  type: ['types/**', '*.d.ts', 'interfaces/**', '*types*'],
  interface: ['interfaces/**', '*.interface.*', 'types/**'],

  // Build/Deploy
  build: ['build/**', 'dist/**', '*.config.js', 'vite.config.*', 'webpack.*'],
  docker: ['Dockerfile*', 'docker-compose*', '.docker/**'],

  // Documentation
  doc: ['*.md', 'docs/**', 'README*'],
  readme: ['README*', 'readme*'],

  // Security
  auth: ['auth/**', '*auth*', '*Auth*', 'middleware/auth*'],
  security: ['security/**', '*security*', 'auth/**'],

  // Common keywords
  error: ['*error*', '*Error*', 'errors/**'],
  util: ['utils/**', 'lib/**', 'helpers/**', '*util*'],
  main: ['main.*', 'index.*', 'app.*', 'server.*'],
}

// File extension weights (more specific = higher weight)
const EXTENSION_WEIGHTS: Record<string, number> = {
  '.ts': 0.9,
  '.tsx': 0.95,
  '.js': 0.7,
  '.jsx': 0.75,
  '.json': 0.6,
  '.md': 0.4,
  '.css': 0.5,
  '.scss': 0.5,
  '.sql': 0.8,
  '.prisma': 0.85,
}

class PredictiveContextService {
  private config: PredictiveContextConfig
  private patterns: Map<string, FileAccessPattern> = new Map()
  private stats: PredictiveContextStats = {
    totalPredictions: 0,
    accuratePredictions: 0,
    accuracy: 0,
    trackedFiles: 0,
    cacheHitRate: 0,
  }
  private predictionCache: Map<string, { predictions: FilePrediction[]; timestamp: number }> =
    new Map()

  constructor() {
    this.config = this.loadConfig()
    this.loadPatterns()
    this.ensureCacheDir()
  }

  private ensureCacheDir(): void {
    if (!existsSync(CACHE_DIR)) {
      mkdirSync(CACHE_DIR, { recursive: true })
    }
  }

  private loadConfig(): PredictiveContextConfig {
    try {
      if (existsSync(CONFIG_PATH)) {
        return { ...DEFAULT_CONFIG, ...JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')) }
      }
    } catch (error) {
      console.error('[PredictiveContext] Failed to load config:', error)
    }
    return { ...DEFAULT_CONFIG }
  }

  private saveConfig(): void {
    try {
      const configDir = dirname(CONFIG_PATH)
      if (!existsSync(configDir)) {
        mkdirSync(configDir, { recursive: true })
      }
      writeFileSync(CONFIG_PATH, JSON.stringify(this.config, null, 2))
    } catch (error) {
      console.error('[PredictiveContext] Failed to save config:', error)
    }
  }

  private loadPatterns(): void {
    try {
      if (existsSync(PATTERNS_PATH)) {
        const data = JSON.parse(readFileSync(PATTERNS_PATH, 'utf-8'))
        this.patterns = new Map(Object.entries(data))
        this.stats.trackedFiles = this.patterns.size
      }
    } catch (error) {
      console.error('[PredictiveContext] Failed to load patterns:', error)
    }
  }

  private savePatterns(): void {
    try {
      const data = Object.fromEntries(this.patterns)
      writeFileSync(PATTERNS_PATH, JSON.stringify(data, null, 2))
    } catch (error) {
      console.error('[PredictiveContext] Failed to save patterns:', error)
    }
  }

  /**
   * Extract keywords from a prompt for file matching
   */
  private extractKeywords(prompt: string): string[] {
    const words = prompt
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2)

    // Dedupe and return common keywords
    const keywords = new Set<string>()
    for (const word of words) {
      // Check if word matches any pattern keyword
      for (const key of Object.keys(KEYWORD_FILE_PATTERNS)) {
        if (word.includes(key) || key.includes(word)) {
          keywords.add(key)
        }
      }
      // Also add the word itself if it's likely a file/code reference
      if (word.match(/^[a-z][a-z0-9]*$/)) {
        keywords.add(word)
      }
    }

    return Array.from(keywords)
  }

  /**
   * Find files in a directory matching patterns
   */
  private findMatchingFiles(projectPath: string, patterns: string[], maxDepth = 4): string[] {
    const matches: string[] = []
    const visited = new Set<string>()

    const walkDir = (dir: string, depth: number): void => {
      if (depth > maxDepth || visited.has(dir)) return
      visited.add(dir)

      try {
        const entries = readdirSync(dir, { withFileTypes: true })
        for (const entry of entries) {
          // Skip hidden and common non-code directories
          if (
            entry.name.startsWith('.') ||
            ['node_modules', 'dist', 'build', '.git', '__pycache__', 'venv'].includes(entry.name)
          ) {
            continue
          }

          const fullPath = join(dir, entry.name)
          const relativePath = fullPath.replace(projectPath + '/', '')

          if (entry.isDirectory()) {
            walkDir(fullPath, depth + 1)
          } else if (entry.isFile()) {
            // Check against patterns
            for (const pattern of patterns) {
              if (this.matchesPattern(relativePath, pattern)) {
                matches.push(relativePath)
                break
              }
            }
          }
        }
      } catch {
        // Skip directories we can't read
      }
    }

    if (existsSync(projectPath)) {
      walkDir(projectPath, 0)
    }

    return matches.slice(0, 50) // Limit results
  }

  /**
   * Simple glob-like pattern matching
   */
  private matchesPattern(path: string, pattern: string): boolean {
    // Convert glob to regex
    const regex = pattern
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '.')

    try {
      return new RegExp(regex, 'i').test(path)
    } catch {
      return path.includes(pattern.replace(/\*/g, ''))
    }
  }

  /**
   * Predict files based on prompt and project
   */
  predict(prompt: string, projectPath: string): FilePrediction[] {
    if (!this.config.enabled) return []

    // Check cache
    const cacheKey = `${projectPath}:${prompt.slice(0, 100)}`
    const cached = this.predictionCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < 60000) {
      this.stats.cacheHitRate = this.stats.cacheHitRate * 0.9 + 0.1
      return cached.predictions
    }

    this.stats.totalPredictions++
    const predictions: FilePrediction[] = []
    const keywords = this.extractKeywords(prompt)

    // 1. Keyword-based predictions
    const keywordPatterns = new Set<string>()
    for (const keyword of keywords) {
      const patterns = KEYWORD_FILE_PATTERNS[keyword]
      if (patterns) {
        patterns.forEach((p) => keywordPatterns.add(p))
      }
    }

    if (keywordPatterns.size > 0) {
      const matchingFiles = this.findMatchingFiles(projectPath, Array.from(keywordPatterns))
      for (const file of matchingFiles) {
        const ext = extname(file)
        const weight = EXTENSION_WEIGHTS[ext] || 0.5
        predictions.push({
          path: file,
          confidence: 0.6 * weight,
          reason: `Matches keywords: ${keywords.slice(0, 3).join(', ')}`,
          source: 'keyword',
        })
      }
    }

    // 2. Pattern-based predictions (from history)
    for (const [filePath, pattern] of this.patterns) {
      // Check if any keyword matches the file's associated keywords
      const matchingKeywords = pattern.keywords.filter((k) => keywords.includes(k))
      if (matchingKeywords.length > 0) {
        const confidence = Math.min(0.9, 0.4 + matchingKeywords.length * 0.15)
        predictions.push({
          path: filePath,
          confidence,
          reason: `Previously accessed with: ${matchingKeywords.join(', ')}`,
          source: 'pattern',
          lastAccessed: pattern.lastAccessed,
        })
      }
    }

    // 3. Co-occurrence predictions
    const accessedFiles = new Set<string>()
    for (const prediction of predictions) {
      accessedFiles.add(prediction.path)
    }

    for (const [filePath, pattern] of this.patterns) {
      if (accessedFiles.has(filePath)) {
        // Add co-occurring files
        for (const coFile of pattern.cooccurringFiles) {
          if (!accessedFiles.has(coFile)) {
            predictions.push({
              path: coFile,
              confidence: 0.5,
              reason: `Often accessed with ${basename(filePath)}`,
              source: 'cooccurrence',
            })
            accessedFiles.add(coFile)
          }
        }
      }
    }

    // 4. Recent files boost
    const recentThreshold = Date.now() - 24 * 60 * 60 * 1000 // 24 hours
    for (const prediction of predictions) {
      if (prediction.lastAccessed && prediction.lastAccessed > recentThreshold) {
        prediction.confidence = Math.min(1, prediction.confidence + 0.1)
      }
    }

    // Sort by confidence and deduplicate
    const seen = new Set<string>()
    const uniquePredictions = predictions
      .filter((p) => {
        if (seen.has(p.path)) return false
        seen.add(p.path)
        return p.confidence >= this.config.minConfidence
      })
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, this.config.maxPredictions)

    // Cache results
    this.predictionCache.set(cacheKey, {
      predictions: uniquePredictions,
      timestamp: Date.now(),
    })

    // Clean old cache entries
    if (this.predictionCache.size > this.config.cacheSize) {
      const oldest = Array.from(this.predictionCache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp)
        .slice(0, this.predictionCache.size - this.config.cacheSize)
      for (const [key] of oldest) {
        this.predictionCache.delete(key)
      }
    }

    return uniquePredictions
  }

  /**
   * Record file access for pattern learning
   */
  recordAccess(path: string, keywords: string[]): void {
    if (!this.config.trackHistory) return

    const now = Date.now()
    const pattern = this.patterns.get(path) || {
      path,
      accessCount: 0,
      lastAccessed: now,
      cooccurringFiles: [],
      keywords: [],
    }

    pattern.accessCount++
    pattern.lastAccessed = now

    // Add new keywords
    for (const keyword of keywords) {
      if (!pattern.keywords.includes(keyword)) {
        pattern.keywords.push(keyword)
        // Keep keywords list manageable
        if (pattern.keywords.length > 20) {
          pattern.keywords = pattern.keywords.slice(-20)
        }
      }
    }

    this.patterns.set(path, pattern)
    this.stats.trackedFiles = this.patterns.size

    // Track co-occurrence with recently accessed files
    const recentThreshold = now - 10 * 60 * 1000 // 10 minutes
    for (const [otherPath, otherPattern] of this.patterns) {
      if (otherPath !== path && otherPattern.lastAccessed > recentThreshold) {
        // Add co-occurrence in both directions
        if (!pattern.cooccurringFiles.includes(otherPath)) {
          pattern.cooccurringFiles.push(otherPath)
          if (pattern.cooccurringFiles.length > 10) {
            pattern.cooccurringFiles = pattern.cooccurringFiles.slice(-10)
          }
        }
        if (!otherPattern.cooccurringFiles.includes(path)) {
          otherPattern.cooccurringFiles.push(path)
          if (otherPattern.cooccurringFiles.length > 10) {
            otherPattern.cooccurringFiles = otherPattern.cooccurringFiles.slice(-10)
          }
        }
      }
    }

    // Debounced save
    this.debouncedSave()
  }

  private saveTimeout: NodeJS.Timeout | null = null
  private debouncedSave(): void {
    if (this.saveTimeout) clearTimeout(this.saveTimeout)
    this.saveTimeout = setTimeout(() => this.savePatterns(), 5000)
  }

  /**
   * Get patterns for a project
   */
  getPatterns(projectPath: string): FileAccessPattern[] {
    const patterns: FileAccessPattern[] = []
    for (const [path, pattern] of this.patterns) {
      // Filter to patterns relevant to this project (or all if no project specified)
      if (!projectPath || path.startsWith(projectPath.replace(HOME, '')) || path.startsWith('/')) {
        patterns.push(pattern)
      }
    }
    return patterns.sort((a, b) => b.accessCount - a.accessCount).slice(0, 100)
  }

  /**
   * Get statistics
   */
  getStats(): PredictiveContextStats {
    return {
      ...this.stats,
      accuracy:
        this.stats.totalPredictions > 0
          ? this.stats.accuratePredictions / this.stats.totalPredictions
          : 0,
    }
  }

  /**
   * Record that a prediction was accurate (file was actually accessed)
   */
  recordAccuratePrediction(): void {
    this.stats.accuratePredictions++
  }

  /**
   * Get configuration
   */
  getConfig(): PredictiveContextConfig {
    return { ...this.config }
  }

  /**
   * Update configuration
   */
  setConfig(config: PredictiveContextConfig): boolean {
    this.config = { ...this.config, ...config }
    this.saveConfig()
    return true
  }

  /**
   * Clear prediction cache
   */
  clearCache(): boolean {
    this.predictionCache.clear()
    return true
  }
}

export const predictiveContextService = new PredictiveContextService()
