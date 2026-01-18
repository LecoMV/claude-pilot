/**
 * Claude Controller
 *
 * Type-safe tRPC controller for Claude Code operations.
 * Handles version checking, binary resolution, and project listing.
 *
 * Features:
 * - Robust binary resolution (PATH, standard locations, user config)
 * - Configurable projects directory
 * - Smart project path decoding (not just replace dashes)
 * - Async I/O operations
 *
 * @module claude.controller
 */

import { router, publicProcedure } from '../../trpc/trpc'
import { promises as fs } from 'fs'
import { existsSync, readdirSync, readFileSync } from 'fs'
import { join, basename } from 'path'
import { homedir } from 'os'
import { spawnAsync } from '../../utils/spawn-async'
import type { ClaudeProject, ClaudeCodeStatus, ClaudePathSettings } from '../../../shared/types'

// ============================================================================
// Constants
// ============================================================================

const HOME = homedir()
const CLAUDE_DIR = join(HOME, '.claude')
const DEFAULT_PROJECTS_DIR = join(CLAUDE_DIR, 'projects')
const SETTINGS_PATH = join(HOME, '.config', 'claude-pilot', 'settings.json')

// Standard locations to search for Claude Code binary
const BINARY_SEARCH_PATHS = [
  join(HOME, '.local', 'bin', 'claude'),
  join(HOME, '.npm-global', 'bin', 'claude'),
  '/usr/local/bin/claude',
  '/usr/bin/claude',
  '/opt/homebrew/bin/claude', // macOS Homebrew
  join(HOME, '.nvm', 'current', 'bin', 'claude'), // NVM
  join(HOME, '.volta', 'bin', 'claude'), // Volta
]

// ============================================================================
// Settings Helper
// ============================================================================

/**
 * Get Claude path settings from app settings
 */
function getClaudeSettings(): ClaudePathSettings {
  try {
    if (existsSync(SETTINGS_PATH)) {
      const content = readFileSync(SETTINGS_PATH, 'utf-8')
      const settings = JSON.parse(content)
      return settings.claude || {}
    }
  } catch {
    // Ignore errors, return defaults
  }
  return {}
}

// ============================================================================
// Binary Resolution
// ============================================================================

/**
 * Resolve the Claude Code binary path
 *
 * Search order:
 * 1. User-configured path (from settings)
 * 2. PATH environment variable (using `which`)
 * 3. Standard installation locations
 *
 * @returns Path to claude binary or null if not found
 */
async function resolveClaudeBinary(): Promise<string | null> {
  const settings = getClaudeSettings()

  // 1. Check user-configured path first
  if (settings.binaryPath) {
    try {
      await fs.access(settings.binaryPath, fs.constants.X_OK)
      return settings.binaryPath
    } catch {
      console.warn(`[Claude] Configured binary path not executable: ${settings.binaryPath}`)
    }
  }

  // 2. Check PATH using `which` command
  try {
    const result = await spawnAsync('which', ['claude'], { timeout: 2000 })
    const path = result.trim()
    if (path && existsSync(path)) {
      return path
    }
  } catch {
    // `which` failed, continue to standard locations
  }

  // 3. Check standard installation locations
  for (const binaryPath of BINARY_SEARCH_PATHS) {
    try {
      await fs.access(binaryPath, fs.constants.X_OK)
      return binaryPath
    } catch {
      // Continue to next location
    }
  }

  return null
}

/**
 * Get Claude Code version from the resolved binary
 */
async function getClaudeVersion(binaryPath: string | null): Promise<string> {
  if (!binaryPath) {
    return 'not installed'
  }

  try {
    const result = await spawnAsync(binaryPath, ['--version'], { timeout: 5000 })
    return result.trim()
  } catch (error) {
    console.error('[Claude] Failed to get version:', error)
    return 'unknown'
  }
}

// ============================================================================
// Projects Directory
// ============================================================================

/**
 * Get the projects directory path
 * Uses user-configured path or defaults to ~/.claude/projects
 */
function getProjectsDir(): string {
  const settings = getClaudeSettings()
  return settings.projectsPath || DEFAULT_PROJECTS_DIR
}

/**
 * Decode a Claude project directory name to its original path
 *
 * Claude Code encodes project paths in directory names. This function
 * attempts to decode them back to the original path.
 *
 * Strategy:
 * 1. Check for project_config.json or sessions-index.json for stored path
 * 2. Read a session file to extract the cwd
 * 3. Fallback: Smart dash replacement (less aggressive than replace all)
 *
 * @param dirName Encoded directory name
 * @param projectPath Full path to the project directory
 * @returns Decoded original path
 */
