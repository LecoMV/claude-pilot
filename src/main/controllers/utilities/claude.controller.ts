/**
 * Claude Controller
 *
 * Type-safe tRPC controller for Claude Code operations.
 * Handles version checking and project listing.
 *
 * Migrated from handlers.ts (2 handlers):
 * - claude:version
 * - claude:projects
 *
 * @module claude.controller
 */

import { router, publicProcedure } from '../../trpc/trpc'
import { existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { spawnAsync } from '../../utils/spawn-async'
import type { ClaudeProject } from '../../../shared/types'

// ============================================================================
// Constants
// ============================================================================

const HOME = homedir()
const CLAUDE_DIR = join(HOME, '.claude')

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get Claude Code version
 */
async function getClaudeVersion(): Promise<string> {
  try {
    const result = await spawnAsync('claude', ['--version'], { timeout: 2000 })
    return result.trim()
  } catch {
    return 'unknown'
  }
}

/**
 * Get list of Claude projects
 */
function getClaudeProjects(): ClaudeProject[] {
  const projects: ClaudeProject[] = []
  const projectsDir = join(CLAUDE_DIR, 'projects')

  if (!existsSync(projectsDir)) {
    return projects
  }

  // Scan project directories
  const entries = readdirSync(projectsDir, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    const projectPath = join(projectsDir, entry.name)
    const decodedPath = entry.name.replace(/-/g, '/')

    // Count session files
    const sessionFiles = readdirSync(projectPath).filter((f) => f.endsWith('.jsonl'))

    // Check for CLAUDE.md
    const realPath = decodedPath.startsWith('/') ? decodedPath : join(HOME, decodedPath)
    const hasCLAUDEMD =
      existsSync(join(realPath, '.claude', 'CLAUDE.md')) || existsSync(join(realPath, 'CLAUDE.md'))

    // Check for Beads
    const hasBeads = existsSync(join(realPath, '.beads'))

    projects.push({
      path: realPath,
      name: realPath.split('/').pop() || entry.name,
      hasCLAUDEMD,
      hasBeads,
      sessionCount: sessionFiles.length,
    })
  }

  return projects
}

// ============================================================================
// Router
// ============================================================================

export const claudeRouter = router({
  /**
   * Get Claude Code version
   */
  version: publicProcedure.query((): Promise<string> => {
    return getClaudeVersion()
  }),

  /**
   * Get list of Claude projects
   */
  projects: publicProcedure.query((): ClaudeProject[] => {
    return getClaudeProjects()
  }),
})
