/**
 * Profiles Controller
 *
 * Type-safe tRPC controller for Claude Code profile management.
 * Handles both profile settings (model, tokens, thinking) and
 * custom profiles (claude-eng, claude-sec, etc.).
 *
 * Migrated from handlers.ts (15 handlers):
 * - profile:settings, saveSettings, claudemd, saveClaudemd
 * - profile:rules, toggleRule, saveRule
 * - profiles:list, get, create, update, delete, activate, getActive, launch
 *
 * @module profiles.controller
 */

import { z } from 'zod'
import { router, publicProcedure, auditedProcedure } from '../../trpc/trpc'
import {
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  unlinkSync,
  statSync,
} from 'fs'
import { readFile, writeFile, readdir } from 'fs/promises'
import { join } from 'path'
import { homedir } from 'os'
import { spawn } from 'child_process'
import type { ProfileSettings, ClaudeRule, ClaudeCodeProfile } from '../../../shared/types'

// ============================================================================
// Constants
// ============================================================================

const HOME = homedir()
const CLAUDE_DIR = join(HOME, '.claude')
const PROFILES_DIR = join(HOME, '.claude-profiles')
const ACTIVE_PROFILE_FILE = join(CLAUDE_DIR, 'active-profile')

// ============================================================================
// Schemas
// ============================================================================

const ProfileSettingsSchema = z.object({
  model: z.string().optional(),
  maxTokens: z.number().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
  customInstructions: z.string().optional(),
  thinkingEnabled: z.boolean().optional(),
  thinkingBudget: z.number().positive().optional(),
})

const SaveRuleSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
})

const ToggleRuleSchema = z.object({
  name: z.string().min(1),
  enabled: z.boolean(),
})

const ProfileIdSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^[a-zA-Z0-9._-]+$/, 'Invalid profile ID'),
})

const CreateProfileSchema = z.object({
  name: z.string().min(1).max(50),
  description: z.string().optional(),
  settings: ProfileSettingsSchema.optional(),
  claudeMd: z.string().optional(),
  enabledRules: z.array(z.string()).optional(),
})

const UpdateProfileSchema = z.object({
  id: z.string().min(1),
  updates: z.object({
    name: z.string().min(1).max(50).optional(),
    description: z.string().optional(),
    settings: ProfileSettingsSchema.optional(),
    claudeMd: z.string().optional(),
    enabledRules: z.array(z.string()).optional(),
  }),
})

const LaunchProfileSchema = z.object({
  id: z.string().min(1),
  projectPath: z.string().optional(),
})

// ============================================================================
// Helper Functions
// ============================================================================

function ensureProfilesDir(): void {
  if (!existsSync(PROFILES_DIR)) {
    mkdirSync(PROFILES_DIR, { recursive: true })
  }
}

function getProfileSettings(): ProfileSettings {
  const settingsPath = join(CLAUDE_DIR, 'settings.json')
  try {
    if (!existsSync(settingsPath)) {
      return {}
    }
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    return {
      model: settings.model,
      maxTokens: settings.max_tokens,
      thinkingEnabled: settings.thinking?.type === 'enabled',
      thinkingBudget: settings.thinking?.budget_tokens,
    }
  } catch (error) {
    console.error('Failed to read profile settings:', error)
    return {}
  }
}

function saveProfileSettings(newSettings: ProfileSettings): boolean {
  const settingsPath = join(CLAUDE_DIR, 'settings.json')
  try {
    let settings: Record<string, unknown> = {}
    if (existsSync(settingsPath)) {
      settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    }

    if (newSettings.model) {
      settings.model = newSettings.model
    }
    if (newSettings.maxTokens) {
      settings.max_tokens = newSettings.maxTokens
    }
    if (newSettings.thinkingEnabled !== undefined) {
      settings.thinking = {
        type: newSettings.thinkingEnabled ? 'enabled' : 'disabled',
        budget_tokens: newSettings.thinkingBudget || 32000,
      }
    }

    writeFileSync(settingsPath, JSON.stringify(settings, null, 2))
    return true
  } catch (error) {
    console.error('Failed to save profile settings:', error)
    return false
  }
}

async function getClaudeMd(): Promise<string> {
  const claudeMdPath = join(CLAUDE_DIR, 'CLAUDE.md')
  try {
    if (!existsSync(claudeMdPath)) {
      return ''
    }
    return await readFile(claudeMdPath, 'utf-8')
  } catch (error) {
    console.error('Failed to read CLAUDE.md:', error)
    return ''
  }
}

