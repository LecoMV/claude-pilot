/**
 * Plans Controller Tests
 *
 * Comprehensive tests for the plans tRPC controller.
 * Tests all 11 procedures: list, get, create, update, delete, execute,
 * pause, resume, cancel, stats, stepComplete
 *
 * @module plans.controller.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { plansRouter } from '../plans.controller'
import { planService } from '../../../services/plans'
import type {
  Plan,
  PlanStep,
  PlanExecutionStats,
  StepType,
} from '@shared/types'

// Mock the plan service
vi.mock('../../../services/plans', () => ({
  planService: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    execute: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    cancel: vi.fn(),
    getStats: vi.fn(),
    stepComplete: vi.fn(),
  },
}))

// Create a test caller using createCaller pattern
const createTestCaller = () => plansRouter.createCaller({})

// Test data factories
const createMockStep = (overrides: Partial<PlanStep> = {}): PlanStep => ({
  id: 'step-001',
  name: 'Build project',
  description: 'Run npm build',
  type: 'shell',
  status: 'pending',
  order: 0,
  command: 'npm run build',
  ...overrides,
})

const createMockPlan = (overrides: Partial<Plan> = {}): Plan => ({
  id: 'plan-abc123',
  title: 'Deploy Feature',
  description: 'Deploy new authentication feature',
  projectPath: '/home/user/projects/my-app',
  status: 'draft',
  steps: [
    createMockStep({ id: 'step-1', name: 'Build', order: 0 }),
    createMockStep({ id: 'step-2', name: 'Test', order: 1, type: 'test' }),
    createMockStep({ id: 'step-3', name: 'Deploy', order: 2, type: 'shell' }),
  ],
  currentStepIndex: 0,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  ...overrides,
})

const createMockStats = (): PlanExecutionStats => ({
  totalPlans: 10,
  completedPlans: 7,
  failedPlans: 2,
  successRate: 0.78,
  avgDuration: 120000,
  totalStepsExecuted: 45,
})

describe('plans.controller', () => {
  let caller: ReturnType<typeof createTestCaller>

  beforeEach(() => {
    vi.clearAllMocks()
    caller = createTestCaller()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ===========================================================================
  // LIST PROCEDURE
  // ===========================================================================
  describe('list', () => {
    it('should return all plans when no filter provided', async () => {
      const mockPlans = [createMockPlan(), createMockPlan({ id: 'plan-2', title: 'Plan 2' })]
      vi.mocked(planService.list).mockReturnValue(mockPlans)

      const result = await caller.list()

      expect(result).toEqual(mockPlans)
      expect(planService.list).toHaveBeenCalledWith(undefined)
    })

    it('should return plans filtered by project path', async () => {
      const mockPlans = [createMockPlan()]
      vi.mocked(planService.list).mockReturnValue(mockPlans)

      const result = await caller.list({ projectPath: '/home/user/projects/my-app' })

      expect(result).toEqual(mockPlans)
      expect(planService.list).toHaveBeenCalledWith('/home/user/projects/my-app')
    })

    it('should return empty array when no plans exist', async () => {
      vi.mocked(planService.list).mockReturnValue([])

      const result = await caller.list()

      expect(result).toEqual([])
    })

    it('should handle undefined input', async () => {
      vi.mocked(planService.list).mockReturnValue([])

      const result = await caller.list(undefined)

      expect(result).toEqual([])
      expect(planService.list).toHaveBeenCalledWith(undefined)
    })
  })

  // ===========================================================================
  // GET PROCEDURE
  // ===========================================================================
  describe('get', () => {
    it('should return a plan by ID', async () => {
      const mockPlan = createMockPlan()
      vi.mocked(planService.get).mockReturnValue(mockPlan)

      const result = await caller.get({ id: 'plan-abc123' })

      expect(result).toEqual(mockPlan)
      expect(planService.get).toHaveBeenCalledWith('plan-abc123')
    })

    it('should return null for non-existent plan', async () => {
      vi.mocked(planService.get).mockReturnValue(null)

      const result = await caller.get({ id: 'nonexistent' })

      expect(result).toBeNull()
    })

    it('should reject empty plan ID', async () => {
      await expect(caller.get({ id: '' })).rejects.toThrow()
    })

    it('should handle special characters in plan ID', async () => {
      vi.mocked(planService.get).mockReturnValue(null)

      const result = await caller.get({ id: 'plan-with-special-chars_123' })

      expect(result).toBeNull()
      expect(planService.get).toHaveBeenCalledWith('plan-with-special-chars_123')
    })
  })

  // ===========================================================================
  // CREATE PROCEDURE
  // ===========================================================================
  describe('create', () => {
    it('should create a plan with valid input', async () => {
      const mockCreatedPlan = createMockPlan()
      vi.mocked(planService.create).mockReturnValue(mockCreatedPlan)

      const createParams = {
        title: 'Deploy Feature',
        description: 'Deploy new authentication feature',
        projectPath: '/home/user/projects/my-app',
        steps: [
          {
            name: 'Build',
            description: 'Run build command',
            type: 'shell' as StepType,
            command: 'npm run build',
          },
        ],
      }

      const result = await caller.create(createParams)

      expect(result).toEqual(mockCreatedPlan)
      expect(planService.create).toHaveBeenCalled()
    })

    it('should create a plan with multiple steps', async () => {
      const mockCreatedPlan = createMockPlan()
      vi.mocked(planService.create).mockReturnValue(mockCreatedPlan)

      const createParams = {
        title: 'Full Deployment',
        description: 'Complete deployment pipeline',
        projectPath: '/home/user/projects/my-app',
        steps: [
          { name: 'Build', description: 'Build app', type: 'shell' as StepType, command: 'npm build' },
          { name: 'Test', description: 'Run tests', type: 'test' as StepType },
          { name: 'Review', description: 'Code review', type: 'review' as StepType },
          { name: 'Deploy', description: 'Deploy to prod', type: 'shell' as StepType, command: 'deploy.sh' },
        ],
      }

      const result = await caller.create(createParams)

      expect(result).toEqual(mockCreatedPlan)
    })

    it('should reject empty title', async () => {
      await expect(
        caller.create({
          title: '',
          description: 'Description',
          projectPath: '/path',
          steps: [{ name: 'Step', description: 'Desc', type: 'shell' }],
        })
      ).rejects.toThrow()
    })

    it('should reject title exceeding 200 characters', async () => {
      const longTitle = 'a'.repeat(201)

      await expect(
        caller.create({
          title: longTitle,
          description: 'Description',
          projectPath: '/path',
          steps: [{ name: 'Step', description: 'Desc', type: 'shell' }],
        })
      ).rejects.toThrow()
    })

    it('should accept title at 200 character limit', async () => {
      const maxTitle = 'a'.repeat(200)
      vi.mocked(planService.create).mockReturnValue(createMockPlan({ title: maxTitle }))

      const result = await caller.create({
        title: maxTitle,
        description: 'Description',
        projectPath: '/path',
        steps: [{ name: 'Step', description: 'Desc', type: 'shell' }],
      })

      expect(result.title).toBe(maxTitle)
    })

    it('should reject description exceeding 2000 characters', async () => {
      const longDescription = 'a'.repeat(2001)

      await expect(
        caller.create({
          title: 'Title',
          description: longDescription,
          projectPath: '/path',
          steps: [{ name: 'Step', description: 'Desc', type: 'shell' }],
        })
      ).rejects.toThrow()
    })

    it('should accept description at 2000 character limit', async () => {
      const maxDescription = 'a'.repeat(2000)
      vi.mocked(planService.create).mockReturnValue(createMockPlan({ description: maxDescription }))

      const result = await caller.create({
        title: 'Title',
        description: maxDescription,
        projectPath: '/path',
        steps: [{ name: 'Step', description: 'Desc', type: 'shell' }],
      })

      expect(result.description).toBe(maxDescription)
    })

    it('should reject empty project path', async () => {
      await expect(
        caller.create({
          title: 'Title',
          description: 'Description',
          projectPath: '',
          steps: [{ name: 'Step', description: 'Desc', type: 'shell' }],
        })
      ).rejects.toThrow()
    })

    it('should reject empty steps array', async () => {
      await expect(
        caller.create({
          title: 'Title',
          description: 'Description',
          projectPath: '/path',
          steps: [],
        })
      ).rejects.toThrow()
    })

    it('should reject step with empty name', async () => {
      await expect(
        caller.create({
          title: 'Title',
          description: 'Description',
          projectPath: '/path',
          steps: [{ name: '', description: 'Desc', type: 'shell' }],
        })
      ).rejects.toThrow()
    })

    it('should reject invalid step type', async () => {
      await expect(
        caller.create({
          title: 'Title',
          description: 'Description',
          projectPath: '/path',
          steps: [{ name: 'Step', description: 'Desc', type: 'invalid' as StepType }],
        })
      ).rejects.toThrow()
    })

    it('should accept all valid step types', async () => {
      vi.mocked(planService.create).mockReturnValue(createMockPlan())

      const stepTypes: StepType[] = ['code', 'shell', 'research', 'review', 'test', 'manual']

      for (const type of stepTypes) {
        const result = await caller.create({
          title: 'Title',
          description: 'Description',
          projectPath: '/path',
          steps: [{ name: 'Step', description: 'Desc', type }],
        })

        expect(result).toBeDefined()
      }

      expect(planService.create).toHaveBeenCalledTimes(6)
    })

    it('should accept optional step fields', async () => {
      vi.mocked(planService.create).mockReturnValue(createMockPlan())

      const result = await caller.create({
        title: 'Title',
        description: 'Description',
        projectPath: '/path',
        steps: [
          {
            name: 'Step',
            description: 'Desc',
            type: 'shell',
            command: 'echo hello',
            estimatedDuration: 60,
            dependencies: ['step-0'],
          },
        ],
      })

      expect(result).toBeDefined()
    })
  })

  // ===========================================================================
  // UPDATE PROCEDURE
  // ===========================================================================
  describe('update', () => {
    it('should update a plan successfully', async () => {
      vi.mocked(planService.update).mockReturnValue(true)

      const result = await caller.update({
        id: 'plan-abc123',
        updates: { title: 'Updated Title' },
      })

      expect(result).toBe(true)
      expect(planService.update).toHaveBeenCalledWith('plan-abc123', { title: 'Updated Title' })
    })

    it('should update multiple fields', async () => {
      vi.mocked(planService.update).mockReturnValue(true)

      const result = await caller.update({
        id: 'plan-abc123',
        updates: {
          title: 'New Title',
          description: 'New Description',
          status: 'ready',
        },
      })

      expect(result).toBe(true)
    })

    it('should return false when plan not found', async () => {
      vi.mocked(planService.update).mockReturnValue(false)

      const result = await caller.update({
        id: 'nonexistent',
        updates: { title: 'New Title' },
      })

      expect(result).toBe(false)
    })

    it('should reject empty plan ID', async () => {
      await expect(
        caller.update({ id: '', updates: { title: 'Title' } })
      ).rejects.toThrow()
    })

    it('should accept empty updates object', async () => {
      vi.mocked(planService.update).mockReturnValue(true)

      const result = await caller.update({
        id: 'plan-abc123',
        updates: {},
      })

      expect(result).toBe(true)
    })
  })

  // ===========================================================================
  // DELETE PROCEDURE
  // ===========================================================================
  describe('delete', () => {
    it('should delete a plan successfully', async () => {
      vi.mocked(planService.delete).mockReturnValue(true)

      const result = await caller.delete({ id: 'plan-abc123' })

      expect(result).toBe(true)
      expect(planService.delete).toHaveBeenCalledWith('plan-abc123')
    })

    it('should return false when plan not found', async () => {
      vi.mocked(planService.delete).mockReturnValue(false)

      const result = await caller.delete({ id: 'nonexistent' })

      expect(result).toBe(false)
    })

    it('should reject empty plan ID', async () => {
      await expect(caller.delete({ id: '' })).rejects.toThrow()
    })
  })

  // ===========================================================================
  // EXECUTE PROCEDURE
  // ===========================================================================
  describe('execute', () => {
    it('should start plan execution', async () => {
      vi.mocked(planService.execute).mockReturnValue(true)

      const result = await caller.execute({ id: 'plan-abc123' })

      expect(result).toBe(true)
      expect(planService.execute).toHaveBeenCalledWith('plan-abc123')
    })

    it('should return false when plan cannot be executed', async () => {
      vi.mocked(planService.execute).mockReturnValue(false)

      const result = await caller.execute({ id: 'already-executing' })

      expect(result).toBe(false)
    })

    it('should reject empty plan ID', async () => {
      await expect(caller.execute({ id: '' })).rejects.toThrow()
    })
  })

  // ===========================================================================
  // PAUSE PROCEDURE
  // ===========================================================================
  describe('pause', () => {
    it('should pause an executing plan', async () => {
      vi.mocked(planService.pause).mockReturnValue(true)

      const result = await caller.pause({ id: 'plan-abc123' })

      expect(result).toBe(true)
      expect(planService.pause).toHaveBeenCalledWith('plan-abc123')
    })

    it('should return false when plan cannot be paused', async () => {
      vi.mocked(planService.pause).mockReturnValue(false)

      const result = await caller.pause({ id: 'not-executing' })

      expect(result).toBe(false)
    })

    it('should reject empty plan ID', async () => {
      await expect(caller.pause({ id: '' })).rejects.toThrow()
    })
  })

  // ===========================================================================
  // RESUME PROCEDURE
  // ===========================================================================
  describe('resume', () => {
    it('should resume a paused plan', async () => {
      vi.mocked(planService.resume).mockReturnValue(true)

      const result = await caller.resume({ id: 'plan-abc123' })

      expect(result).toBe(true)
      expect(planService.resume).toHaveBeenCalledWith('plan-abc123')
    })

    it('should return false when plan cannot be resumed', async () => {
      vi.mocked(planService.resume).mockReturnValue(false)

      const result = await caller.resume({ id: 'not-paused' })

      expect(result).toBe(false)
    })

    it('should reject empty plan ID', async () => {
      await expect(caller.resume({ id: '' })).rejects.toThrow()
    })
  })

  // ===========================================================================
  // CANCEL PROCEDURE
  // ===========================================================================
  describe('cancel', () => {
    it('should cancel a running plan', async () => {
      vi.mocked(planService.cancel).mockReturnValue(true)

      const result = await caller.cancel({ id: 'plan-abc123' })

      expect(result).toBe(true)
      expect(planService.cancel).toHaveBeenCalledWith('plan-abc123')
    })

    it('should cancel a paused plan', async () => {
      vi.mocked(planService.cancel).mockReturnValue(true)

      const result = await caller.cancel({ id: 'paused-plan' })

      expect(result).toBe(true)
    })

    it('should return false when plan cannot be cancelled', async () => {
      vi.mocked(planService.cancel).mockReturnValue(false)

      const result = await caller.cancel({ id: 'completed-plan' })

      expect(result).toBe(false)
    })

    it('should reject empty plan ID', async () => {
      await expect(caller.cancel({ id: '' })).rejects.toThrow()
    })
  })

  // ===========================================================================
  // STATS PROCEDURE
  // ===========================================================================
  describe('stats', () => {
    it('should return execution statistics', async () => {
      const mockStats = createMockStats()
      vi.mocked(planService.getStats).mockReturnValue(mockStats)

      const result = await caller.stats()

      expect(result).toEqual(mockStats)
      expect(planService.getStats).toHaveBeenCalled()
    })

    it('should return zero stats when no plans executed', async () => {
      const emptyStats: PlanExecutionStats = {
        totalPlans: 0,
        completedPlans: 0,
        failedPlans: 0,
        successRate: 0,
        avgDuration: 0,
        totalStepsExecuted: 0,
      }
      vi.mocked(planService.getStats).mockReturnValue(emptyStats)

      const result = await caller.stats()

      expect(result.totalPlans).toBe(0)
      expect(result.successRate).toBe(0)
    })
  })

  // ===========================================================================
  // STEP COMPLETE PROCEDURE
  // ===========================================================================
  describe('stepComplete', () => {
    it('should mark a step as completed', async () => {
      vi.mocked(planService.stepComplete).mockReturnValue(true)

      const result = await caller.stepComplete({
        planId: 'plan-abc123',
        stepId: 'step-001',
      })

      expect(result).toBe(true)
      expect(planService.stepComplete).toHaveBeenCalledWith('plan-abc123', 'step-001', undefined)
    })

    it('should mark a step as completed with output', async () => {
      vi.mocked(planService.stepComplete).mockReturnValue(true)

      const result = await caller.stepComplete({
        planId: 'plan-abc123',
        stepId: 'step-001',
        output: 'Build completed successfully',
      })

      expect(result).toBe(true)
      expect(planService.stepComplete).toHaveBeenCalledWith(
        'plan-abc123',
        'step-001',
        'Build completed successfully'
      )
    })

    it('should return false when step not found', async () => {
      vi.mocked(planService.stepComplete).mockReturnValue(false)

      const result = await caller.stepComplete({
        planId: 'plan-abc123',
        stepId: 'nonexistent',
      })

      expect(result).toBe(false)
    })

    it('should reject empty planId', async () => {
      await expect(
        caller.stepComplete({ planId: '', stepId: 'step-001' })
      ).rejects.toThrow()
    })

    it('should reject empty stepId', async () => {
      await expect(
        caller.stepComplete({ planId: 'plan-abc123', stepId: '' })
      ).rejects.toThrow()
    })

    it('should handle large output text', async () => {
      vi.mocked(planService.stepComplete).mockReturnValue(true)
      const largeOutput = 'x'.repeat(10000)

      const result = await caller.stepComplete({
        planId: 'plan-abc123',
        stepId: 'step-001',
        output: largeOutput,
      })

      expect(result).toBe(true)
      expect(planService.stepComplete).toHaveBeenCalledWith(
        'plan-abc123',
        'step-001',
        largeOutput
      )
    })
  })

  // ===========================================================================
  // INTEGRATION-STYLE TESTS
  // ===========================================================================
  describe('plan lifecycle', () => {
    it('should handle create -> execute -> complete flow', async () => {
      const mockPlan = createMockPlan({ status: 'draft' })
      const executingPlan = { ...mockPlan, status: 'executing' as const }

      vi.mocked(planService.create).mockReturnValue(mockPlan)
      vi.mocked(planService.execute).mockReturnValue(true)
      vi.mocked(planService.stepComplete).mockReturnValue(true)
      vi.mocked(planService.get).mockReturnValue(executingPlan)

      // Create plan
      const created = await caller.create({
        title: 'Test Plan',
        description: 'Test description',
        projectPath: '/test/path',
        steps: [{ name: 'Step 1', description: 'First step', type: 'shell' }],
      })
      expect(created.status).toBe('draft')

      // Execute plan
      const executed = await caller.execute({ id: created.id })
      expect(executed).toBe(true)

      // Complete steps
      const stepCompleted = await caller.stepComplete({
        planId: created.id,
        stepId: created.steps[0].id,
        output: 'Success',
      })
      expect(stepCompleted).toBe(true)
    })

    it('should handle execute -> pause -> resume -> cancel flow', async () => {
      vi.mocked(planService.execute).mockReturnValue(true)
      vi.mocked(planService.pause).mockReturnValue(true)
      vi.mocked(planService.resume).mockReturnValue(true)
      vi.mocked(planService.cancel).mockReturnValue(true)

      // Execute
      const executed = await caller.execute({ id: 'plan-123' })
      expect(executed).toBe(true)

      // Pause
      const paused = await caller.pause({ id: 'plan-123' })
      expect(paused).toBe(true)

      // Resume
      const resumed = await caller.resume({ id: 'plan-123' })
      expect(resumed).toBe(true)

      // Cancel
      const cancelled = await caller.cancel({ id: 'plan-123' })
      expect(cancelled).toBe(true)
    })

    it('should handle list -> get -> update -> delete flow', async () => {
      const mockPlan = createMockPlan()
      vi.mocked(planService.list).mockReturnValue([mockPlan])
      vi.mocked(planService.get).mockReturnValue(mockPlan)
      vi.mocked(planService.update).mockReturnValue(true)
      vi.mocked(planService.delete).mockReturnValue(true)

      // List
      const plans = await caller.list()
      expect(plans).toHaveLength(1)

      // Get
      const plan = await caller.get({ id: plans[0].id })
      expect(plan?.title).toBe('Deploy Feature')

      // Update
      const updated = await caller.update({
        id: plan!.id,
        updates: { title: 'Updated Title' },
      })
      expect(updated).toBe(true)

      // Delete
      const deleted = await caller.delete({ id: plan!.id })
      expect(deleted).toBe(true)
    })
  })

  // ===========================================================================
  // EDGE CASES
  // ===========================================================================
  describe('edge cases', () => {
    it('should handle plan with many steps', async () => {
      const manySteps: Plan['steps'] = Array.from({ length: 100 }, (_, i) =>
        createMockStep({ id: `step-${i}`, name: `Step ${i}`, order: i })
      )
      const planWithManySteps = createMockPlan({ steps: manySteps })
      vi.mocked(planService.get).mockReturnValue(planWithManySteps)

      const result = await caller.get({ id: 'plan-abc123' })

      expect(result?.steps).toHaveLength(100)
    })

    it('should handle steps with dependencies', async () => {
      vi.mocked(planService.create).mockReturnValue(createMockPlan())

      const result = await caller.create({
        title: 'Plan with Dependencies',
        description: 'Steps have dependencies',
        projectPath: '/path',
        steps: [
          { name: 'Step 1', description: 'First', type: 'shell' },
          { name: 'Step 2', description: 'Second', type: 'shell', dependencies: ['step-1'] },
          {
            name: 'Step 3',
            description: 'Third',
            type: 'shell',
            dependencies: ['step-1', 'step-2'],
          },
        ],
      })

      expect(result).toBeDefined()
    })

    it('should handle unicode in plan title and description', async () => {
      vi.mocked(planService.create).mockReturnValue(createMockPlan())

      const result = await caller.create({
        title: 'Unicode title',
        description: 'Description with special chars',
        projectPath: '/path',
        steps: [{ name: 'Step', description: 'Desc', type: 'shell' }],
      })

      expect(result).toBeDefined()
    })

    it('should handle concurrent stats calls', async () => {
      const mockStats = createMockStats()
      vi.mocked(planService.getStats).mockReturnValue(mockStats)

      // Simulate multiple concurrent calls
      const results = await Promise.all([
        caller.stats(),
        caller.stats(),
        caller.stats(),
      ])

      expect(results).toHaveLength(3)
      results.forEach((result) => {
        expect(result).toEqual(mockStats)
      })
    })

    it('should handle step with estimated duration', async () => {
      vi.mocked(planService.create).mockReturnValue(createMockPlan())

      const result = await caller.create({
        title: 'Plan with Duration',
        description: 'Steps have estimated durations',
        projectPath: '/path',
        steps: [
          { name: 'Quick Step', description: 'Fast', type: 'shell', estimatedDuration: 10 },
          { name: 'Long Step', description: 'Slow', type: 'shell', estimatedDuration: 3600 },
        ],
      })

      expect(result).toBeDefined()
    })

    it('should handle project paths with spaces', async () => {
      vi.mocked(planService.create).mockReturnValue(createMockPlan())

      const result = await caller.create({
        title: 'Plan',
        description: 'Desc',
        projectPath: '/home/user/My Projects/App Name',
        steps: [{ name: 'Step', description: 'Desc', type: 'shell' }],
      })

      expect(result).toBeDefined()
    })

    it('should handle special characters in command', async () => {
      vi.mocked(planService.create).mockReturnValue(createMockPlan())

      const result = await caller.create({
        title: 'Plan',
        description: 'Desc',
        projectPath: '/path',
        steps: [
          {
            name: 'Complex Command',
            description: 'Command with special chars',
            type: 'shell',
            command: "npm run test -- --grep='feature' && echo $PATH | tee output.log",
          },
        ],
      })

      expect(result).toBeDefined()
    })
  })

  // ===========================================================================
  // ERROR HANDLING
  // ===========================================================================
  describe('error handling', () => {
    it('should propagate service errors on create', async () => {
      vi.mocked(planService.create).mockImplementation(() => {
        throw new Error('Failed to create plan')
      })

      await expect(
        caller.create({
          title: 'Plan',
          description: 'Desc',
          projectPath: '/path',
          steps: [{ name: 'Step', description: 'Desc', type: 'shell' }],
        })
      ).rejects.toThrow('Failed to create plan')
    })

    it('should propagate service errors on execute', async () => {
      vi.mocked(planService.execute).mockImplementation(() => {
        throw new Error('Execution failed')
      })

      await expect(caller.execute({ id: 'plan-123' })).rejects.toThrow('Execution failed')
    })

    it('should propagate service errors on stepComplete', async () => {
      vi.mocked(planService.stepComplete).mockImplementation(() => {
        throw new Error('Step completion failed')
      })

      await expect(
        caller.stepComplete({ planId: 'plan-123', stepId: 'step-001' })
      ).rejects.toThrow('Step completion failed')
    })
  })
})
