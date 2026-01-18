/**
 * Plans Controller
 *
 * Type-safe tRPC controller for autonomous plan management.
 * Handles plan creation, execution, pausing, resuming, and cancellation.
 *
 * Migrated from handlers.ts (10 handlers):
 * - plans:list
 * - plans:get
 * - plans:create
 * - plans:update
 * - plans:delete
 * - plans:execute
 * - plans:pause
 * - plans:resume
 * - plans:cancel
 * - plans:stats
 *
 * @module plans.controller
 */

import { z } from 'zod'
import { router, publicProcedure, auditedProcedure } from '../../trpc/trpc'
import { planService } from '../../services/plans'
import type { Plan, PlanCreateParams, PlanExecutionStats } from '@shared/types'

// ============================================================================
// Schemas
// ============================================================================

const PlanIdSchema = z.object({
  id: z.string().min(1, 'Plan ID cannot be empty'),
})

const ProjectPathFilterSchema = z
  .object({
    projectPath: z.string().optional(),
  })
  .optional()

const PlanStepSchema = z.object({
  name: z.string().min(1, 'Step name cannot be empty'),
  description: z.string(),
  type: z.enum(['code', 'shell', 'research', 'review', 'test', 'manual']),
  command: z.string().optional(),
  estimatedDuration: z.number().optional(),
  dependencies: z.array(z.string()).optional(),
})

const PlanCreateSchema = z.object({
  title: z.string().min(1, 'Title cannot be empty').max(200, 'Title too long'),
  description: z.string().max(2000, 'Description too long'),
  projectPath: z.string().min(1, 'Project path cannot be empty'),
  steps: z.array(PlanStepSchema).min(1, 'At least one step required'),
})

// For update, we use a more permissive schema since Partial<Plan> can include
// existing steps with id, status, order fields
const PlanUpdateSchema = z.object({
  id: z.string().min(1, 'Plan ID cannot be empty'),
  updates: z.record(z.unknown()),
})

// ============================================================================
// Router
// ============================================================================

export const plansRouter = router({
  /**
   * List all plans, optionally filtered by project path
   */
  list: publicProcedure.input(ProjectPathFilterSchema).query(({ input }): Plan[] => {
    return planService.list(input?.projectPath)
  }),

  /**
   * Get a specific plan by ID
   */
  get: publicProcedure.input(PlanIdSchema).query(({ input }): Plan | null => {
    return planService.get(input.id)
  }),

  /**
   * Create a new plan
   */
  create: auditedProcedure.input(PlanCreateSchema).mutation(({ input }): Plan => {
    return planService.create(input as PlanCreateParams)
  }),

  /**
   * Update an existing plan
   */
  update: auditedProcedure.input(PlanUpdateSchema).mutation(({ input }): boolean => {
    return planService.update(input.id, input.updates as Partial<Plan>)
  }),

  /**
   * Delete a plan
   */
  delete: auditedProcedure.input(PlanIdSchema).mutation(({ input }): boolean => {
    return planService.delete(input.id)
  }),

  /**
   * Start executing a plan
   */
  execute: auditedProcedure.input(PlanIdSchema).mutation(({ input }): boolean => {
    return planService.execute(input.id)
  }),

  /**
   * Pause a running plan
   */
  pause: auditedProcedure.input(PlanIdSchema).mutation(({ input }): boolean => {
    return planService.pause(input.id)
  }),

  /**
   * Resume a paused plan
   */
  resume: auditedProcedure.input(PlanIdSchema).mutation(({ input }): boolean => {
    return planService.resume(input.id)
  }),

  /**
   * Cancel a running or paused plan
   */
  cancel: auditedProcedure.input(PlanIdSchema).mutation(({ input }): boolean => {
    return planService.cancel(input.id)
  }),

  /**
   * Get plan execution statistics
   */
  stats: publicProcedure.query((): PlanExecutionStats => {
    return planService.getStats()
  }),

  /**
   * Mark a step as completed (for manual steps)
   */
  stepComplete: auditedProcedure
    .input(
      z.object({
        planId: z.string().min(1, 'Plan ID cannot be empty'),
        stepId: z.string().min(1, 'Step ID cannot be empty'),
        output: z.string().optional(),
      })
    )
    .mutation(({ input }): boolean => {
      return planService.stepComplete(input.planId, input.stepId, input.output)
    }),
})