async function saveClaudeMd(content: string): Promise<boolean> {
  const claudeMdPath = join(CLAUDE_DIR, 'CLAUDE.md')
  try {
    await writeFile(claudeMdPath, content)
    return true
  } catch (error) {
    console.error('Failed to save CLAUDE.md:', error)
    return false
  }
}

async function getRules(): Promise<ClaudeRule[]> {
  const rulesDir = join(CLAUDE_DIR, 'rules')
  const settingsPath = join(CLAUDE_DIR, 'settings.json')
  const rules: ClaudeRule[] = []

  // Read disabled rules from settings
  let disabledRules: string[] = []
  try {
    if (existsSync(settingsPath)) {
      const settings = JSON.parse(await readFile(settingsPath, 'utf-8'))
      disabledRules = settings.disabledRules || []
    }
  } catch {
    // Ignore settings read errors
  }

  try {
    if (!existsSync(rulesDir)) {
      return rules
    }

    const entries = await readdir(rulesDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue

      const rulePath = join(rulesDir, entry.name)
      const ruleName = entry.name.replace('.md', '')
      const isEnabled = !disabledRules.includes(ruleName)

      try {
        const content = await readFile(rulePath, 'utf-8')
        rules.push({
          name: ruleName,
          path: rulePath,
          enabled: isEnabled,
          content,
        })
      } catch {
        rules.push({
          name: ruleName,
          path: rulePath,
          enabled: isEnabled,
        })
      }
    }
  } catch (error) {
    console.error('Failed to read rules:', error)
  }

  return rules
}

function toggleRule(name: string, enabled: boolean): boolean {
  const settingsPath = join(CLAUDE_DIR, 'settings.json')
  const rulesDir = join(CLAUDE_DIR, 'rules')
  const rulePath = join(rulesDir, `${name}.md`)

  try {
    // Check if rule file exists
    if (!existsSync(rulePath)) {
      console.error(`Rule file not found: ${rulePath}`)
      return false
    }

    // Read or create settings
    let settings: Record<string, unknown> = {}
    if (existsSync(settingsPath)) {
      settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    }

    // Initialize disabledRules array if it doesn't exist
    if (!settings.disabledRules) {
      settings.disabledRules = []
    }
    const disabledRules = settings.disabledRules as string[]

    if (enabled) {
      // Remove from disabled list
      const index = disabledRules.indexOf(name)
      if (index >= 0) {
        disabledRules.splice(index, 1)
      }
    } else {
      // Add to disabled list
      if (!disabledRules.includes(name)) {
        disabledRules.push(name)
      }
    }

    settings.disabledRules = disabledRules
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2))
    return true
  } catch (error) {
    console.error('Failed to toggle rule:', error)
    return false
  }
}

function listProfiles(): ClaudeCodeProfile[] {
  const profiles: ClaudeCodeProfile[] = []

  try {
    if (!existsSync(PROFILES_DIR)) {
      return profiles
    }

    const entries = readdirSync(PROFILES_DIR, { withFileTypes: true })
    const profileDirs = entries.filter((e) => e.isDirectory())

    for (const dir of profileDirs) {
      const profilePath = join(PROFILES_DIR, dir.name)
      try {
        const settingsPath = join(profilePath, 'settings.json')
        const mcpPath = join(profilePath, 'mcp.json')
        const claudeMdPath = join(profilePath, 'CLAUDE.md')

        let settings: ClaudeCodeProfile['settings'] = {}
        if (existsSync(settingsPath)) {
          const settingsContent = JSON.parse(readFileSync(settingsPath, 'utf-8'))
          settings = {
            model: settingsContent.model,
            maxTokens: settingsContent.max_tokens,
            thinkingEnabled: settingsContent.thinking?.type === 'enabled',
            thinkingBudget: settingsContent.thinking?.budget_tokens,
          }
        }

        let claudeMd: string | undefined
        if (existsSync(claudeMdPath)) {
          claudeMd = readFileSync(claudeMdPath, 'utf-8')
        }

        const hasMcp = existsSync(mcpPath)
        const stats = statSync(profilePath)

        profiles.push({
          id: dir.name,
          name: dir.name,
          description: `Profile at ${profilePath}`,
          settings,
          claudeMd,
          hasMcpConfig: hasMcp,
          profilePath,
          createdAt: stats.birthtime.getTime(),
          updatedAt: stats.mtime.getTime(),
        })
      } catch (err) {
        console.error(`[Profiles] Failed to load profile ${dir.name}:`, err)
      }
    }
  } catch (error) {
    console.error('[Profiles] Failed to list profiles:', error)
  }

  return profiles.sort((a, b) => a.name.localeCompare(b.name))
}

