/**
 * Beads Controller - Issue/Work Tracking
 *
 * Type-safe tRPC controller for managing Beads work tracking.
 * Beads is a lightweight issue tracking system integrated with Claude Code.
 *
 * Migrated from handlers.ts (9 handlers):
 * - beads:list - list beads with optional filter
 * - beads:get - get single bead by ID
 * - beads:stats - get bead statistics
 * - beads:create - create new bead
 * - beads:update - update bead
 * - beads:close - close bead with optional reason
 * - beads:ready - get ready beads
 * - beads:blocked - get blocked beads
 * - beads:hasBeads - check if project has beads
 *
 * @module beads.controller
 */

import { z } from 'zod'
import { router, publicProcedure, auditedProcedure } from '../../trpc/trpc'
import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { Bead, BeadStats, BeadStatus, BeadType, BeadPriority } from '../../../shared/types'

const HOME = homedir()

// ============================================================================
// Schemas
// ============================================================================

const BeadIdSchema = z.object({
  id: z
    .string()
    .min(1, 'Bead ID cannot be empty')
    .regex(/^[a-zA-Z0-9._-]+$/, 'Invalid bead ID format'),
})

const BeadListFilterSchema = z.object({
  filter: z
    .object({
      status: z.enum(['open', 'in_progress', 'closed', 'all']).optional(),
      priority: z
        .union([
          z.literal(0),
          z.literal(1),
          z.literal(2),
          z.literal(3),
          z.literal(4),
          z.literal('all'),
        ])
        .optional(),
      type: z.enum(['task', 'bug', 'feature', 'epic', 'all']).optional(),
      search: z.string().optional(),
      limit: z.number().int().positive().optional(),
    })
    .optional(),
})

const BeadCreateSchema = z.object({
  params: z.object({
    title: z.string().min(1, 'Title cannot be empty').max(200, 'Title too long'),
    type: z.enum(['task', 'bug', 'feature', 'epic']),
    priority: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
    description: z.string().max(2000, 'Description too long').optional(),
    assignee: z
      .string()
      .regex(/^[a-zA-Z0-9._-]*$/, 'Invalid assignee format')
      .optional(),
  }),
})

const BeadUpdateSchema = z.object({
  id: z
    .string()
    .min(1, 'Bead ID cannot be empty')
    .regex(/^[a-zA-Z0-9._-]+$/, 'Invalid bead ID format'),
  params: z.object({
    status: z.enum(['open', 'in_progress', 'closed']).optional(),
    priority: z
      .union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
      .optional(),
    assignee: z
      .string()
      .regex(/^[a-zA-Z0-9._-]*$/, 'Invalid assignee format')
      .optional(),
    description: z.string().max(2000, 'Description too long').optional(),
  }),
})

const BeadCloseSchema = z.object({
  id: z
    .string()
    .min(1, 'Bead ID cannot be empty')
    .regex(/^[a-zA-Z0-9._-]+$/, 'Invalid bead ID format'),
  reason: z.string().max(500, 'Reason too long').optional(),
})

const ProjectPathSchema = z.object({
  projectPath: z.string().min(1, 'Project path cannot be empty'),
})

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Execute bd command safely
 */
function executeBdCommand(args: string[], cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const bdProcess = spawn('bd', args, {
      cwd: cwd || HOME,
      env: process.env,
      shell: false,
    })

    let stdout = ''
    let stderr = ''

    bdProcess.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    bdProcess.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    bdProcess.on('close', (code) => {
      if (code === 0) {
        resolve(stdout)
      } else {
        reject(new Error(stderr || `bd command failed with code ${code}`))
      }
    })

    bdProcess.on('error', (err) => {
      reject(err)
    })
  })
}

/**
 * Parse bd list output into Bead objects
 * Format: deploy-xxxx [P0] [type] status - title
 */
function parseBeadListOutput(output: string): Bead[] {
  const beads: Bead[] = []
  const lines = output.split('\n').filter((line) => line.trim())

  for (const line of lines) {
    // Match: deploy-xxxx [P0] [type] status - title
    const match = line.match(/^(\S+)\s+\[P(\d)\]\s+\[(\w+)\]\s+(\w+)\s+-\s+(.+)$/)
    if (match) {
      const [, id, priority, type, status, title] = match
      beads.push({
        id,
        title: title.trim(),
        status: status as BeadStatus,
        priority: parseInt(priority) as BeadPriority,
        type: type as BeadType,
        created: new Date().toISOString().split('T')[0],
        updated: new Date().toISOString().split('T')[0],
      })
    }
  }

  return beads
}

