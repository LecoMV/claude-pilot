/**
 * Config Controller - 5-Tier Configuration Management
 *
 * Provides type-safe access to the hierarchical configuration system.
 *
 * @see src/main/services/config/ for core implementation
 */

import { z } from 'zod'
import { router, auditedProcedure, publicProcedure } from '../trpc/trpc'
import {
  getConfigResolver,
  resolveConfig,
  type ResolvedConfig,
  type ConfigDiagnostic,
  type ClaudePilotConfig,
  type ConfigTier,
} from '../services/config'

// ============================================================================
// ZOD SCHEMAS
// ============================================================================

const ConfigPathSchema = z.object({
  path: z.string().min(1),
})

const SetProjectPathSchema = z.object({
  projectPath: z.string().nullable(),
})

const SaveUserConfigSchema = z.object({
  config: z.record(z.unknown()),
})

const SaveProjectConfigSchema = z.object({
  config: z.record(z.unknown()),
})

// ============================================================================
// CONFIG ROUTER
// ============================================================================

export const configRouter = router({
  // ─────────────────────────────────────────────────────────────────────────
  // READ OPERATIONS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get the fully resolved configuration
   */
  resolve: publicProcedure
    .input(z.object({ forceRefresh: z.boolean().optional() }).optional())
    .query(({ input }): ResolvedConfig => {
      return resolveConfig(input?.forceRefresh ?? false)
    }),

  /**
   * Get a specific config value by path
   */
  get: publicProcedure.input(ConfigPathSchema).query(({ input }): unknown => {
    return getConfigResolver().get(input.path)
  }),

  /**
   * Check if a config key is locked by admin policy
   */
  isLocked: publicProcedure.input(ConfigPathSchema).query(({ input }): boolean => {
    return getConfigResolver().isLocked(input.path)
  }),

  /**
   * Get the source tier for a config key
   */
  getSource: publicProcedure.input(ConfigPathSchema).query(({ input }): ConfigTier | undefined => {
    return getConfigResolver().getSource(input.path)
  }),

  /**
   * Get diagnostics for all config keys
   */
  diagnostics: publicProcedure.query((): ConfigDiagnostic[] => {
    return getConfigResolver().getDiagnostics()
  }),

  /**
   * Get config file paths
   */
  paths: publicProcedure.query(() => {
    const resolver = getConfigResolver()
    return {
      user: resolver.getUserConfigPath(),
      system: resolver.getSystemConfigPath(),
      project: resolver.getProjectConfigPath(),
    }
  }),

  /**
   * Get current project path
   */
  projectPath: publicProcedure.query((): string | null => {
    return getConfigResolver().getProjectPath()
  }),

  // ─────────────────────────────────────────────────────────────────────────
  // WRITE OPERATIONS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Set the current project path for project-level config
   */
  setProjectPath: auditedProcedure.input(SetProjectPathSchema).mutation(({ input }): void => {
    getConfigResolver().setProjectPath(input.projectPath)
  }),

  /**
   * Save user preferences
   */
  saveUserConfig: auditedProcedure.input(SaveUserConfigSchema).mutation(({ input }): boolean => {
    return getConfigResolver().saveUserConfig(input.config as Partial<ClaudePilotConfig>)
  }),

  /**
   * Save project configuration
   */
  saveProjectConfig: auditedProcedure
    .input(SaveProjectConfigSchema)
    .mutation(({ input }): boolean => {
      return getConfigResolver().saveProjectConfig(input.config as Partial<ClaudePilotConfig>)
    }),

  /**
   * Invalidate the config cache
   */
  invalidateCache: auditedProcedure.mutation((): void => {
    getConfigResolver().invalidateCache()
  }),
})

export type ConfigRouter = typeof configRouter