function getProfile(id: string): ClaudeCodeProfile | null {
  const profilePath = join(PROFILES_DIR, id)
  try {
    if (!existsSync(profilePath)) return null

    const settingsPath = join(profilePath, 'settings.json')
    const mcpPath = join(profilePath, 'mcp.json')
    const claudeMdPath = join(profilePath, 'CLAUDE.md')

    let settings: ClaudeCodeProfile['settings'] = {}
    if (existsSync(settingsPath)) {
      const settingsContent = JSON.parse(readFileSync(settingsPath, 'utf-8'))
      settings = {
        model: settingsContent.model,
        maxTokens: settingsContent.max_tokens,
        thinkingEnabled: settingsContent.thinking?.type === 'enabled',
        thinkingBudget: settingsContent.thinking?.budget_tokens,
      }
    }

    let claudeMd: string | undefined
    if (existsSync(claudeMdPath)) {
      claudeMd = readFileSync(claudeMdPath, 'utf-8')
    }

    const hasMcp = existsSync(mcpPath)
    const stats = statSync(profilePath)

    return {
      id,
      name: id,
      description: `Profile at ${profilePath}`,
      settings,
      claudeMd,
      hasMcpConfig: hasMcp,
      profilePath,
      createdAt: stats.birthtime.getTime(),
      updatedAt: stats.mtime.getTime(),
    }
  } catch (error) {
    console.error('Failed to get profile:', error)
    return null
  }
}

function createProfile(
  profile: Omit<ClaudeCodeProfile, 'id' | 'createdAt' | 'updatedAt'>
): ClaudeCodeProfile | null {
  ensureProfilesDir()

  const id = profile.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  const now = Date.now()

  const newProfile: ClaudeCodeProfile = {
    ...profile,
    id,
    createdAt: now,
    updatedAt: now,
  }

  const profilePath = join(PROFILES_DIR, `${id}.json`)
  try {
    if (existsSync(profilePath)) {
      console.error('Profile with this name already exists')
      return null
    }
    writeFileSync(profilePath, JSON.stringify(newProfile, null, 2))
    return newProfile
  } catch (error) {
    console.error('Failed to create profile:', error)
    return null
  }
}

function updateProfile(id: string, updates: Partial<ClaudeCodeProfile>): boolean {
  const profilePath = join(PROFILES_DIR, `${id}.json`)
  try {
    if (!existsSync(profilePath)) return false

    const existing = JSON.parse(readFileSync(profilePath, 'utf-8')) as ClaudeCodeProfile
    const updated: ClaudeCodeProfile = {
      ...existing,
      ...updates,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: Date.now(),
    }

    writeFileSync(profilePath, JSON.stringify(updated, null, 2))
    return true
  } catch (error) {
    console.error('Failed to update profile:', error)
    return false
  }
}

function deleteProfile(id: string): boolean {
  const profilePath = join(PROFILES_DIR, `${id}.json`)
  try {
    if (!existsSync(profilePath)) return false
    unlinkSync(profilePath)

    if (getActiveProfileId() === id) {
      if (existsSync(ACTIVE_PROFILE_FILE)) {
        unlinkSync(ACTIVE_PROFILE_FILE)
      }
    }
    return true
  } catch (error) {
    console.error('Failed to delete profile:', error)
    return false
  }
}

function activateProfile(id: string): boolean {
  const profile = getProfile(id)
  if (!profile) return false

  try {
    writeFileSync(ACTIVE_PROFILE_FILE, id)

    if (profile.settings) {
      saveProfileSettings(profile.settings)
    }

    if (profile.claudeMd) {
      saveClaudeMd(profile.claudeMd)
    }

    if (profile.enabledRules) {
      const allRules = getRules()
      const settingsPath = join(CLAUDE_DIR, 'settings.json')
      let settings: Record<string, unknown> = {}

      if (existsSync(settingsPath)) {
        settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
      }

      const enabledRules = profile.enabledRules ?? []
      const disabledRules = allRules
        .filter((r) => !enabledRules.includes(r.name))
        .map((r) => r.name)

      settings.disabledRules = disabledRules
      writeFileSync(settingsPath, JSON.stringify(settings, null, 2))
    }

    return true
  } catch (error) {
    console.error('Failed to activate profile:', error)
    return false
  }
}

