/**
 * 5-Tier Configuration Resolver
 *
 * Merges configuration from 5 sources with proper precedence:
 * 1. Installation Defaults (built into app)
 * 2. System Policies (/etc/claude-pilot/) - can lock values
 * 3. User Preferences (~/.config/claude-pilot/settings.json)
 * 4. Project Config (.claude/pilot.json)
 * 5. Session Overrides (env vars, CLI flags)
 *
 * Admin-locked values cannot be overridden by lower-priority tiers.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { homedir, platform } from 'os'
import {
  type ClaudePilotConfig,
  type ResolvedConfig,
  type ConfigTier,
  type ConfigDiagnostic,
  type LockableValue,
  isLockableValue,
  DEFAULT_CONFIG,
} from './types'

// ============================================================================
// PATH HELPERS
// ============================================================================

function getSystemConfigPath(): string {
  if (platform() === 'win32') {
    return join(process.env.ProgramData || 'C:\\ProgramData', 'claude-pilot')
  }
  return '/etc/claude-pilot'
}

function getUserConfigPath(): string {
  if (platform() === 'win32') {
    return join(process.env.APPDATA || homedir(), 'claude-pilot')
  }
  if (platform() === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'claude-pilot')
  }
  return join(homedir(), '.config', 'claude-pilot')
}

function getProjectConfigPath(projectPath: string): string {
  return join(projectPath, '.claude', 'pilot.json')
}

// ============================================================================
// FILE OPERATIONS
// ============================================================================

function loadJsonFile<T>(path: string): T | null {
  try {
    if (!existsSync(path)) {
      return null
    }
    const content = readFileSync(path, 'utf-8')
    return JSON.parse(content) as T
  } catch (error) {
    console.warn(`[ConfigResolver] Failed to load ${path}:`, error)
    return null
  }
}

function saveJsonFile(path: string, data: unknown): boolean {
  try {
    const dir = dirname(path)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8')
    return true
  } catch (error) {
    console.error(`[ConfigResolver] Failed to save ${path}:`, error)
    return false
  }
}

// ============================================================================
// DEEP MERGE WITH LOCK HANDLING
// ============================================================================

/**
 * Extract value from potentially lockable value
 */
function extractValue<T>(val: T | LockableValue<T>): T {
  if (isLockableValue(val)) {
    return val.value
  }
  return val
}

/**
 * Check if a value is locked
 */
function isLocked<T>(val: T | LockableValue<T>): boolean {
  if (isLockableValue(val)) {
    return val.locked === true
  }
  return false
}

/**
 * Get lock reason if locked
 * @internal Reserved for future diagnostics feature
 */
function _getLockReason<T>(val: T | LockableValue<T>): string | undefined {
  if (isLockableValue(val)) {
    return val.lockReason
  }
  return undefined
}

interface MergeContext {
  sources: Record<string, ConfigTier>
  locked: string[]
  currentPath: string
  currentTier: ConfigTier
}

/**
 * Deep merge configurations with lock handling
 */
function deepMergeWithLocks(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  ctx: MergeContext
): Record<string, unknown> {
  const result = { ...target }

  for (const key of Object.keys(source)) {
    const path = ctx.currentPath ? `${ctx.currentPath}.${key}` : key
    const sourceVal = source[key]
    const targetVal = target[key]

    // Check if target value is locked (from higher-priority tier)
    if (ctx.locked.includes(path)) {
      // Skip - locked by admin
      continue
    }

    // Check if source value wants to lock
    if (isLockableValue(sourceVal)) {
      const extracted = extractValue(sourceVal)
      if (isLocked(sourceVal)) {
        ctx.locked.push(path)
      }
      result[key] = extracted
      ctx.sources[path] = ctx.currentTier
    } else if (
      typeof sourceVal === 'object' &&
      sourceVal !== null &&
      !Array.isArray(sourceVal) &&
      typeof targetVal === 'object' &&
      targetVal !== null &&
      !Array.isArray(targetVal)
    ) {
      // Deep merge objects
      result[key] = deepMergeWithLocks(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>,
        { ...ctx, currentPath: path }
      )
    } else {
      // Override with source value
      result[key] = sourceVal
      ctx.sources[path] = ctx.currentTier
    }
  }

  return result
}

// ============================================================================
// ENVIRONMENT VARIABLE PARSING
// ============================================================================