function decodeProjectPath(dirName: string, projectPath: string): string {
  // Strategy 1: Check for project_config.json
  const configPath = join(projectPath, 'project_config.json')
  if (existsSync(configPath)) {
    try {
      const config = JSON.parse(readFileSync(configPath, 'utf-8'))
      if (config.path || config.projectPath) {
        return config.path || config.projectPath
      }
    } catch {
      // Continue to next strategy
    }
  }

  // Strategy 2: Check sessions-index.json
  const indexPath = join(projectPath, 'sessions-index.json')
  if (existsSync(indexPath)) {
    try {
      const index = JSON.parse(readFileSync(indexPath, 'utf-8'))
      if (index.projectPath) {
        return index.projectPath
      }
    } catch {
      // Continue to next strategy
    }
  }

  // Strategy 3: Read the first session file to extract cwd
  try {
    const sessionFiles = readdirSync(projectPath).filter((f) => f.endsWith('.jsonl'))
    if (sessionFiles.length > 0) {
      const sessionPath = join(projectPath, sessionFiles[0])
      const firstLine = readFileSync(sessionPath, 'utf-8').split('\n')[0]
      if (firstLine) {
        const parsed = JSON.parse(firstLine)
        if (parsed.cwd) {
          return parsed.cwd
        }
      }
    }
  } catch {
    // Continue to fallback
  }

  // Strategy 4: Smart dash replacement
  // Only replace dashes that look like path separators (between known path segments)
  // Check if it starts with a drive letter or common path prefix
  if (dirName.startsWith('-')) {
    // Absolute path encoded - replace first dash with /
    const decoded = '/' + dirName.substring(1).replace(/-/g, '/')
    // Verify the path exists
    if (existsSync(decoded)) {
      return decoded
    }
  }

  // Home-relative path
  const homeDecoded = join(HOME, dirName.replace(/-/g, '/'))
  if (existsSync(homeDecoded)) {
    return homeDecoded
  }

  // Last resort: simple replacement (may not be accurate)
  const simpleDecoded = dirName.replace(/-/g, '/')
  if (simpleDecoded.startsWith('/') && existsSync(simpleDecoded)) {
    return simpleDecoded
  }

  // Return the simple decoded path even if it doesn't exist
  // (project may have been deleted/moved)
  return simpleDecoded.startsWith('/') ? simpleDecoded : join(HOME, simpleDecoded)
}

/**
 * Get list of Claude projects (synchronous since we use sync fs operations)
 */
function getClaudeProjects(): ClaudeProject[] {
  const projects: ClaudeProject[] = []
  const projectsDir = getProjectsDir()

  if (!existsSync(projectsDir)) {
    return projects
  }

  // Scan project directories
  const entries = readdirSync(projectsDir, { withFileTypes: true })

  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    const projectPath = join(projectsDir, entry.name)

    // Decode the project path
    const decodedPath = decodeProjectPath(entry.name, projectPath)

    // Count session files
    let sessionCount = 0
    try {
      const files = readdirSync(projectPath)
      sessionCount = files.filter((f) => f.endsWith('.jsonl')).length
    } catch {
      // Directory might not be readable
    }

    // Check for CLAUDE.md in the actual project directory
    let hasCLAUDEMD = false
    if (existsSync(decodedPath)) {
      hasCLAUDEMD =
        existsSync(join(decodedPath, '.claude', 'CLAUDE.md')) ||
        existsSync(join(decodedPath, 'CLAUDE.md'))
    }

    // Check for Beads
    const hasBeads = existsSync(decodedPath) && existsSync(join(decodedPath, '.beads'))

    projects.push({
      path: decodedPath,
      name: basename(decodedPath) || entry.name,
      hasCLAUDEMD,
      hasBeads,
      sessionCount,
    })
  }

  return projects
}

/**
 * Get comprehensive Claude Code status
 */
async function getClaudeStatus(): Promise<ClaudeCodeStatus> {
  const binaryPath = await resolveClaudeBinary()
  const version = await getClaudeVersion(binaryPath)
  const projectsDir = getProjectsDir()

  let projectCount = 0
  if (existsSync(projectsDir)) {
    try {
      const entries = readdirSync(projectsDir, { withFileTypes: true })
      projectCount = entries.filter((e) => e.isDirectory()).length
    } catch {
      // Ignore errors
    }
  }

  return {
    installed: binaryPath !== null,
    version: binaryPath ? version : undefined,
    binaryPath: binaryPath || undefined,
    projectsPath: projectsDir,
    projectCount,
    error: !binaryPath ? 'Claude Code binary not found' : undefined,
  }
}

// ============================================================================
// Router
// ============================================================================

export const claudeRouter = router({
  /**
   * Get Claude Code version
   */
  version: publicProcedure.query(async (): Promise<string> => {
    const binaryPath = await resolveClaudeBinary()
    return getClaudeVersion(binaryPath)
  }),

  /**
   * Get list of Claude projects
   */
  projects: publicProcedure.query((): ClaudeProject[] => {
    return getClaudeProjects()
  }),

  /**
   * Get comprehensive Claude Code status
   * Includes binary path, version, projects directory, and project count
   */
  status: publicProcedure.query((): Promise<ClaudeCodeStatus> => {
    return getClaudeStatus()
  }),

  /**
   * Test if a specific binary path is valid
   */
  testBinary: publicProcedure
    .input((val: unknown) => {
      if (typeof val !== 'string') throw new Error('path must be a string')
      return val
    })
    .query(async (opts): Promise<{ valid: boolean; version?: string; error?: string }> => {
      const path = opts.input
      try {
        await fs.access(path, fs.constants.X_OK)
        const result = await spawnAsync(path, ['--version'], { timeout: 5000 })
        return { valid: true, version: result.trim() }
      } catch (error) {
        return {
          valid: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        }
      }
    }),

  /**
   * Test if a specific projects path is valid
   */
  testProjectsPath: publicProcedure
    .input((val: unknown) => {
      if (typeof val !== 'string') throw new Error('path must be a string')
      return val
    })
    .query(async (opts): Promise<{ valid: boolean; projectCount?: number; error?: string }> => {
      const path = opts.input
      try {
        const stat = await fs.stat(path)
        if (!stat.isDirectory()) {
          return { valid: false, error: 'Path is not a directory' }
        }
        const entries = await fs.readdir(path, { withFileTypes: true })
        const projectCount = entries.filter((e) => e.isDirectory()).length
        return { valid: true, projectCount }
      } catch (error) {
        return {
          valid: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        }
      }
    }),
})
