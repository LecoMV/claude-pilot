/**
 * Branches Controller
 *
 * Type-safe tRPC controller for conversation branching.
 * Provides Git-like branching functionality for conversation sessions.
 *
 * Migrated from handlers.ts (10 handlers):
 * - branches:list
 * - branches:get
 * - branches:getTree
 * - branches:delete
 * - branches:rename
 * - branches:switch
 * - branches:merge
 * - branches:abandon
 * - branches:stats
 * - branches:getActiveBranch
 *
 * @module branches.controller
 */

import { z } from 'zod'
import { router, publicProcedure, auditedProcedure } from '../../trpc/trpc'
import { branchService } from '../../services/branches'
import type { ConversationBranch, BranchTree, BranchStats } from '@shared/types'

// ============================================================================
// Schemas
// ============================================================================

const SessionIdSchema = z.object({
  sessionId: z.string().min(1, 'Session ID cannot be empty'),
})

const BranchIdSchema = z.object({
  branchId: z.string().min(1, 'Branch ID cannot be empty'),
})

const RenameSchema = z.object({
  branchId: z.string().min(1, 'Branch ID cannot be empty'),
  name: z.string().min(1, 'Name cannot be empty').max(100, 'Name too long'),
})

const MergeSchema = z.object({
  sourceBranchId: z.string().min(1, 'Source branch ID cannot be empty'),
  targetBranchId: z.string().min(1, 'Target branch ID cannot be empty'),
  strategy: z.enum(['replace', 'append', 'cherry-pick']),
  messageIds: z.array(z.string()).optional(),
})

const StatsFilterSchema = z
  .object({
    sessionId: z.string().optional(),
  })
  .optional()

// ============================================================================
// Router
// ============================================================================

export const branchesRouter = router({
  /**
   * List all branches for a session
   */
  list: publicProcedure.input(SessionIdSchema).query(({ input }): Promise<ConversationBranch[]> => {
    return branchService.list(input.sessionId)
  }),

  /**
   * Get a specific branch by ID
   */
  get: publicProcedure
    .input(BranchIdSchema)
    .query(({ input }): Promise<ConversationBranch | null> => {
      return branchService.get(input.branchId)
    }),

  /**
   * Get the branch tree for visualization
   */
  getTree: publicProcedure.input(SessionIdSchema).query(({ input }): Promise<BranchTree | null> => {
    return branchService.getTree(input.sessionId)
  }),

  /**
   * Delete a branch (cannot delete main branch)
   */
  delete: auditedProcedure.input(BranchIdSchema).mutation(({ input }): Promise<boolean> => {
    return branchService.delete(input.branchId)
  }),

  /**
   * Rename a branch
   */
  rename: auditedProcedure.input(RenameSchema).mutation(({ input }): Promise<boolean> => {
    return branchService.rename(input.branchId, input.name)
  }),

  /**
   * Switch to a different branch
   */
  switch: auditedProcedure.input(BranchIdSchema).mutation(({ input }): Promise<boolean> => {
    return branchService.switch(input.branchId)
  }),

  /**
   * Merge branches
   */
  merge: auditedProcedure.input(MergeSchema).mutation(({ input }): Promise<boolean> => {
    return branchService.merge(input)
  }),

  /**
   * Abandon a branch (cannot abandon main branch)
   */
  abandon: auditedProcedure.input(BranchIdSchema).mutation(({ input }): Promise<boolean> => {
    return branchService.abandon(input.branchId)
  }),

  /**
   * Get branch statistics
   */
  stats: publicProcedure.input(StatsFilterSchema).query(({ input }): Promise<BranchStats> => {
    return branchService.stats(input?.sessionId)
  }),

  /**
   * Get the active branch for a session
   */
  getActiveBranch: publicProcedure
    .input(SessionIdSchema)
    .query(({ input }): Promise<string | null> => {
      return branchService.getActiveBranch(input.sessionId)
    }),
})
