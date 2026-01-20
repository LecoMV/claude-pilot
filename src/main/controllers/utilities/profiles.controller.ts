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
 * - profiles:list, get, create, update, delete, activate, deactivate, getActive, launch
 *
 * @module profiles.controller
 */

import { z } from 'zod'
import { router, publicProcedure, auditedProcedure } from '../../trpc/trpc'
import { existsSync } from 'fs'
import { readFile, writeFile, readdir, mkdir, unlink, stat, access, rm } from 'fs/promises'
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

async function ensureProfilesDir(): Promise<void> {
  try {
    await access(PROFILES_DIR)
  } catch {
    await mkdir(PROFILES_DIR, { recursive: true })
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function getProfileSettings(): Promise<ProfileSettings> {
  const settingsPath = join(CLAUDE_DIR, 'settings.json')
  try {
    if (!(await fileExists(settingsPath))) {
      return {}
    }
    const content = await readFile(settingsPath, 'utf-8')
    const settings = JSON.parse(content)
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

async function saveProfileSettings(newSettings: ProfileSettings): Promise<boolean> {
  const settingsPath = join(CLAUDE_DIR, 'settings.json')
  try {
    let settings: Record<string, unknown> = {}
    if (await fileExists(settingsPath)) {
      const content = await readFile(settingsPath, 'utf-8')
      settings = JSON.parse(content)
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

    await writeFile(settingsPath, JSON.stringify(settings, null, 2))
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

async function toggleRule(name: string, enabled: boolean): Promise<boolean> {
  const settingsPath = join(CLAUDE_DIR, 'settings.json')
  const rulesDir = join(CLAUDE_DIR, 'rules')
  const rulePath = join(rulesDir, `${name}.md`)

  try {
    // Check if rule file exists
    if (!(await fileExists(rulePath))) {
      console.error(`Rule file not found: ${rulePath}`)
      return false
    }

    // Read or create settings
    let settings: Record<string, unknown> = {}
    if (await fileExists(settingsPath)) {
      const content = await readFile(settingsPath, 'utf-8')
      settings = JSON.parse(content)
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
    await writeFile(settingsPath, JSON.stringify(settings, null, 2))
    return true
  } catch (error) {
    console.error('Failed to toggle rule:', error)
    return false
  }
}

async function listProfiles(): Promise<ClaudeCodeProfile[]> {
  const profiles: ClaudeCodeProfile[] = []

  try {
    if (!(await fileExists(PROFILES_DIR))) {
      return profiles
    }

    const entries = await readdir(PROFILES_DIR, { withFileTypes: true })
    const profileDirs = entries.filter((e) => e.isDirectory())

    for (const dir of profileDirs) {
      const profilePath = join(PROFILES_DIR, dir.name)
      try {
        const settingsPath = join(profilePath, 'settings.json')
        const mcpPath = join(profilePath, 'mcp.json')
        const claudeMdPath = join(profilePath, 'CLAUDE.md')
        const metadataPath = join(profilePath, 'metadata.json')

        let settings: ClaudeCodeProfile['settings'] = {}
        if (await fileExists(settingsPath)) {
          const content = await readFile(settingsPath, 'utf-8')
          const settingsContent = JSON.parse(content)
          settings = {
            model: settingsContent.model,
            maxTokens: settingsContent.max_tokens,
            thinkingEnabled: settingsContent.thinking?.type === 'enabled',
            thinkingBudget: settingsContent.thinking?.budget_tokens,
          }
        }

        let claudeMd: string | undefined
        if (await fileExists(claudeMdPath)) {
          claudeMd = await readFile(claudeMdPath, 'utf-8')
        }

        // Read metadata for name, description, and timestamps
        let metadata: {
          name?: string
          description?: string
          enabledRules?: string[]
          createdAt?: number
          updatedAt?: number
        } = {}
        if (await fileExists(metadataPath)) {
          const content = await readFile(metadataPath, 'utf-8')
          metadata = JSON.parse(content)
        }

        const hasMcp = await fileExists(mcpPath)
        const stats = await stat(profilePath)

        profiles.push({
          id: dir.name,
          name: metadata.name || dir.name,
          description: metadata.description || `Profile at ${profilePath}`,
          settings,
          claudeMd,
          enabledRules: metadata.enabledRules,
          hasMcpConfig: hasMcp,
          profilePath,
          createdAt: metadata.createdAt || stats.birthtime.getTime(),
          updatedAt: metadata.updatedAt || stats.mtime.getTime(),
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

async function getProfile(id: string): Promise<ClaudeCodeProfile | null> {
  const profilePath = join(PROFILES_DIR, id)
  try {
    if (!(await fileExists(profilePath))) return null

    const settingsPath = join(profilePath, 'settings.json')
    const mcpPath = join(profilePath, 'mcp.json')
    const claudeMdPath = join(profilePath, 'CLAUDE.md')
    const metadataPath = join(profilePath, 'metadata.json')

    let settings: ClaudeCodeProfile['settings'] = {}
    if (await fileExists(settingsPath)) {
      const content = await readFile(settingsPath, 'utf-8')
      const settingsContent = JSON.parse(content)
      settings = {
        model: settingsContent.model,
        maxTokens: settingsContent.max_tokens,
        thinkingEnabled: settingsContent.thinking?.type === 'enabled',
        thinkingBudget: settingsContent.thinking?.budget_tokens,
      }
    }

    let claudeMd: string | undefined
    if (await fileExists(claudeMdPath)) {
      claudeMd = await readFile(claudeMdPath, 'utf-8')
    }

    // Read metadata for name, description, and timestamps
    let metadata: {
      name?: string
      description?: string
      enabledRules?: string[]
      createdAt?: number
      updatedAt?: number
    } = {}
    if (await fileExists(metadataPath)) {
      const content = await readFile(metadataPath, 'utf-8')
      metadata = JSON.parse(content)
    }

    const hasMcp = await fileExists(mcpPath)
    const stats = await stat(profilePath)

    return {
      id,
      name: metadata.name || id,
      description: metadata.description || `Profile at ${profilePath}`,
      settings,
      claudeMd,
      enabledRules: metadata.enabledRules,
      hasMcpConfig: hasMcp,
      profilePath,
      createdAt: metadata.createdAt || stats.birthtime.getTime(),
      updatedAt: metadata.updatedAt || stats.mtime.getTime(),
    }
  } catch (error) {
    console.error('Failed to get profile:', error)
    return null
  }
}

async function createProfile(
  profile: Omit<ClaudeCodeProfile, 'id' | 'createdAt' | 'updatedAt'>
): Promise<ClaudeCodeProfile | null> {
  await ensureProfilesDir()

  const id = profile.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  const now = Date.now()

  // Create a directory structure for the profile (consistent with listProfiles/getProfile)
  const profileDir = join(PROFILES_DIR, id)
  try {
    if (await fileExists(profileDir)) {
      console.error('Profile with this name already exists')
      return null
    }

    // Create the profile directory
    await mkdir(profileDir, { recursive: true })

    // Create settings.json with profile settings
    const settingsData: Record<string, unknown> = {}
    if (profile.settings?.model) {
      settingsData.model = profile.settings.model
    }
    if (profile.settings?.maxTokens) {
      settingsData.max_tokens = profile.settings.maxTokens
    }
    if (profile.settings?.thinkingEnabled !== undefined) {
      settingsData.thinking = {
        type: profile.settings.thinkingEnabled ? 'enabled' : 'disabled',
        budget_tokens: profile.settings.thinkingBudget || 32000,
      }
    }
    await writeFile(join(profileDir, 'settings.json'), JSON.stringify(settingsData, null, 2))

    // Create CLAUDE.md if provided
    if (profile.claudeMd) {
      await writeFile(join(profileDir, 'CLAUDE.md'), profile.claudeMd)
    }

    // Create a metadata.json for description and other metadata
    const metadata = {
      name: profile.name,
      description: profile.description,
      enabledRules: profile.enabledRules,
      createdAt: now,
      updatedAt: now,
    }
    await writeFile(join(profileDir, 'metadata.json'), JSON.stringify(metadata, null, 2))

    const newProfile: ClaudeCodeProfile = {
      id,
      name: profile.name,
      description: profile.description,
      settings: profile.settings ?? {},
      claudeMd: profile.claudeMd,
      enabledRules: profile.enabledRules,
      profilePath: profileDir,
      hasMcpConfig: false,
      createdAt: now,
      updatedAt: now,
    }

    return newProfile
  } catch (error) {
    console.error('Failed to create profile:', error)
    return null
  }
}

async function updateProfile(id: string, updates: Partial<ClaudeCodeProfile>): Promise<boolean> {
  const profileDir = join(PROFILES_DIR, id)
  try {
    if (!(await fileExists(profileDir))) return false

    const now = Date.now()

    // Update settings.json if settings changed
    if (updates.settings) {
      const settingsPath = join(profileDir, 'settings.json')
      let settingsData: Record<string, unknown> = {}

      // Read existing settings
      if (await fileExists(settingsPath)) {
        const content = await readFile(settingsPath, 'utf-8')
        settingsData = JSON.parse(content)
      }

      // Merge updates
      if (updates.settings.model) {
        settingsData.model = updates.settings.model
      }
      if (updates.settings.maxTokens) {
        settingsData.max_tokens = updates.settings.maxTokens
      }
      if (updates.settings.thinkingEnabled !== undefined) {
        settingsData.thinking = {
          type: updates.settings.thinkingEnabled ? 'enabled' : 'disabled',
          budget_tokens: updates.settings.thinkingBudget || 32000,
        }
      }

      await writeFile(settingsPath, JSON.stringify(settingsData, null, 2))
    }

    // Update CLAUDE.md if provided
    if (updates.claudeMd !== undefined) {
      const claudeMdPath = join(profileDir, 'CLAUDE.md')
      if (updates.claudeMd) {
        await writeFile(claudeMdPath, updates.claudeMd)
      } else {
        // Remove CLAUDE.md if set to empty
        if (await fileExists(claudeMdPath)) {
          await unlink(claudeMdPath)
        }
      }
    }

    // Update metadata.json
    const metadataPath = join(profileDir, 'metadata.json')
    let metadata: Record<string, unknown> = {
      createdAt: now,
      updatedAt: now,
    }

    if (await fileExists(metadataPath)) {
      const content = await readFile(metadataPath, 'utf-8')
      metadata = JSON.parse(content)
    }

    if (updates.name) metadata.name = updates.name
    if (updates.description !== undefined) metadata.description = updates.description
    if (updates.enabledRules !== undefined) metadata.enabledRules = updates.enabledRules
    metadata.updatedAt = now

    await writeFile(metadataPath, JSON.stringify(metadata, null, 2))

    return true
  } catch (error) {
    console.error('Failed to update profile:', error)
    return false
  }
}

async function deleteProfile(id: string): Promise<boolean> {
  const profileDir = join(PROFILES_DIR, id)
  try {
    if (!(await fileExists(profileDir))) return false

    // Remove the entire profile directory
    await rm(profileDir, { recursive: true, force: true })

    // Clear active profile if it was the deleted one
    if ((await getActiveProfileId()) === id) {
      if (await fileExists(ACTIVE_PROFILE_FILE)) {
        await unlink(ACTIVE_PROFILE_FILE)
      }
    }
    return true
  } catch (error) {
    console.error('Failed to delete profile:', error)
    return false
  }
}

async function activateProfile(id: string): Promise<boolean> {
  const profile = await getProfile(id)
  if (!profile) return false

  try {
    await writeFile(ACTIVE_PROFILE_FILE, id)

    if (profile.settings) {
      await saveProfileSettings(profile.settings)
    }

    if (profile.claudeMd) {
      await saveClaudeMd(profile.claudeMd)
    }

    if (profile.enabledRules) {
      const allRules = await getRules()
      const settingsPath = join(CLAUDE_DIR, 'settings.json')
      let settings: Record<string, unknown> = {}

      if (await fileExists(settingsPath)) {
        const content = await readFile(settingsPath, 'utf-8')
        settings = JSON.parse(content)
      }

      const enabledRules = profile.enabledRules ?? []
      const disabledRules = allRules
        .filter((r) => !enabledRules.includes(r.name))
        .map((r) => r.name)

      settings.disabledRules = disabledRules
      await writeFile(settingsPath, JSON.stringify(settings, null, 2))
    }

    return true
  } catch (error) {
    console.error('Failed to activate profile:', error)
    return false
  }
}

async function getActiveProfileId(): Promise<string | null> {
  try {
    if (!(await fileExists(ACTIVE_PROFILE_FILE))) return null
    const content = await readFile(ACTIVE_PROFILE_FILE, 'utf-8')
    return content.trim()
  } catch {
    return null
  }
}

async function deactivateProfile(): Promise<boolean> {
  try {
    // Remove the active profile marker
    if (await fileExists(ACTIVE_PROFILE_FILE)) {
      await unlink(ACTIVE_PROFILE_FILE)
    }
    return true
  } catch (error) {
    console.error('Failed to deactivate profile:', error)
    return false
  }
}

async function launchProfile(
  id: string,
  projectPath?: string
): Promise<{ success: boolean; error?: string }> {
  const profile = await getProfile(id)
  if (!profile) {
    return { success: false, error: 'Profile not found' }
  }

  try {
    const binDir = join(HOME, 'bin')
    const launcherScript = join(binDir, `claude-${id}`)
    const hasLauncher = await fileExists(launcherScript)

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

      if (await fileExists(mcpConfig)) {
        args.push('--mcp-config', mcpConfig)
      }

      if (await fileExists(settingsJson)) {
        args.push('--settings', settingsJson)
      }

      if (await fileExists(claudeMd)) {
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
  settings: publicProcedure.query((): Promise<ProfileSettings> => {
    return getProfileSettings()
  }),

  saveSettings: auditedProcedure
    .input(ProfileSettingsSchema)
    .mutation(({ input }): Promise<boolean> => {
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

  toggleRule: auditedProcedure.input(ToggleRuleSchema).mutation(({ input }): Promise<boolean> => {
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
  list: publicProcedure.query((): Promise<ClaudeCodeProfile[]> => {
    return listProfiles()
  }),

  get: publicProcedure
    .input(ProfileIdSchema)
    .query(({ input }): Promise<ClaudeCodeProfile | null> => {
      return getProfile(input.id)
    }),

  create: auditedProcedure
    .input(CreateProfileSchema)
    .mutation(({ input }): Promise<ClaudeCodeProfile | null> => {
      return createProfile({
        name: input.name,
        description: input.description,
        settings: input.settings ?? {},
        claudeMd: input.claudeMd,
        enabledRules: input.enabledRules,
      })
    }),

  update: auditedProcedure.input(UpdateProfileSchema).mutation(({ input }): Promise<boolean> => {
    return updateProfile(input.id, input.updates)
  }),

  delete: auditedProcedure.input(ProfileIdSchema).mutation(({ input }): Promise<boolean> => {
    return deleteProfile(input.id)
  }),

  activate: auditedProcedure.input(ProfileIdSchema).mutation(({ input }): Promise<boolean> => {
    return activateProfile(input.id)
  }),

  deactivate: auditedProcedure.mutation((): Promise<boolean> => {
    return deactivateProfile()
  }),

  getActive: publicProcedure.query((): Promise<string | null> => {
    return getActiveProfileId()
  }),

  launch: auditedProcedure
    .input(LaunchProfileSchema)
    .mutation(({ input }): Promise<{ success: boolean; error?: string }> => {
      return launchProfile(input.id, input.projectPath)
    }),
})
