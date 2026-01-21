// Plan Service - Autonomous plan creation and execution
// Manages multi-step task execution with state persistence

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { ChildProcess } from 'child_process'
import { BrowserWindow } from 'electron'
import type {
  Plan,
  PlanStep,
  StepStatus,
  PlanCreateParams,
  PlanExecutionStats,
} from '../../shared/types'
import { safeSpawnString, validateCommandString, validatePath } from '../utils/command-security'

const HOME = homedir()
const PLANS_DIR = join(HOME, '.config', 'claude-pilot', 'plans')
const STATS_PATH = join(HOME, '.config', 'claude-pilot', 'plans-stats.json')

// Generate unique ID
function generateId(): string {
  return `plan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function generateStepId(): string {
  return `step-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`
}

class PlanService {
  private plans: Map<string, Plan> = new Map()
  private activeProcesses: Map<string, ChildProcess> = new Map()
  private mainWindow: BrowserWindow | null = null
  private stats: PlanExecutionStats = {
    totalPlans: 0,
    completedPlans: 0,
    failedPlans: 0,
    successRate: 0,
    avgDuration: 0,
    totalStepsExecuted: 0,
  }

  constructor() {
    this.ensureDir()
    this.loadPlans()
    this.loadStats()
  }

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window
  }

  private ensureDir(): void {
    if (!existsSync(PLANS_DIR)) {
      mkdirSync(PLANS_DIR, { recursive: true })
    }
  }

  private loadPlans(): void {
    try {
      const files = readdirSync(PLANS_DIR).filter((f) => f.endsWith('.json'))
      for (const file of files) {
        const plan = JSON.parse(readFileSync(join(PLANS_DIR, file), 'utf-8')) as Plan
        this.plans.set(plan.id, plan)
      }
    } catch (error) {
      console.error('[Plans] Failed to load plans:', error)
    }
  }

  private savePlan(plan: Plan): void {
    try {
      writeFileSync(join(PLANS_DIR, `${plan.id}.json`), JSON.stringify(plan, null, 2))
    } catch (error) {
      console.error('[Plans] Failed to save plan:', error)
    }
  }

  private deletePlanFile(id: string): void {
    try {
      const path = join(PLANS_DIR, `${id}.json`)
      if (existsSync(path)) {
        unlinkSync(path)
      }
    } catch (error) {
      console.error('[Plans] Failed to delete plan file:', error)
    }
  }

  private loadStats(): void {
    try {
      if (existsSync(STATS_PATH)) {
        this.stats = JSON.parse(readFileSync(STATS_PATH, 'utf-8'))
      }
    } catch (error) {
      console.error('[Plans] Failed to load stats:', error)
    }
  }

  private saveStats(): void {
    try {
      const dir = join(HOME, '.config', 'claude-pilot')
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
      }
      writeFileSync(STATS_PATH, JSON.stringify(this.stats, null, 2))
    } catch (error) {
      console.error('[Plans] Failed to save stats:', error)
    }
  }

  private emitUpdate(plan: Plan): void {
    if (this.mainWindow) {
      this.mainWindow.webContents.send('plan:updated', plan)
    }
  }

  /**
   * List all plans, optionally filtered by project path
   */
  list(projectPath?: string): Plan[] {
    const plans = Array.from(this.plans.values())
    if (projectPath) {
      return plans.filter((p) => p.projectPath === projectPath)
    }
    return plans.sort((a, b) => b.updatedAt - a.updatedAt)
  }

  /**
   * Get a plan by ID
   */
  get(id: string): Plan | null {
    return this.plans.get(id) || null
  }

  /**
   * Create a new plan
   */
  create(params: PlanCreateParams): Plan {
    const now = Date.now()
    const plan: Plan = {
      id: generateId(),
      title: params.title,
      description: params.description,
      projectPath: params.projectPath,
      status: 'draft',
      steps: params.steps.map((step, index) => ({
        ...step,
        id: generateStepId(),
        status: 'pending' as StepStatus,
        order: index,
      })),
      currentStepIndex: 0,
      createdAt: now,
      updatedAt: now,
    }

    this.plans.set(plan.id, plan)
    this.savePlan(plan)
    this.stats.totalPlans++
    this.saveStats()

    return plan
  }

  /**
   * Update a plan
   */
  update(id: string, updates: Partial<Plan>): boolean {
    const plan = this.plans.get(id)
    if (!plan) return false

    // Don't allow updating certain fields
    const { id: _id, createdAt: _createdAt, ...safeUpdates } = updates

    Object.assign(plan, safeUpdates, { updatedAt: Date.now() })
    this.savePlan(plan)
    this.emitUpdate(plan)

    return true
  }

  /**
   * Delete a plan
   */
  delete(id: string): boolean {
    const plan = this.plans.get(id)
    if (!plan) return false

    // Cancel if executing
    if (plan.status === 'executing') {
      this.cancel(id)
    }

    this.plans.delete(id)
    this.deletePlanFile(id)

    return true
  }

  /**
   * Start executing a plan
   */
  execute(id: string): boolean {
    const plan = this.plans.get(id)
    if (!plan) return false
    if (plan.status === 'executing') return false

    plan.status = 'executing'
    plan.startedAt = Date.now()
    plan.updatedAt = Date.now()
    plan.currentStepIndex = plan.steps.findIndex((s) => s.status === 'pending')

    if (plan.currentStepIndex === -1) {
      // All steps already completed
      plan.status = 'completed'
      plan.completedAt = Date.now()
    }

    this.savePlan(plan)
    this.emitUpdate(plan)

    if (plan.status === 'executing') {
      this.executeNextStep(plan)
    }

    return true
  }

  /**
   * Execute the next pending step in a plan
   */
  private executeNextStep(plan: Plan): void {
    if (plan.status !== 'executing') return

    const step = plan.steps[plan.currentStepIndex]
    if (!step || step.status !== 'pending') {
      // Move to next pending step
      const nextIndex = plan.steps.findIndex(
        (s, i) => i > plan.currentStepIndex && s.status === 'pending'
      )
      if (nextIndex === -1) {
        // All done
        this.completePlan(plan)
        return
      }
      plan.currentStepIndex = nextIndex
      this.savePlan(plan)
      this.emitUpdate(plan)
      this.executeNextStep(plan)
      return
    }

    // Check dependencies
    if (step.dependencies && step.dependencies.length > 0) {
      const allDepsMet = step.dependencies.every((depId) => {
        const dep = plan.steps.find((s) => s.id === depId)
        return dep && dep.status === 'completed'
      })
      if (!allDepsMet) {
        // Skip to next step that has its dependencies met
        const nextReady = plan.steps.findIndex((s, i) => {
          if (i <= plan.currentStepIndex || s.status !== 'pending') return false
          if (!s.dependencies || s.dependencies.length === 0) return true
          return s.dependencies.every((depId) => {
            const dep = plan.steps.find((d) => d.id === depId)
            return dep && dep.status === 'completed'
          })
        })
        if (nextReady !== -1) {
          plan.currentStepIndex = nextReady
          this.executeNextStep(plan)
          return
        }
        // No steps ready, something is wrong
        this.failPlan(plan, 'Circular dependency or unmet dependencies')
        return
      }
    }

    // Execute the step
    step.status = 'running'
    step.startedAt = Date.now()
    plan.updatedAt = Date.now()
    this.savePlan(plan)
    this.emitUpdate(plan)

    if (step.type === 'shell' && step.command) {
      // Execute shell step asynchronously (handles its own errors)
      this.executeShellStep(plan, step).catch((error) => {
        this.stepFail(plan.id, step.id, `Execution error: ${(error as Error).message}`)
      })
    } else if (step.type === 'manual') {
      // Manual steps wait for user to mark complete
      // Just emit update and wait
    } else {
      // For other step types, auto-complete (placeholder for future Claude integration)
      setTimeout(() => {
        this.stepComplete(plan.id, step.id, `[${step.type}] Step execution simulated`)
      }, 1000)
    }
  }

  /**
   * Execute a shell command step
   *
   * Security: Uses safeSpawnString which:
   * - Validates command against allowlist
   * - Uses spawn with argument arrays (no shell injection)
   * - Validates paths to prevent traversal
   *
   * @see SEC-1 Shell Injection Prevention
   */
  private async executeShellStep(plan: Plan, step: PlanStep): Promise<void> {
    if (!step.command) {
      this.stepFail(plan.id, step.id, 'No command specified')
      return
    }

    // Validate the command string before execution
    const validation = validateCommandString(step.command)
    if (!validation.valid) {
      this.stepFail(
        plan.id,
        step.id,
        `Command validation failed: ${validation.error}. ` +
          'Only allowlisted commands (npm, git, vitest, etc.) can be executed.'
      )
      return
    }

    // Validate the working directory if specified
    if (plan.projectPath) {
      const pathValidation = await validatePath(plan.projectPath, [HOME, '/tmp', '/var/tmp'])
      if (!pathValidation.valid) {
        this.stepFail(plan.id, step.id, `Invalid project path: ${pathValidation.error}`)
        return
      }
    }

    try {
      // Use safe spawn which uses argument arrays (no shell)
      const { process: proc } = safeSpawnString(step.command, {
        cwd: plan.projectPath,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      this.activeProcesses.set(`${plan.id}:${step.id}`, proc)

      let stdout = ''
      let stderr = ''

      proc.stdout?.on('data', (data) => {
        stdout += data.toString()
        step.output = stdout
        plan.updatedAt = Date.now()
        this.emitUpdate(plan)
      })

      proc.stderr?.on('data', (data) => {
        stderr += data.toString()
      })

      proc.on('close', (code) => {
        this.activeProcesses.delete(`${plan.id}:${step.id}`)

        if (code === 0) {
          this.stepComplete(plan.id, step.id, stdout)
        } else {
          this.stepFail(plan.id, step.id, stderr || `Exit code: ${code}`)
        }
      })

      proc.on('error', (error) => {
        this.activeProcesses.delete(`${plan.id}:${step.id}`)
        this.stepFail(plan.id, step.id, error.message)
      })
    } catch (error) {
      this.stepFail(plan.id, step.id, (error as Error).message)
    }
  }

  /**
   * Mark a step as completed
   */
  stepComplete(planId: string, stepId: string, output?: string): boolean {
    const plan = this.plans.get(planId)
    if (!plan) return false

    const step = plan.steps.find((s) => s.id === stepId)
    if (!step) return false

    step.status = 'completed'
    step.completedAt = Date.now()
    if (output) step.output = output
    plan.updatedAt = Date.now()

    this.stats.totalStepsExecuted++
    this.saveStats()

    this.savePlan(plan)
    this.emitUpdate(plan)

    // Continue to next step if executing
    if (plan.status === 'executing') {
      plan.currentStepIndex++
      if (plan.currentStepIndex >= plan.steps.length) {
        this.completePlan(plan)
      } else {
        this.executeNextStep(plan)
      }
    }

    return true
  }

  /**
   * Mark a step as failed
   */
  stepFail(planId: string, stepId: string, error: string): boolean {
    const plan = this.plans.get(planId)
    if (!plan) return false

    const step = plan.steps.find((s) => s.id === stepId)
    if (!step) return false

    step.status = 'failed'
    step.completedAt = Date.now()
    step.error = error
    plan.updatedAt = Date.now()

    this.savePlan(plan)
    this.emitUpdate(plan)

    // Fail the plan
    this.failPlan(plan, `Step "${step.name}" failed: ${error}`)

    return true
  }

  /**
   * Complete a plan successfully
   */
  private completePlan(plan: Plan): void {
    plan.status = 'completed'
    plan.completedAt = Date.now()
    plan.totalDuration = plan.completedAt - (plan.startedAt || plan.createdAt)
    plan.updatedAt = Date.now()

    this.stats.completedPlans++
    this.stats.successRate =
      this.stats.completedPlans / (this.stats.completedPlans + this.stats.failedPlans)
    // Update average duration
    const prevTotal = this.stats.avgDuration * (this.stats.completedPlans - 1)
    this.stats.avgDuration = (prevTotal + plan.totalDuration) / this.stats.completedPlans
    this.saveStats()

    this.savePlan(plan)
    this.emitUpdate(plan)
  }

  /**
   * Fail a plan
   */
  private failPlan(plan: Plan, error: string): void {
    plan.status = 'failed'
    plan.error = error
    plan.completedAt = Date.now()
    plan.totalDuration = plan.completedAt - (plan.startedAt || plan.createdAt)
    plan.updatedAt = Date.now()

    this.stats.failedPlans++
    this.stats.successRate =
      this.stats.completedPlans / (this.stats.completedPlans + this.stats.failedPlans)
    this.saveStats()

    this.savePlan(plan)
    this.emitUpdate(plan)
  }

  /**
   * Pause a running plan
   */
  pause(id: string): boolean {
    const plan = this.plans.get(id)
    if (!plan || plan.status !== 'executing') return false

    plan.status = 'paused'
    plan.updatedAt = Date.now()

    // Kill any running process
    const key = `${id}:${plan.steps[plan.currentStepIndex]?.id}`
    const proc = this.activeProcesses.get(key)
    if (proc) {
      proc.kill()
      this.activeProcesses.delete(key)
    }

    this.savePlan(plan)
    this.emitUpdate(plan)

    return true
  }

  /**
   * Resume a paused plan
   */
  resume(id: string): boolean {
    const plan = this.plans.get(id)
    if (!plan || plan.status !== 'paused') return false

    plan.status = 'executing'
    plan.updatedAt = Date.now()

    this.savePlan(plan)
    this.emitUpdate(plan)

    this.executeNextStep(plan)

    return true
  }

  /**
   * Cancel a plan
   */
  cancel(id: string): boolean {
    const plan = this.plans.get(id)
    if (!plan) return false
    if (plan.status !== 'executing' && plan.status !== 'paused') return false

    plan.status = 'failed'
    plan.error = 'Cancelled by user'
    plan.completedAt = Date.now()
    plan.updatedAt = Date.now()

    // Kill any running process
    for (const [key, proc] of this.activeProcesses) {
      if (key.startsWith(id)) {
        proc.kill()
        this.activeProcesses.delete(key)
      }
    }

    // Mark running steps as failed
    for (const step of plan.steps) {
      if (step.status === 'running') {
        step.status = 'failed'
        step.error = 'Cancelled'
        step.completedAt = Date.now()
      }
    }

    this.stats.failedPlans++
    this.saveStats()

    this.savePlan(plan)
    this.emitUpdate(plan)

    return true
  }

  /**
   * Get execution statistics
   */
  getStats(): PlanExecutionStats {
    return { ...this.stats }
  }
}

export const planService = new PlanService()
