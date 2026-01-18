/**
 * Settings Controller
 *
 * Type-safe tRPC controller for application settings.
 * Handles app preferences, budget tracking, and theme settings.
 *
 * Migrated from handlers.ts (3 handlers):
 * - settings:get
 * - settings:save
 * - settings:setBudget
 *
 * @module settings.controller
 */

import { z } from 'zod'
import { router, publicProcedure, auditedProcedure } from '../../trpc/trpc'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { AppSettings, BudgetSettings, ClaudePathSettings } from '../../../shared/types'

// ============================================================================
// Constants
// ============================================================================

const HOME = homedir()
const APP_SETTINGS_PATH = join(HOME, '.config', 'claude-pilot', 'settings.json')

const defaultAppSettings: AppSettings = {
  theme: 'dark',
  accentColor: 'purple',
  sidebarCollapsed: false,
  terminalFont: 'jetbrains',
  terminalFontSize: 14,
  terminalScrollback: 10000,
  postgresHost: 'localhost',
  postgresPort: 5433,
  memgraphHost: 'localhost',
  memgraphPort: 7687,
  systemNotifications: true,
  soundEnabled: false,
  autoLock: false,
  clearOnExit: true,
}

// ============================================================================
// Schemas
// ============================================================================

const BudgetSettingsSchema = z.object({
  billingType: z.enum(['subscription', 'api']),
  subscriptionPlan: z.enum(['pro', 'max', 'custom']).optional(),
  monthlyLimit: z.number().min(0),
  warningThreshold: z.number().min(0).max(100),
  alertsEnabled: z.boolean(),
})

const ClaudePathSettingsSchema = z.object({
  binaryPath: z.string().optional(),
  projectsPath: z.string().optional(),
})

const AppSettingsSchema = z.object({
  theme: z.enum(['dark', 'light', 'auto']),
  accentColor: z.enum(['purple', 'blue', 'green', 'teal']),
  sidebarCollapsed: z.boolean(),
  terminalFont: z.enum(['jetbrains', 'fira', 'cascadia']),
  terminalFontSize: z.number().min(8).max(32),
  terminalScrollback: z.number().min(100).max(100000),
  postgresHost: z.string(),
  postgresPort: z.number().min(1).max(65535),
  memgraphHost: z.string(),
  memgraphPort: z.number().min(1).max(65535),
  systemNotifications: z.boolean(),
  soundEnabled: z.boolean(),
  autoLock: z.boolean(),
  clearOnExit: z.boolean(),
  budget: BudgetSettingsSchema.optional(),
  claude: ClaudePathSettingsSchema.optional(),
})

// ============================================================================
// Helper Functions
// ============================================================================

function getAppSettings(): AppSettings {
  try {
    if (existsSync(APP_SETTINGS_PATH)) {
      const content = readFileSync(APP_SETTINGS_PATH, 'utf-8')
      const saved = JSON.parse(content)
      return { ...defaultAppSettings, ...saved }
    }
  } catch (error) {
    console.error('Failed to load app settings:', error)
  }
  return { ...defaultAppSettings }
}

function saveAppSettings(settings: AppSettings): boolean {
  try {
    // Ensure config directory exists
    const configDir = join(HOME, '.config', 'claude-pilot')
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true })
    }

    writeFileSync(APP_SETTINGS_PATH, JSON.stringify(settings, null, 2))
    return true
  } catch (error) {
    console.error('Failed to save app settings:', error)
    return false
  }
}

// ============================================================================
// Router
// ============================================================================

export const settingsRouter = router({
  /**
   * Get application settings
   */
  get: publicProcedure.query((): AppSettings => {
    return getAppSettings()
  }),

  /**
   * Save application settings
   */
  save: auditedProcedure.input(AppSettingsSchema).mutation(({ input }): boolean => {
    return saveAppSettings(input as AppSettings)
  }),

  /**
   * Set budget settings
   */
  setBudget: auditedProcedure.input(BudgetSettingsSchema).mutation(({ input }): boolean => {
    const settings = getAppSettings()
    settings.budget = input as BudgetSettings
    return saveAppSettings(settings)
  }),

  /**
   * Set Claude Code path settings
   */
  setClaude: auditedProcedure.input(ClaudePathSettingsSchema).mutation(({ input }): boolean => {
    const settings = getAppSettings()
    settings.claude = input as ClaudePathSettings
    return saveAppSettings(settings)
  }),
})
