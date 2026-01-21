/**
 * Credentials Controller Tests
 *
 * Comprehensive tests for the credentials tRPC controller.
 * Tests all 6 procedures: store, retrieve, delete, has, list, isEncryptionAvailable
 *
 * @module credentials.controller.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { credentialsRouter } from '../credentials.controller'
import { credentialService } from '../../../services/credentials'

// Mock the credential service
vi.mock('../../../services/credentials', () => ({
  credentialService: {
    set: vi.fn(),
    retrieve: vi.fn(),
    delete: vi.fn(),
    has: vi.fn(),
    listKeys: vi.fn(),
    isEncryptionAvailable: vi.fn(),
  },
  CredentialService: vi.fn(),
}))

// Create a test caller using createCaller pattern
const createTestCaller = () => credentialsRouter.createCaller({})

describe('credentials.controller', () => {
  let caller: ReturnType<typeof createTestCaller>

  beforeEach(() => {
    vi.clearAllMocks()
    caller = createTestCaller()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ===========================================================================
  // STORE PROCEDURE
  // ===========================================================================
  describe('store', () => {
    it('should store credential successfully with encryption', async () => {
      vi.mocked(credentialService.set).mockReturnValue(true)

      const result = await caller.store({
        key: 'github.token',
        value: 'ghp_xxxxxxxxxxxxxxxxxxxx',
      })

      expect(result).toEqual({ success: true })
      expect(credentialService.set).toHaveBeenCalledWith('github.token', 'ghp_xxxxxxxxxxxxxxxxxxxx')
    })

    it('should throw when storing fails (encryption not available)', async () => {
      vi.mocked(credentialService.set).mockReturnValue(false)

      await expect(caller.store({ key: 'test.key', value: 'test-value' })).rejects.toThrow(
        /Failed to store credential/
      )
    })

    it('should reject empty key', async () => {
      await expect(caller.store({ key: '', value: 'test-value' })).rejects.toThrow()
    })

    it('should reject empty value', async () => {
      await expect(caller.store({ key: 'test.key', value: '' })).rejects.toThrow()
    })

    it('should reject key exceeding 100 characters', async () => {
      const longKey = 'a'.repeat(101)

      await expect(caller.store({ key: longKey, value: 'test-value' })).rejects.toThrow()
    })

    it('should reject key with invalid characters', async () => {
      await expect(caller.store({ key: 'invalid/key', value: 'test-value' })).rejects.toThrow()

      await expect(caller.store({ key: 'invalid key', value: 'test-value' })).rejects.toThrow()

      await expect(caller.store({ key: 'invalid@key', value: 'test-value' })).rejects.toThrow()
    })

    it('should accept valid key formats', async () => {
      vi.mocked(credentialService.set).mockReturnValue(true)

      // Alphanumeric
      await expect(caller.store({ key: 'testkey123', value: 'v' })).resolves.toEqual({
        success: true,
      })

      // With dots
      await expect(caller.store({ key: 'test.key.name', value: 'v' })).resolves.toEqual({
        success: true,
      })

      // With dashes
      await expect(caller.store({ key: 'test-key-name', value: 'v' })).resolves.toEqual({
        success: true,
      })

      // With underscores
      await expect(caller.store({ key: 'test_key_name', value: 'v' })).resolves.toEqual({
        success: true,
      })

      // Mixed
      await expect(caller.store({ key: 'test.key-name_123', value: 'v' })).resolves.toEqual({
        success: true,
      })
    })

    it('should propagate service errors', async () => {
      vi.mocked(credentialService.set).mockImplementation(() => {
        throw new Error('Encryption failed')
      })

      await expect(caller.store({ key: 'test.key', value: 'test-value' })).rejects.toThrow(
        'Encryption failed'
      )
    })
  })

  // ===========================================================================
  // RETRIEVE PROCEDURE
  // ===========================================================================
  describe('retrieve', () => {
    it('should retrieve existing credential', async () => {
      vi.mocked(credentialService.retrieve).mockReturnValue('my-secret-value')

      const result = await caller.retrieve({ key: 'github.token' })

      expect(result).toEqual({ value: 'my-secret-value' })
      expect(credentialService.retrieve).toHaveBeenCalledWith('github.token')
    })

    it('should return null value for non-existent credential', async () => {
      vi.mocked(credentialService.retrieve).mockReturnValue(null)

      const result = await caller.retrieve({ key: 'nonexistent.key' })

      expect(result).toEqual({ value: null })
    })

    it('should reject invalid key format', async () => {
      await expect(caller.retrieve({ key: 'invalid/key' })).rejects.toThrow()
    })

    it('should propagate retrieval errors', async () => {
      vi.mocked(credentialService.retrieve).mockImplementation(() => {
        throw new Error('Decryption failed')
      })

      await expect(caller.retrieve({ key: 'test.key' })).rejects.toThrow('Decryption failed')
    })
  })

  // ===========================================================================
  // DELETE PROCEDURE
  // ===========================================================================
  describe('delete', () => {
    it('should delete credential successfully', async () => {
      vi.mocked(credentialService.delete).mockReturnValue(undefined)

      const result = await caller.delete({ key: 'github.token' })

      expect(result).toEqual({ success: true })
      expect(credentialService.delete).toHaveBeenCalledWith('github.token')
    })

    it('should reject invalid key format', async () => {
      await expect(caller.delete({ key: 'invalid@key' })).rejects.toThrow()
    })

    it('should propagate deletion errors', async () => {
      vi.mocked(credentialService.delete).mockImplementation(() => {
        throw new Error('Service not initialized')
      })

      await expect(caller.delete({ key: 'test.key' })).rejects.toThrow('Service not initialized')
    })
  })

  // ===========================================================================
  // HAS PROCEDURE
  // ===========================================================================
  describe('has', () => {
    it('should return true when credential exists', async () => {
      vi.mocked(credentialService.has).mockReturnValue(true)

      const result = await caller.has({ key: 'github.token' })

      expect(result).toBe(true)
      expect(credentialService.has).toHaveBeenCalledWith('github.token')
    })

    it('should return false when credential does not exist', async () => {
      vi.mocked(credentialService.has).mockReturnValue(false)

      const result = await caller.has({ key: 'nonexistent.key' })

      expect(result).toBe(false)
    })

    it('should reject invalid key format', async () => {
      await expect(caller.has({ key: '' })).rejects.toThrow()
    })
  })

  // ===========================================================================
  // LIST PROCEDURE
  // ===========================================================================
  describe('list', () => {
    it('should return empty array when no credentials', async () => {
      vi.mocked(credentialService.listKeys).mockReturnValue([])

      const result = await caller.list()

      expect(result).toEqual([])
    })

    it('should return all credential keys', async () => {
      const mockKeys = ['github.token', 'anthropic.apiKey', 'postgresql.password']
      vi.mocked(credentialService.listKeys).mockReturnValue(mockKeys)

      const result = await caller.list()

      expect(result).toEqual(mockKeys)
      expect(result).toHaveLength(3)
    })

    it('should not return credential values', async () => {
      vi.mocked(credentialService.listKeys).mockReturnValue(['secret.key'])
      vi.mocked(credentialService.retrieve).mockReturnValue('super-secret-value')

      const result = await caller.list()

      // Only keys, no values
      expect(result).toEqual(['secret.key'])
      expect(credentialService.retrieve).not.toHaveBeenCalled()
    })
  })

  // ===========================================================================
  // IS ENCRYPTION AVAILABLE PROCEDURE
  // ===========================================================================
  describe('isEncryptionAvailable', () => {
    it('should return true when encryption is available', async () => {
      vi.mocked(credentialService.isEncryptionAvailable).mockReturnValue(true)

      const result = await caller.isEncryptionAvailable()

      expect(result).toBe(true)
    })

    it('should return false when encryption is not available', async () => {
      vi.mocked(credentialService.isEncryptionAvailable).mockReturnValue(false)

      const result = await caller.isEncryptionAvailable()

      expect(result).toBe(false)
    })
  })

  // ===========================================================================
  // INTEGRATION-STYLE TESTS
  // ===========================================================================
  describe('credential lifecycle', () => {
    it('should handle full store-retrieve-delete cycle', async () => {
      // Store
      vi.mocked(credentialService.set).mockReturnValue(true)
      vi.mocked(credentialService.has).mockReturnValue(true)
      vi.mocked(credentialService.retrieve).mockReturnValue('secret-value')
      vi.mocked(credentialService.delete).mockReturnValue(undefined)

      const storeResult = await caller.store({
        key: 'test.credential',
        value: 'secret-value',
      })
      expect(storeResult).toEqual({ success: true })

      // Verify exists
      const hasResult = await caller.has({ key: 'test.credential' })
      expect(hasResult).toBe(true)

      // Retrieve
      const retrieveResult = await caller.retrieve({ key: 'test.credential' })
      expect(retrieveResult).toEqual({ value: 'secret-value' })

      // Delete
      const deleteResult = await caller.delete({ key: 'test.credential' })
      expect(deleteResult).toEqual({ success: true })

      // Verify deleted
      vi.mocked(credentialService.has).mockReturnValue(false)
      const hasAfterDelete = await caller.has({ key: 'test.credential' })
      expect(hasAfterDelete).toBe(false)
    })

    it('should update existing credential', async () => {
      vi.mocked(credentialService.set).mockReturnValue(true)

      // Store initial
      await caller.store({ key: 'api.key', value: 'initial-value' })

      // Update
      await caller.store({ key: 'api.key', value: 'updated-value' })

      expect(credentialService.set).toHaveBeenCalledTimes(2)
      expect(credentialService.set).toHaveBeenLastCalledWith('api.key', 'updated-value')
    })
  })

  // ===========================================================================
  // SECURITY TESTS
  // ===========================================================================
  describe('security', () => {
    it('should not log credential values', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})

      vi.mocked(credentialService.set).mockReturnValue(true)
      vi.mocked(credentialService.retrieve).mockReturnValue('super-secret')

      await caller.store({ key: 'test.key', value: 'super-secret-value' })
      await caller.retrieve({ key: 'test.key' })

      // Check console was not called with the secret value
      const allCalls = [...consoleSpy.mock.calls, ...consoleInfoSpy.mock.calls]
      const hasSecret = allCalls.some((call) =>
        call.some((arg) => typeof arg === 'string' && arg.includes('super-secret'))
      )

      expect(hasSecret).toBe(false)

      consoleSpy.mockRestore()
      consoleInfoSpy.mockRestore()
    })

    it('should reject path traversal attempts in key', async () => {
      // These should all be rejected by the regex validation
      const maliciousKeys = [
        '../etc/passwd',
        '..\\windows\\system32',
        'key/../../../etc/shadow',
        'key%00.null',
      ]

      for (const key of maliciousKeys) {
        await expect(caller.store({ key, value: 'test' })).rejects.toThrow()
      }
    })

    it('should reject shell injection attempts in key', async () => {
      const maliciousKeys = ['key; rm -rf /', 'key | cat /etc/passwd', 'key`whoami`', 'key$(id)']

      for (const key of maliciousKeys) {
        await expect(caller.store({ key, value: 'test' })).rejects.toThrow()
      }
    })
  })
})