function parseEnvOverrides(): Partial<ClaudePilotConfig> {
  const overrides: Partial<ClaudePilotConfig> = {}

  // CLAUDE_PILOT_MODEL
  if (process.env.CLAUDE_PILOT_MODEL) {
    overrides.llm = { model: process.env.CLAUDE_PILOT_MODEL }
  }

  // CLAUDE_PILOT_MAX_TOKENS
  if (process.env.CLAUDE_PILOT_MAX_TOKENS) {
    const tokens = parseInt(process.env.CLAUDE_PILOT_MAX_TOKENS, 10)
    if (!isNaN(tokens)) {
      overrides.llm = { ...overrides.llm, maxTokens: tokens }
    }
  }

  // CLAUDE_PILOT_THINKING_ENABLED
  if (process.env.CLAUDE_PILOT_THINKING_ENABLED !== undefined) {
    const enabled = process.env.CLAUDE_PILOT_THINKING_ENABLED.toLowerCase()
    overrides.llm = {
      ...overrides.llm,
      thinkingEnabled: enabled === 'true' || enabled === '1',
    }
  }

  // CLAUDE_PILOT_SANDBOX
  if (process.env.CLAUDE_PILOT_SANDBOX !== undefined) {
    const sandbox = process.env.CLAUDE_PILOT_SANDBOX.toLowerCase()
    overrides.security = {
      sandboxMode: sandbox === 'true' || sandbox === '1',
    }
  }

  // CLAUDE_PILOT_THEME
  if (process.env.CLAUDE_PILOT_THEME) {
    const theme = process.env.CLAUDE_PILOT_THEME.toLowerCase()
    if (theme === 'dark' || theme === 'light' || theme === 'system') {
      overrides.ui = { theme }
    }
  }

  // CLAUDE_PILOT_TELEMETRY
  if (process.env.CLAUDE_PILOT_TELEMETRY !== undefined) {
    const enabled = process.env.CLAUDE_PILOT_TELEMETRY.toLowerCase()
    overrides.telemetry = {
      enabled: enabled === 'true' || enabled === '1',
    }
  }

  // CLAUDE_PILOT_OTEL_ENDPOINT
  if (process.env.CLAUDE_PILOT_OTEL_ENDPOINT) {
    overrides.telemetry = {
      ...overrides.telemetry,
      otelEndpoint: process.env.CLAUDE_PILOT_OTEL_ENDPOINT,
    }
  }

  return overrides
}

// ============================================================================
// CONFIG RESOLVER CLASS
// ============================================================================

export class ConfigResolver {
  private cachedConfig: ResolvedConfig | null = null
  private cacheTimestamp = 0
  private cacheTTL = 5000 // 5 seconds cache
  private projectPath: string | null = null

  /**
   * Set the current project path for project-level config
   */
  setProjectPath(path: string | null): void {
    if (this.projectPath !== path) {
      this.projectPath = path
      this.invalidateCache()
    }
  }

  /**
   * Get current project path
   */
  getProjectPath(): string | null {
    return this.projectPath
  }

  /**
   * Invalidate the config cache
   */
  invalidateCache(): void {
    this.cachedConfig = null
    this.cacheTimestamp = 0
  }

  /**
   * Resolve the effective configuration from all tiers
   */
  resolve(forceRefresh = false): ResolvedConfig {
    const now = Date.now()

    // Return cached config if still valid
    if (!forceRefresh && this.cachedConfig && now - this.cacheTimestamp < this.cacheTTL) {
      return this.cachedConfig
    }

    const ctx: MergeContext = {
      sources: {},
      locked: [],
      currentPath: '',
      currentTier: 'installation',
    }

    // Start with installation defaults
    let config = { ...DEFAULT_CONFIG } as Record<string, unknown>

    // Load system policies
    const systemPath = join(getSystemConfigPath(), 'policy.json')
    const systemConfig = loadJsonFile<ClaudePilotConfig>(systemPath)
    if (systemConfig) {
      ctx.currentTier = 'system'
      config = deepMergeWithLocks(config, systemConfig as Record<string, unknown>, ctx)
    }

    // Load user preferences
    const userPath = join(getUserConfigPath(), 'settings.json')
    const userConfig = loadJsonFile<ClaudePilotConfig>(userPath)
    if (userConfig) {
      ctx.currentTier = 'user'
      config = deepMergeWithLocks(config, userConfig as Record<string, unknown>, ctx)
    }

    // Load project config
    if (this.projectPath) {
      const projectPath = getProjectConfigPath(this.projectPath)
      const projectConfig = loadJsonFile<ClaudePilotConfig>(projectPath)
      if (projectConfig) {
        ctx.currentTier = 'project'
        config = deepMergeWithLocks(config, projectConfig as Record<string, unknown>, ctx)
      }
    }

    // Apply session overrides (env vars)
    const envOverrides = parseEnvOverrides()
    if (Object.keys(envOverrides).length > 0) {
      ctx.currentTier = 'session'
      config = deepMergeWithLocks(config, envOverrides as Record<string, unknown>, ctx)
    }

    // Build resolved config with metadata
    const resolved: ResolvedConfig = {
      ...(config as ClaudePilotConfig),
      _meta: {
        sources: ctx.sources,
        locked: ctx.locked,
        resolvedAt: now,
        projectPath: this.projectPath || undefined,
      },
    }

    // Cache the result
    this.cachedConfig = resolved
    this.cacheTimestamp = now

    return resolved
  }