/**
 * Parse bd show output for a single bead
 */
function parseBeadShowOutput(output: string): Bead | null {
  const lines = output.split('\n').filter((line) => line.trim())
  if (lines.length === 0) return null

  // First line: id: title
  const titleMatch = lines[0].match(/^(\S+):\s+(.+)$/)
  if (!titleMatch) return null

  const [, id, title] = titleMatch

  // Parse remaining lines
  let status: BeadStatus = 'open'
  let priority: BeadPriority = 2
  let type: BeadType = 'task'
  let created = new Date().toISOString().split('T')[0]
  let updated = new Date().toISOString().split('T')[0]
  let description: string | undefined
  let assignee: string | undefined
  const blockedBy: string[] = []
  const blocks: string[] = []

  for (const line of lines.slice(1)) {
    if (line.startsWith('Status:')) {
      status = line.replace('Status:', '').trim() as BeadStatus
    } else if (line.startsWith('Priority:')) {
      const p = line.replace('Priority:', '').trim()
      priority = parseInt(p.replace('P', '')) as BeadPriority
    } else if (line.startsWith('Type:')) {
      type = line.replace('Type:', '').trim() as BeadType
    } else if (line.startsWith('Created:')) {
      created = line.replace('Created:', '').trim().split(' ')[0]
    } else if (line.startsWith('Updated:')) {
      updated = line.replace('Updated:', '').trim().split(' ')[0]
    } else if (line.startsWith('Description:')) {
      description = line.replace('Description:', '').trim()
    } else if (line.startsWith('Assignee:')) {
      assignee = line.replace('Assignee:', '').trim()
    } else if (line.startsWith('Blocked by:')) {
      const deps = line.replace('Blocked by:', '').trim()
      blockedBy.push(
        ...deps
          .split(',')
          .map((d) => d.trim())
          .filter(Boolean)
      )
    } else if (line.startsWith('Blocks:')) {
      const deps = line.replace('Blocks:', '').trim()
      blocks.push(
        ...deps
          .split(',')
          .map((d) => d.trim())
          .filter(Boolean)
      )
    }
  }

  return {
    id,
    title,
    status,
    priority,
    type,
    created,
    updated,
    description,
    assignee,
    blockedBy: blockedBy.length > 0 ? blockedBy : undefined,
    blocks: blocks.length > 0 ? blocks : undefined,
  }
}

/**
 * Parse bd stats output
 */
function parseBeadStatsOutput(output: string): BeadStats {
  const stats: BeadStats = {
    total: 0,
    open: 0,
    inProgress: 0,
    closed: 0,
    blocked: 0,
    ready: 0,
  }

  const lines = output.split('\n')
  for (const line of lines) {
    const match = line.match(/^([^:]+):\s*(\d+(?:\.\d+)?)\s*(\w*)/)
    if (match) {
      const [, key, value] = match
      const cleanKey = key.toLowerCase().trim()
      const numValue = parseFloat(value)

      if (cleanKey.includes('total')) stats.total = numValue
      else if (cleanKey.includes('open')) stats.open = numValue
      else if (cleanKey.includes('in progress')) stats.inProgress = numValue
      else if (cleanKey.includes('closed')) stats.closed = numValue
      else if (cleanKey.includes('blocked')) stats.blocked = numValue
      else if (cleanKey.includes('ready')) stats.ready = numValue
      else if (cleanKey.includes('avg lead')) stats.avgLeadTime = numValue
    }
  }

  return stats
}

// ============================================================================
// Router
// ============================================================================

