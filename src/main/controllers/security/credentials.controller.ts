/**
 * Credentials Controller
 *
 * Type-safe tRPC controller for secure credential management.
 * Uses Electron's safeStorage for OS-level encryption.
 *
 * Migrated from handlers.ts (7 handlers):
 * - credentials:store
 * - credentials:retrieve
 * - credentials:delete
 * - credentials:has
 * - credentials:list
 * - credentials:isEncryptionAvailable
 *
 * @module credentials.controller
 */

import { z } from 'zod'
import { router, publicProcedure, auditedProcedure } from '../../trpc/trpc'
import { credentialService } from '../../services/credentials'

// ============================================================================
// Schemas
// ============================================================================

const CredentialKeySchema = z.object({
  key: z
    .string()
    .min(1, 'Key cannot be empty')
    .max(100, 'Key cannot exceed 100 characters')
    .regex(
      /^[a-zA-Z0-9._-]+$/,
      'Key can only contain alphanumeric characters, dots, dashes, and underscores'
    ),
})

const SetCredentialSchema = z.object({
  key: z
    .string()
    .min(1, 'Key cannot be empty')
    .max(100, 'Key cannot exceed 100 characters')
    .regex(
      /^[a-zA-Z0-9._-]+$/,
      'Key can only contain alphanumeric characters, dots, dashes, and underscores'
    ),
  value: z.string().min(1, 'Value cannot be empty'),
})

// ============================================================================
// Router
// ============================================================================

export const credentialsRouter = router({
  /**
   * Store a credential securely
   * Uses OS keychain encryption via Electron's safeStorage
   */
  store: auditedProcedure.input(SetCredentialSchema).mutation(({ input }): boolean => {
    return credentialService.set(input.key, input.value)
  }),

  /**
   * Retrieve a stored credential
   * Returns null if not found
   */
  retrieve: publicProcedure.input(CredentialKeySchema).query(({ input }): string | null => {
    return credentialService.retrieve(input.key)
  }),

  /**
   * Delete a credential
   */
  delete: auditedProcedure.input(CredentialKeySchema).mutation(({ input }): boolean => {
    credentialService.delete(input.key)
    return true
  }),

  /**
   * Check if a credential exists
   */
  has: publicProcedure.input(CredentialKeySchema).query(({ input }): boolean => {
    return credentialService.has(input.key)
  }),

  /**
   * List all stored credential keys (not values)
   */
  list: publicProcedure.query((): string[] => {
    return credentialService.listKeys()
  }),

  /**
   * Check if OS-level encryption is available
   * On Linux, requires libsecret (gnome-keyring, kwallet, etc.)
   */
  isEncryptionAvailable: publicProcedure.query((): boolean => {
    return credentialService.isEncryptionAvailable()
  }),
})