  /**
   * Get a specific config value
   */
  get<T>(path: string): T | undefined {
    const config = this.resolve()
    const parts = path.split('.')
    let current: unknown = config

    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = (current as Record<string, unknown>)[part]
      } else {
        return undefined
      }
    }

    return current as T
  }

  /**
   * Check if a config key is locked
   */
  isLocked(path: string): boolean {
    const config = this.resolve()
    return config._meta.locked.includes(path)
  }

  /**
   * Get the source tier for a config key
   */
  getSource(path: string): ConfigTier | undefined {
    const config = this.resolve()
    return config._meta.sources[path]
  }

  /**
   * Get diagnostics for all config keys
   */
  getDiagnostics(): ConfigDiagnostic[] {
    const config = this.resolve()
    const diagnostics: ConfigDiagnostic[] = []

    function traverse(
      obj: Record<string, unknown>,
      prefix: string,
      sources: Record<string, ConfigTier>,
      locked: string[]
    ) {
      for (const [key, value] of Object.entries(obj)) {
        if (key === '_meta') continue

        const path = prefix ? `${prefix}.${key}` : key

        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          traverse(value as Record<string, unknown>, path, sources, locked)
        } else {
          diagnostics.push({
            key: path,
            value,
            sourceTier: sources[path] || 'installation',
            isLocked: locked.includes(path),
          })
        }
      }
    }

    traverse(
      config as unknown as Record<string, unknown>,
      '',
      config._meta.sources,
      config._meta.locked
    )

    return diagnostics
  }

  /**
   * Save user preferences
   */
  saveUserConfig(config: Partial<ClaudePilotConfig>): boolean {
    const userPath = join(getUserConfigPath(), 'settings.json')
    const existing = loadJsonFile<ClaudePilotConfig>(userPath) || {}
    const merged = { ...existing, ...config }
    const success = saveJsonFile(userPath, merged)
    if (success) {
      this.invalidateCache()
    }
    return success
  }

  /**
   * Save project config
   */
  saveProjectConfig(config: Partial<ClaudePilotConfig>): boolean {
    if (!this.projectPath) {
      console.error('[ConfigResolver] No project path set')
      return false
    }
    const projectPath = getProjectConfigPath(this.projectPath)
    const existing = loadJsonFile<ClaudePilotConfig>(projectPath) || {}
    const merged = { ...existing, ...config }
    const success = saveJsonFile(projectPath, merged)
    if (success) {
      this.invalidateCache()
    }
    return success
  }

  /**
   * Get user config path
   */
  getUserConfigPath(): string {
    return join(getUserConfigPath(), 'settings.json')
  }

  /**
   * Get system config path
   */
  getSystemConfigPath(): string {
    return join(getSystemConfigPath(), 'policy.json')
  }

  /**
   * Get project config path
   */
  getProjectConfigPath(): string | null {
    if (!this.projectPath) return null
    return getProjectConfigPath(this.projectPath)
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let resolverInstance: ConfigResolver | null = null

export function getConfigResolver(): ConfigResolver {
  if (!resolverInstance) {
    resolverInstance = new ConfigResolver()
  }
  return resolverInstance
}

export function resolveConfig(forceRefresh = false): ResolvedConfig {
  return getConfigResolver().resolve(forceRefresh)
}

export function getConfigValue<T>(path: string): T | undefined {
  return getConfigResolver().get<T>(path)
}

export function isConfigLocked(path: string): boolean {
  return getConfigResolver().isLocked(path)
}

export function setProjectPath(path: string | null): void {
  getConfigResolver().setProjectPath(path)
}