export const beadsRouter = router({
  /**
   * List beads with optional filtering
   */
  list: publicProcedure.input(BeadListFilterSchema).query(async ({ input }): Promise<Bead[]> => {
    try {
      const args = ['list']
      const filter = input.filter

      // Add status filter
      if (filter?.status && filter.status !== 'all') {
        args.push(`--status=${filter.status}`)
      }

      const output = await executeBdCommand(args)
      let beads = parseBeadListOutput(output)

      // Apply additional filters client-side
      if (filter?.priority !== undefined && filter.priority !== 'all') {
        beads = beads.filter((b) => b.priority === filter.priority)
      }
      if (filter?.type && filter.type !== 'all') {
        beads = beads.filter((b) => b.type === filter.type)
      }
      if (filter?.search) {
        const search = filter.search.toLowerCase()
        beads = beads.filter(
          (b) => b.title.toLowerCase().includes(search) || b.id.toLowerCase().includes(search)
        )
      }
      if (filter?.limit) {
        beads = beads.slice(0, filter.limit)
      }

      return beads
    } catch (error) {
      console.error('Failed to list beads:', error)
      return []
    }
  }),

  /**
   * Get a single bead by ID
   */
  get: publicProcedure.input(BeadIdSchema).query(async ({ input }): Promise<Bead | null> => {
    try {
      // ID already sanitized by schema
      const output = await executeBdCommand(['show', input.id])
      return parseBeadShowOutput(output)
    } catch (error) {
      console.error('Failed to get bead:', error)
      return null
    }
  }),

  /**
   * Get bead statistics
   */
  stats: publicProcedure.query(async (): Promise<BeadStats> => {
    try {
      const output = await executeBdCommand(['stats'])
      return parseBeadStatsOutput(output)
    } catch (error) {
      console.error('Failed to get beads stats:', error)
      return {
        total: 0,
        open: 0,
        inProgress: 0,
        closed: 0,
        blocked: 0,
        ready: 0,
      }
    }
  }),

  /**
   * Create a new bead
   */
  create: auditedProcedure
    .input(BeadCreateSchema)
    .mutation(async ({ input }): Promise<Bead | null> => {
      try {
        const args = ['create']
        const params = input.params

        // Sanitize and add parameters
        args.push(`--title="${params.title.replace(/"/g, '\\"')}"`)
        args.push(`--type=${params.type}`)
        args.push(`--priority=${params.priority}`)

        if (params.description) {
          args.push(`--description="${params.description.replace(/"/g, '\\"')}"`)
        }
        if (params.assignee) {
          args.push(`--assignee=${params.assignee}`)
        }

        const output = await executeBdCommand(args)

        // Parse created bead id from output
        const idMatch = output.match(/Created:\s*(\S+)/)
        if (idMatch) {
          const showOutput = await executeBdCommand(['show', idMatch[1]])
          return parseBeadShowOutput(showOutput)
        }

        return null
      } catch (error) {
        console.error('Failed to create bead:', error)
        return null
      }
    }),

  /**
   * Update an existing bead
   */
  update: auditedProcedure.input(BeadUpdateSchema).mutation(async ({ input }): Promise<boolean> => {
    try {
      const args = ['update', input.id]
      const params = input.params

      if (params.status) {
        args.push(`--status=${params.status}`)
      }
      if (params.priority !== undefined) {
        args.push(`--priority=${params.priority}`)
      }
      if (params.assignee) {
        args.push(`--assignee=${params.assignee}`)
      }

      await executeBdCommand(args)
      return true
    } catch (error) {
      console.error('Failed to update bead:', error)
      return false
    }
  }),

  /**
   * Close a bead with optional reason
   */
  close: auditedProcedure.input(BeadCloseSchema).mutation(async ({ input }): Promise<boolean> => {
    try {
      const args = ['close', input.id]

      if (input.reason) {
        args.push(`--reason="${input.reason.replace(/"/g, '\\"')}"`)
      }

      await executeBdCommand(args)
      return true
    } catch (error) {
      console.error('Failed to close bead:', error)
      return false
    }
  }),

  /**
   * Get ready beads (not blocked, ready to work on)
   */
  ready: publicProcedure.query(async (): Promise<Bead[]> => {
    try {
      const output = await executeBdCommand(['ready'])
      return parseBeadListOutput(output)
    } catch (error) {
      console.error('Failed to get ready beads:', error)
      return []
    }
  }),

  /**
   * Get blocked beads
   */
  blocked: publicProcedure.query(async (): Promise<Bead[]> => {
    try {
      const output = await executeBdCommand(['blocked'])
      return parseBeadListOutput(output)
    } catch (error) {
      console.error('Failed to get blocked beads:', error)
      return []
    }
  }),

  /**
   * Check if a project has beads initialized
   */
  hasBeads: publicProcedure.input(ProjectPathSchema).query(({ input }): boolean => {
    try {
      // Check if .beads directory exists in project
      const beadsPath = join(input.projectPath, '.beads')
      return existsSync(beadsPath)
    } catch {
      return false
    }
  }),
})

export type BeadsRouter = typeof beadsRouter
