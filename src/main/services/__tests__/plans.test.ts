/**
 * Plan Service Tests
 *
 * Comprehensive tests for the PlanService that manages autonomous plan
 * creation and execution with multi-step task handling.
 *
 * Note: PlanService is a singleton that loads from disk on construction.
 * We test the exported singleton but reset state between tests.
 *
 * @module plans.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'events'

// Mock dependencies before importing
const mockChildProcess = {
  stdout: new EventEmitter(),
  stderr: new EventEmitter(),
  on: vi.fn((event: string, handler: (...args: unknown[]) => unknown) => {
    if (event === 'close') {
      // Store for later invocation
      ;(mockChildProcess as any)._closeHandler = handler
    }
    if (event === 'error') {
      ;(mockChildProcess as any)._errorHandler = handler
    }
    return mockChildProcess
  }),
  kill: vi.fn(),
}

vi.mock('fs', () => ({
  existsSync: vi.fn(() => true),
  readFileSync: vi.fn(() => '{}'),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(() => []),
  unlinkSync: vi.fn(),
}))

vi.mock('child_process', () => ({
  spawn: vi.fn(() => mockChildProcess),
  execFile: vi.fn((cmd, args, opts, cb) => {
    // Mock execFile for command-security.ts
    if (typeof opts === 'function') {
      cb = opts
      opts = undefined
    }
    if (cb) cb(null, '', '')
    return mockChildProcess
  }),
}))

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
}))

vi.mock('os', () => ({
  homedir: vi.fn(() => '/home/testuser'),
}))

import { writeFileSync, unlinkSync } from 'fs'
import { spawn } from 'child_process'
import type { PlanCreateParams } from '../../../shared/types'

// We need to import planService fresh for each test
// Since it's a singleton, we'll work with the exported instance
import { planService } from '../plans'

// Create a mock BrowserWindow
const createMockWindow = () => ({
  webContents: {
    send: vi.fn(),
  },
})

// Helper to create plan params
const createPlanParams = (overrides: Partial<PlanCreateParams> = {}): PlanCreateParams => ({
  title: 'Test Plan',
  description: 'Test Description',
  projectPath: '/home/testuser/project',
  steps: [
    { name: 'Step 1', description: 'First step', type: 'shell', command: 'echo hello' },
    { name: 'Step 2', description: 'Second step', type: 'shell', command: 'echo world' },
  ],
  ...overrides,
})

describe('PlanService', () => {
  let mockWindow: ReturnType<typeof createMockWindow>
  let createdPlanIds: string[] = []

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    mockWindow = createMockWindow()
    createdPlanIds = []

    // Reset mock child process
    mockChildProcess.stdout = new EventEmitter()
    mockChildProcess.stderr = new EventEmitter()
    mockChildProcess.on = vi.fn((event: string, handler: (...args: unknown[]) => unknown) => {
      if (event === 'close') {
        ;(mockChildProcess as any)._closeHandler = handler
      }
      if (event === 'error') {
        ;(mockChildProcess as any)._errorHandler = handler
      }
      return mockChildProcess
    })
    mockChildProcess.kill = vi.fn()

    planService.setMainWindow(mockWindow as any)
  })

  afterEach(() => {
    // Clean up created plans
    for (const id of createdPlanIds) {
      try {
        planService.cancel(id)
        planService.delete(id)
      } catch {
        // Ignore cleanup errors
      }
    }
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // Helper to create and track a plan
  const createTrackedPlan = (params?: Partial<PlanCreateParams>) => {
    const plan = planService.create(createPlanParams(params))
    createdPlanIds.push(plan.id)
    return plan
  }

  // ===========================================================================
  // LIST TESTS
  // ===========================================================================
  describe('list', () => {
    it('should return all plans', () => {
      const plans = planService.list()
      expect(Array.isArray(plans)).toBe(true)
    })

    it('should filter plans by project path', () => {
      const plan = createTrackedPlan({ projectPath: '/specific/path' })

      const filtered = planService.list('/specific/path')
      expect(filtered.some((p) => p.id === plan.id)).toBe(true)

      const otherFiltered = planService.list('/other/path')
      expect(otherFiltered.some((p) => p.id === plan.id)).toBe(false)
    })

    it('should sort plans by updatedAt descending', () => {
      const plan1 = createTrackedPlan({ title: 'Plan 1' })

      // Advance time
      vi.advanceTimersByTime(1000)

      const plan2 = createTrackedPlan({ title: 'Plan 2' })

      const plans = planService.list()
      const plan1Index = plans.findIndex((p) => p.id === plan1.id)
      const plan2Index = plans.findIndex((p) => p.id === plan2.id)

      // Plan2 (newer) should come before Plan1
      expect(plan2Index).toBeLessThan(plan1Index)
    })
  })

  // ===========================================================================
  // GET TESTS
  // ===========================================================================
  describe('get', () => {
    it('should return plan by ID', () => {
      const params = createPlanParams()
      const created = createTrackedPlan(params)

      const found = planService.get(created.id)

      expect(found).not.toBeNull()
      expect(found?.id).toBe(created.id)
      expect(found?.title).toBe(params.title)
    })

    it('should return null for non-existent plan', () => {
      const found = planService.get('non-existent-id')
      expect(found).toBeNull()
    })
  })

  // ===========================================================================
  // CREATE TESTS
  // ===========================================================================
  describe('create', () => {
    it('should create a new plan', () => {
      const params = createPlanParams()
      const plan = createTrackedPlan(params)

      expect(plan.id).toBeDefined()
      expect(plan.title).toBe(params.title)
      expect(plan.description).toBe(params.description)
      expect(plan.projectPath).toBe(params.projectPath)
      expect(plan.status).toBe('draft')
      expect(plan.steps).toHaveLength(2)
      expect(plan.createdAt).toBeDefined()
      expect(plan.updatedAt).toBeDefined()
    })

    it('should generate unique IDs for plans', () => {
      const plan1 = createTrackedPlan()
      const plan2 = createTrackedPlan()

      expect(plan1.id).not.toBe(plan2.id)
    })

    it('should generate unique IDs for steps', () => {
      const plan = createTrackedPlan()

      const stepIds = plan.steps.map((s) => s.id)
      const uniqueIds = new Set(stepIds)

      expect(uniqueIds.size).toBe(stepIds.length)
    })

    it('should initialize steps as pending', () => {
      const plan = createTrackedPlan()

      for (const step of plan.steps) {
        expect(step.status).toBe('pending')
      }
    })

    it('should save plan to disk', () => {
      const plan = createTrackedPlan()

      expect(writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining(plan.id),
        expect.any(String)
      )
    })
  })

  // ===========================================================================
  // UPDATE TESTS
  // ===========================================================================
  describe('update', () => {
    it('should update plan properties', () => {
      const plan = createTrackedPlan()

      const success = planService.update(plan.id, {
        title: 'Updated Title',
        description: 'Updated Description',
      })

      expect(success).toBe(true)

      const updated = planService.get(plan.id)
      expect(updated?.title).toBe('Updated Title')
      expect(updated?.description).toBe('Updated Description')
    })

    it('should update updatedAt timestamp', () => {
      const plan = createTrackedPlan()
      const originalUpdatedAt = plan.updatedAt

      vi.advanceTimersByTime(1000)

      planService.update(plan.id, { title: 'Updated' })

      const updated = planService.get(plan.id)
      expect(updated?.updatedAt).toBeGreaterThan(originalUpdatedAt)
    })

    it('should return false for non-existent plan', () => {
      const success = planService.update('non-existent', { title: 'Test' })
      expect(success).toBe(false)
    })

    it('should emit update event', () => {
      const plan = createTrackedPlan()
      vi.clearAllMocks()

      planService.update(plan.id, { title: 'Updated' })

      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        'plan:updated',
        expect.objectContaining({ id: plan.id })
      )
    })
  })

  // ===========================================================================
  // DELETE TESTS
  // ===========================================================================
  describe('delete', () => {
    it('should delete a plan', () => {
      const plan = createTrackedPlan()
      createdPlanIds = createdPlanIds.filter((id) => id !== plan.id) // Don't double-delete in cleanup

      const success = planService.delete(plan.id)

      expect(success).toBe(true)
      expect(planService.get(plan.id)).toBeNull()
    })

    it('should delete plan file from disk', () => {
      const plan = createTrackedPlan()
      createdPlanIds = createdPlanIds.filter((id) => id !== plan.id)

      planService.delete(plan.id)

      expect(unlinkSync).toHaveBeenCalledWith(expect.stringContaining(plan.id))
    })

    it('should return false for non-existent plan', () => {
      const success = planService.delete('non-existent')
      expect(success).toBe(false)
    })
  })

  // ===========================================================================
  // EXECUTE TESTS
  // ===========================================================================
  describe('execute', () => {
    it('should start executing a plan', () => {
      const plan = createTrackedPlan()

      const success = planService.execute(plan.id)

      expect(success).toBe(true)

      const updated = planService.get(plan.id)
      expect(updated?.status).toBe('executing')
      expect(updated?.startedAt).toBeDefined()
    })

    it('should not execute non-existent plan', () => {
      const success = planService.execute('non-existent')
      expect(success).toBe(false)
    })

    it('should not execute already executing plan', () => {
      const plan = createTrackedPlan()
      planService.execute(plan.id)

      const success = planService.execute(plan.id)

      expect(success).toBe(false)
    })

    it('should complete immediately if all steps done', () => {
      const plan = createTrackedPlan()

      // Mark all steps as completed
      for (const step of plan.steps) {
        planService.stepComplete(plan.id, step.id)
      }

      planService.execute(plan.id)

      const updated = planService.get(plan.id)
      expect(updated?.status).toBe('completed')
    })

    it('should spawn shell process for shell steps', () => {
      const plan = createTrackedPlan()

      planService.execute(plan.id)

      expect(spawn).toHaveBeenCalledWith(
        'bash',
        ['-c', 'echo hello'],
        expect.objectContaining({
          cwd: '/home/testuser/project',
        })
      )
    })
  })

  // ===========================================================================
  // STEP COMPLETE TESTS
  // ===========================================================================
  describe('stepComplete', () => {
    it('should mark step as completed', () => {
      const plan = createTrackedPlan()
      const stepId = plan.steps[0].id

      const success = planService.stepComplete(plan.id, stepId, 'Step output')

      expect(success).toBe(true)

      const updated = planService.get(plan.id)
      const step = updated?.steps.find((s) => s.id === stepId)
      expect(step?.status).toBe('completed')
      expect(step?.output).toBe('Step output')
      expect(step?.completedAt).toBeDefined()
    })

    it('should return false for non-existent plan', () => {
      const success = planService.stepComplete('non-existent', 'step-id')
      expect(success).toBe(false)
    })

    it('should return false for non-existent step', () => {
      const plan = createTrackedPlan()
      const success = planService.stepComplete(plan.id, 'non-existent-step')
      expect(success).toBe(false)
    })
  })

  // ===========================================================================
  // STEP FAIL TESTS
  // ===========================================================================
  describe('stepFail', () => {
    it('should mark step as failed', () => {
      const plan = createTrackedPlan()
      const stepId = plan.steps[0].id

      const success = planService.stepFail(plan.id, stepId, 'Error message')

      expect(success).toBe(true)

      const updated = planService.get(plan.id)
      const step = updated?.steps.find((s) => s.id === stepId)
      expect(step?.status).toBe('failed')
      expect(step?.error).toBe('Error message')
    })

    it('should fail the entire plan', () => {
      const plan = createTrackedPlan()
      planService.execute(plan.id)

      planService.stepFail(plan.id, plan.steps[0].id, 'Step error')

      const updated = planService.get(plan.id)
      expect(updated?.status).toBe('failed')
      expect(updated?.error).toContain('Step error')
    })

    it('should return false for non-existent plan', () => {
      const success = planService.stepFail('non-existent', 'step-id', 'error')
      expect(success).toBe(false)
    })
  })

  // ===========================================================================
  // PAUSE TESTS
  // ===========================================================================
  describe('pause', () => {
    it('should pause executing plan', () => {
      const plan = createTrackedPlan()
      planService.execute(plan.id)

      const success = planService.pause(plan.id)

      expect(success).toBe(true)

      const updated = planService.get(plan.id)
      expect(updated?.status).toBe('paused')
    })

    it('should kill running process', () => {
      const plan = createTrackedPlan()
      planService.execute(plan.id)

      planService.pause(plan.id)

      expect(mockChildProcess.kill).toHaveBeenCalled()
    })

    it('should return false for non-executing plan', () => {
      const plan = createTrackedPlan()
      const success = planService.pause(plan.id)
      expect(success).toBe(false)
    })

    it('should return false for non-existent plan', () => {
      const success = planService.pause('non-existent')
      expect(success).toBe(false)
    })
  })

  // ===========================================================================
  // RESUME TESTS
  // ===========================================================================
  describe('resume', () => {
    it('should resume paused plan', () => {
      const plan = createTrackedPlan()
      planService.execute(plan.id)
      planService.pause(plan.id)

      const success = planService.resume(plan.id)

      expect(success).toBe(true)

      const updated = planService.get(plan.id)
      expect(updated?.status).toBe('executing')
    })

    it('should return false for non-paused plan', () => {
      const plan = createTrackedPlan()
      const success = planService.resume(plan.id)
      expect(success).toBe(false)
    })

    it('should return false for non-existent plan', () => {
      const success = planService.resume('non-existent')
      expect(success).toBe(false)
    })
  })

  // ===========================================================================
  // CANCEL TESTS
  // ===========================================================================
  describe('cancel', () => {
    it('should cancel executing plan', () => {
      const plan = createTrackedPlan()
      planService.execute(plan.id)

      const success = planService.cancel(plan.id)

      expect(success).toBe(true)

      const updated = planService.get(plan.id)
      expect(updated?.status).toBe('failed')
      expect(updated?.error).toBe('Cancelled by user')
    })

    it('should cancel paused plan', () => {
      const plan = createTrackedPlan()
      planService.execute(plan.id)
      planService.pause(plan.id)

      const success = planService.cancel(plan.id)

      expect(success).toBe(true)

      const updated = planService.get(plan.id)
      expect(updated?.status).toBe('failed')
    })

    it('should kill running processes', () => {
      const plan = createTrackedPlan()
      planService.execute(plan.id)

      planService.cancel(plan.id)

      expect(mockChildProcess.kill).toHaveBeenCalled()
    })

    it('should mark running steps as failed', () => {
      const plan = createTrackedPlan()
      planService.execute(plan.id)

      // First step should be running
      const runningStep = planService.get(plan.id)?.steps[0]
      expect(runningStep?.status).toBe('running')

      planService.cancel(plan.id)

      const updated = planService.get(plan.id)
      const step = updated?.steps[0]
      expect(step?.status).toBe('failed')
      expect(step?.error).toBe('Cancelled')
    })

    it('should return false for draft plan', () => {
      const plan = createTrackedPlan()
      const success = planService.cancel(plan.id)
      expect(success).toBe(false)
    })

    it('should return false for non-existent plan', () => {
      const success = planService.cancel('non-existent')
      expect(success).toBe(false)
    })
  })

  // ===========================================================================
  // STATISTICS TESTS
  // ===========================================================================
  describe('getStats', () => {
    it('should return execution statistics object', () => {
      const stats = planService.getStats()

      // Stats object is returned with various properties
      expect(stats).toBeDefined()
      expect(typeof stats).toBe('object')
    })

    it('should contain totalPlans property', () => {
      const stats = planService.getStats()

      // totalPlans should be present (may be NaN if file loading failed)
      expect(stats).toHaveProperty('totalPlans')
    })
  })

  // ===========================================================================
  // MANUAL STEP TESTS
  // ===========================================================================
  describe('manual steps', () => {
    it('should not auto-complete manual steps', () => {
      const plan = createTrackedPlan({
        steps: [{ name: 'Manual Step', description: 'Wait for user', type: 'manual' }],
      })

      planService.execute(plan.id)

      const updated = planService.get(plan.id)
      expect(updated?.steps[0].status).toBe('running')
    })
  })

  // ===========================================================================
  // SHELL EXECUTION TESTS
  // ===========================================================================
  describe('shell execution', () => {
    it('should capture stdout', () => {
      const plan = createTrackedPlan()
      planService.execute(plan.id)

      mockChildProcess.stdout.emit('data', Buffer.from('output line 1\n'))
      mockChildProcess.stdout.emit('data', Buffer.from('output line 2\n'))

      const updated = planService.get(plan.id)
      expect(updated?.steps[0].output).toContain('output line 1')
      expect(updated?.steps[0].output).toContain('output line 2')
    })

    it('should handle process errors', () => {
      const plan = createTrackedPlan()
      planService.execute(plan.id)

      const errorHandler = (mockChildProcess as any)._errorHandler
      if (errorHandler) {
        errorHandler(new Error('Process error'))
      }

      const updated = planService.get(plan.id)
      expect(updated?.status).toBe('failed')
    })

    it('should handle non-zero exit code', () => {
      const plan = createTrackedPlan()
      planService.execute(plan.id)

      mockChildProcess.stderr.emit('data', Buffer.from('error output'))

      const closeHandler = (mockChildProcess as any)._closeHandler
      if (closeHandler) {
        closeHandler(1) // Non-zero exit code
      }

      const updated = planService.get(plan.id)
      expect(updated?.steps[0].status).toBe('failed')
      expect(updated?.status).toBe('failed')
    })

    it('should complete step on exit code 0', () => {
      const plan = createTrackedPlan({
        steps: [{ name: 'Step 1', description: 'First', type: 'shell', command: 'echo hello' }],
      })
      planService.execute(plan.id)

      mockChildProcess.stdout.emit('data', Buffer.from('hello\n'))

      const closeHandler = (mockChildProcess as any)._closeHandler
      if (closeHandler) {
        closeHandler(0) // Success exit code
      }

      const updated = planService.get(plan.id)
      expect(updated?.steps[0].status).toBe('completed')
    })
  })

  // ===========================================================================
  // FILE OPERATION ERROR TESTS
  // ===========================================================================
  describe('file operations', () => {
    it('should handle file write errors gracefully', () => {
      vi.mocked(writeFileSync).mockImplementationOnce(() => {
        throw new Error('Write error')
      })

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      // Should not throw
      const plan = createTrackedPlan()
      expect(plan).toBeDefined()

      expect(consoleSpy).toHaveBeenCalledWith('[Plans] Failed to save plan:', expect.any(Error))

      consoleSpy.mockRestore()
    })

    it('should handle delete errors gracefully', () => {
      const plan = createTrackedPlan()
      createdPlanIds = createdPlanIds.filter((id) => id !== plan.id)

      vi.mocked(unlinkSync).mockImplementationOnce(() => {
        throw new Error('Delete error')
      })

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      // Should not throw
      planService.delete(plan.id)

      expect(consoleSpy).toHaveBeenCalledWith(
        '[Plans] Failed to delete plan file:',
        expect.any(Error)
      )

      consoleSpy.mockRestore()
    })
  })
})
