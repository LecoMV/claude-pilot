/**
 * Ollama Controller
 *
 * Type-safe tRPC controller for Ollama model management.
 * Manages local LLM models for embeddings and inference.
 *
 * Migrated from handlers.ts (7 handlers):
 * - ollama:status
 * - ollama:list
 * - ollama:running
 * - ollama:pull
 * - ollama:delete
 * - ollama:run
 * - ollama:stop
 *
 * @module ollama.controller
 */

import { z } from 'zod'
import { router, publicProcedure, auditedProcedure } from '../../trpc/trpc'
import { spawnAsync } from '../../utils/spawn-async'
import type { OllamaStatus, OllamaModel, OllamaRunningModel } from '../../../shared/types'

// ============================================================================
// Constants
// ============================================================================

const OLLAMA_API = 'http://localhost:11434'

// ============================================================================
// Schemas
// ============================================================================

const ModelNameSchema = z.object({
  model: z
    .string()
    .min(1, 'Model name cannot be empty')
    .max(200, 'Model name cannot exceed 200 characters')
    .regex(
      /^[a-zA-Z0-9._:/-]+$/,
      'Model name can only contain alphanumeric characters, dots, colons, dashes, underscores, and slashes'
    ),
})

// ============================================================================
// Internal Functions
// ============================================================================

/**
 * Sanitize model name to prevent injection attacks
 */
function sanitizeModelName(model: string): string {
  return model.replace(/[^a-zA-Z0-9._:/-]/g, '')
}

/**
 * Get Ollama service status
 */
async function getOllamaStatus(): Promise<OllamaStatus> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)
    const response = await fetch(`${OLLAMA_API}/api/version`, { signal: controller.signal })
    clearTimeout(timeout)
    if (!response.ok) return { online: false }
    const data = (await response.json()) as { version: string }
    return { online: true, version: data.version }
  } catch {
    return { online: false }
  }
}

/**
 * Get list of installed Ollama models
 */
async function getOllamaModels(): Promise<OllamaModel[]> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    const response = await fetch(`${OLLAMA_API}/api/tags`, { signal: controller.signal })
    clearTimeout(timeout)
    if (!response.ok) return []
    const data = (await response.json()) as {
      models?: Array<{
        name: string
        size: number
        digest: string
        modified_at: string
        details?: {
          format?: string
          family?: string
          parameter_size?: string
          quantization_level?: string
        }
      }>
    }
    if (!data.models) return []

    return data.models.map((m) => ({
      name: m.name,
      size: m.size,
      digest: m.digest,
      modifiedAt: m.modified_at,
      details: m.details
        ? {
            format: m.details.format,
            family: m.details.family,
            parameterSize: m.details.parameter_size,
            quantizationLevel: m.details.quantization_level,
          }
        : undefined,
    }))
  } catch {
    return []
  }
}

/**
 * Get list of currently running models
 */
async function getRunningModels(): Promise<OllamaRunningModel[]> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    const response = await fetch(`${OLLAMA_API}/api/ps`, { signal: controller.signal })
    clearTimeout(timeout)
    if (!response.ok) return []
    const data = (await response.json()) as {
      models?: Array<{
        name: string
        model: string
        size: number
        digest: string
        expires_at: string
      }>
    }
    if (!data.models) return []

    return data.models.map((m) => ({
      name: m.name,
      model: m.model,
      size: m.size,
      digest: m.digest,
      expiresAt: m.expires_at,
    }))
  } catch {
    return []
  }
}

/**
 * Pull a model from Ollama registry
 */
async function pullOllamaModel(model: string): Promise<boolean> {
  try {
    const safeModel = sanitizeModelName(model)
    if (!safeModel) {
      console.error('[ollama] Invalid model name:', model)
      return false
    }
    // Use spawnAsync with args array (SECURITY: no shell, 10 minute timeout)
    await spawnAsync('ollama', ['pull', safeModel], { timeout: 600000 })
    return true
  } catch (error) {
    console.error('[ollama] Failed to pull model:', error)
    return false
  }
}

/**
 * Delete a model from local storage
 */
async function deleteOllamaModel(model: string): Promise<boolean> {
  try {
    const safeModel = sanitizeModelName(model)
    if (!safeModel) {
      console.error('[ollama] Invalid model name:', model)
      return false
    }
    // Use spawnAsync with args array (SECURITY: no shell)
    await spawnAsync('ollama', ['rm', safeModel], { timeout: 30000 })
    return true
  } catch (error) {
    console.error('[ollama] Failed to delete model:', error)
    return false
  }
}

/**
 * Load a model into memory for inference
 */
async function runOllamaModel(model: string): Promise<boolean> {
  try {
    const safeModel = sanitizeModelName(model)
    if (!safeModel) {
      console.error('[ollama] Invalid model name:', model)
      return false
    }
    // Use native fetch instead of curl (no shell)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 60000)
    const response = await fetch(`${OLLAMA_API}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: safeModel, keep_alive: '10m' }),
      signal: controller.signal,
    })
    clearTimeout(timeout)
    return response.ok
  } catch (error) {
    console.error('[ollama] Failed to run model:', error)
    return false
  }
}

/**
 * Unload a model from memory
 */
async function stopOllamaModel(model: string): Promise<boolean> {
  try {
    const safeModel = sanitizeModelName(model)
    if (!safeModel) {
      console.error('[ollama] Invalid model name:', model)
      return false
    }
    // Use native fetch instead of curl (no shell)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30000)
    const response = await fetch(`${OLLAMA_API}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: safeModel, keep_alive: 0 }),
      signal: controller.signal,
    })
    clearTimeout(timeout)
    return response.ok
  } catch (error) {
    console.error('[ollama] Failed to stop model:', error)
    return false
  }
}

// ============================================================================
// Router
// ============================================================================

export const ollamaRouter = router({
  /**
   * Get Ollama service status
   */
  status: publicProcedure.query((): Promise<OllamaStatus> => {
    return getOllamaStatus()
  }),

  /**
   * List all installed models
   */
  list: publicProcedure.query((): Promise<OllamaModel[]> => {
    return getOllamaModels()
  }),

  /**
   * List currently running models
   */
  running: publicProcedure.query((): Promise<OllamaRunningModel[]> => {
    return getRunningModels()
  }),

  /**
   * Pull a model from the registry
   * Long-running operation (up to 10 minutes)
   */
  pull: auditedProcedure.input(ModelNameSchema).mutation(({ input }): Promise<boolean> => {
    return pullOllamaModel(input.model)
  }),

  /**
   * Delete a model from local storage
   */
  delete: auditedProcedure.input(ModelNameSchema).mutation(({ input }): Promise<boolean> => {
    return deleteOllamaModel(input.model)
  }),

  /**
   * Load a model into memory for inference
   */
  run: auditedProcedure.input(ModelNameSchema).mutation(({ input }): Promise<boolean> => {
    return runOllamaModel(input.model)
  }),

  /**
   * Unload a model from memory
   */
  stop: auditedProcedure.input(ModelNameSchema).mutation(({ input }): Promise<boolean> => {
    return stopOllamaModel(input.model)
  }),
})