function getActiveProfileId(): string | null {
  try {
    if (!existsSync(ACTIVE_PROFILE_FILE)) return null
    return readFileSync(ACTIVE_PROFILE_FILE, 'utf-8').trim()
  } catch {
    return null
  }
}

function launchProfile(id: string, projectPath?: string): { success: boolean; error?: string } {
  const profile = getProfile(id)
  if (!profile) {
    return { success: false, error: 'Profile not found' }
  }

  try {
    const binDir = join(HOME, 'bin')
    const launcherScript = join(binDir, `claude-${id}`)
    const hasLauncher = existsSync(launcherScript)

    let command: string
    const args: string[] = []

    if (hasLauncher) {
      command = launcherScript
      if (projectPath) {
        args.push(projectPath)
      }
    } else if (profile.profilePath && profile.hasMcpConfig) {
      const mcpConfig = join(profile.profilePath, 'mcp.json')
      const settingsJson = join(profile.profilePath, 'settings.json')
      const claudeMd = join(profile.profilePath, 'CLAUDE.md')

      command = 'claude'

      if (existsSync(mcpConfig)) {
        args.push('--mcp-config', mcpConfig)
      }

      if (existsSync(settingsJson)) {
        args.push('--settings', settingsJson)
      }

      if (existsSync(claudeMd)) {
        args.push('--append-system-prompt', claudeMd)
      }

      if (profile.settings.model) {
        args.push('--model', profile.settings.model)
      }

      if (projectPath) {
        args.push(projectPath)
      }
    } else {
      command = 'claude'
      if (profile.settings.model) {
        args.push('--model', profile.settings.model)
      }
      if (projectPath) {
        args.push(projectPath)
      }
    }

    spawn(command, args, {
      detached: true,
      stdio: 'ignore',
    }).unref()

    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Launch failed'
    console.error('Failed to launch profile:', error)
    return { success: false, error: message }
  }
}

// ============================================================================
// Router
// ============================================================================

export const profilesRouter = router({
  // Profile settings (current Claude session)
  settings: publicProcedure.query((): ProfileSettings => {
    return getProfileSettings()
  }),

  saveSettings: auditedProcedure.input(ProfileSettingsSchema).mutation(({ input }): boolean => {
    return saveProfileSettings(input)
  }),

  // CLAUDE.md management
  claudemd: publicProcedure.query((): Promise<string> => {
    return getClaudeMd()
  }),

  saveClaudemd: auditedProcedure
    .input(z.object({ content: z.string() }))
    .mutation(({ input }): Promise<boolean> => {
      return saveClaudeMd(input.content)
    }),

  // Rules management
  rules: publicProcedure.query((): Promise<ClaudeRule[]> => {
    return getRules()
  }),

  toggleRule: auditedProcedure.input(ToggleRuleSchema).mutation(({ input }): boolean => {
    return toggleRule(input.name, input.enabled)
  }),

  saveRule: auditedProcedure.input(SaveRuleSchema).mutation(async ({ input }): Promise<boolean> => {
    try {
      await writeFile(input.path, input.content, 'utf-8')
      return true
    } catch (error) {
      console.error('Failed to save rule:', error)
      return false
    }
  }),

  // Custom profiles (claude-eng, claude-sec, etc.)
  list: publicProcedure.query((): ClaudeCodeProfile[] => {
    return listProfiles()
  }),

  get: publicProcedure.input(ProfileIdSchema).query(({ input }): ClaudeCodeProfile | null => {
    return getProfile(input.id)
  }),

  create: auditedProcedure
    .input(CreateProfileSchema)
    .mutation(({ input }): ClaudeCodeProfile | null => {
      return createProfile({
        name: input.name,
        description: input.description,
        settings: input.settings ?? {},
        claudeMd: input.claudeMd,
        enabledRules: input.enabledRules,
      })
    }),

  update: auditedProcedure.input(UpdateProfileSchema).mutation(({ input }): boolean => {
    return updateProfile(input.id, input.updates)
  }),

  delete: auditedProcedure.input(ProfileIdSchema).mutation(({ input }): boolean => {
    return deleteProfile(input.id)
  }),

  activate: auditedProcedure.input(ProfileIdSchema).mutation(({ input }): boolean => {
    return activateProfile(input.id)
  }),

  getActive: publicProcedure.query((): string | null => {
    return getActiveProfileId()
  }),

  launch: auditedProcedure
    .input(LaunchProfileSchema)
    .mutation(({ input }): { success: boolean; error?: string } => {
      return launchProfile(input.id, input.projectPath)
    }),
})
