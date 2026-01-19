/**
 * Credentials Service Tests
 *
 * Comprehensive tests for the CredentialService that provides secure
 * credential storage using Electron's safeStorage API.
 *
 * Tests all public methods: initialize, set, retrieve, delete, has,
 * listKeys, isEncryptionAvailable, migrateFromEnv, getWithFallback
 *
 * @module credentials.test
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest'

// Mock store data storage
const mockStoreData: { credentials: Record<string, string>; encryptionAvailable: boolean } = {
  credentials: {},
  encryptionAvailable: false,
}

// Create mock store instance
const createMockStore = () => ({
  get: (key: string, defaultVal?: unknown) => {
    if (key === 'credentials') return { ...mockStoreData.credentials }
    if (key === 'encryptionAvailable') return mockStoreData.encryptionAvailable
    return defaultVal
  },
  set: (key: string, value: unknown) => {
    if (key === 'credentials') {
      mockStoreData.credentials = value as Record<string, string>
    } else if (key === 'encryptionAvailable') {
      mockStoreData.encryptionAvailable = value as boolean
    }
  },
})

// Mock safeStorage
const _mockSafeStorage = {
  isEncryptionAvailable: vi.fn(),
  encryptString: vi.fn(),
  decryptString: vi.fn(),
}

// Setup mocks before module imports
vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: vi.fn(),
    encryptString: vi.fn(),
    decryptString: vi.fn(),
  },
}))

vi.mock('electron-store', () => ({
  default: vi.fn(() => createMockStore()),
}))

describe('CredentialService', () => {
  // Dynamically import the module to get fresh instances
  let CredentialService: typeof import('../credentials').CredentialService
  let service: InstanceType<typeof CredentialService>
  let safeStorage: typeof import('electron').safeStorage

  beforeAll(async () => {
    // Import the module after mocks are set up
    const credentialsModule = await import('../credentials')
    CredentialService = credentialsModule.CredentialService

    const electronModule = await import('electron')
    safeStorage = electronModule.safeStorage
  })

  beforeEach(() => {
    vi.clearAllMocks()
    // Reset mock store data
    mockStoreData.credentials = {}
    mockStoreData.encryptionAvailable = false
    // Create fresh service instance
    service = new CredentialService()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ===========================================================================
  // INITIALIZATION
  // ===========================================================================
  describe('initialize', () => {
    it('should return true when encryption is available', () => {
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(true)

      const result = service.initialize()

      expect(result).toBe(true)
      expect(service.isEncryptionAvailable()).toBe(true)
    })

    it('should return false when encryption is not available', () => {
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(false)

      const result = service.initialize()

      expect(result).toBe(false)
      expect(service.isEncryptionAvailable()).toBe(false)
    })

    it('should not reinitialize if already initialized', () => {
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(true)

      service.initialize()
      vi.clearAllMocks()
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(false)

      const result = service.initialize()

      expect(result).toBe(true) // Returns cached value
      expect(safeStorage.isEncryptionAvailable).not.toHaveBeenCalled()
    })

    it('should log warning when encryption is not available', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(false)

      service.initialize()

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('encryption not available'),
        expect.any(String)
      )
      consoleSpy.mockRestore()
    })

    it('should log info when encryption is available', () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(true)

      service.initialize()

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Encryption available')
      )
      consoleSpy.mockRestore()
    })
  })

  // ===========================================================================
  // SET CREDENTIAL
  // ===========================================================================
  describe('set', () => {
    it('should throw error if not initialized', () => {
      expect(() => service.set('test.key', 'value')).toThrow(
        'CredentialService not initialized'
      )
    })

    it('should encrypt and store credential when encryption is available', () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(true)
      vi.mocked(safeStorage.encryptString).mockReturnValue(Buffer.from('encrypted_data'))

      service.initialize()
      const result = service.set('postgresql.password', 'secret123')

      expect(result).toBe(true)
      expect(safeStorage.encryptString).toHaveBeenCalledWith('secret123')
      expect(mockStoreData.credentials['postgresql.password']).toMatch(/^enc:/)
      consoleSpy.mockRestore()
    })

    it('should store in plaintext when encryption is not available', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(false)

      service.initialize()
      const result = service.set('test.key', 'plaintext_value')

      expect(result).toBe(false)
      expect(mockStoreData.credentials['test.key']).toMatch(/^plain:/)
      consoleSpy.mockRestore()
    })

    it('should delete credential when value is empty', () => {
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(true)
      mockStoreData.credentials['test.key'] = 'enc:existing'

      service.initialize()
      const result = service.set('test.key', '')

      expect(result).toBe(true)
      expect(mockStoreData.credentials['test.key']).toBeUndefined()
    })

    it('should handle encryption errors', () => {
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(true)
      vi.mocked(safeStorage.encryptString).mockImplementation(() => {
        throw new Error('Encryption failed')
      })

      service.initialize()

      expect(() => service.set('test.key', 'value')).toThrow('Encryption failed')
    })

    it('should preserve existing credentials when adding new ones', () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(true)
      vi.mocked(safeStorage.encryptString).mockReturnValue(Buffer.from('new_encrypted'))
      mockStoreData.credentials['existing'] = 'enc:old_data'

      service.initialize()
      service.set('new.key', 'new_value')

      expect(mockStoreData.credentials['existing']).toBe('enc:old_data')
      expect(mockStoreData.credentials['new.key']).toBeDefined()
      consoleSpy.mockRestore()
    })
  })

  // ===========================================================================
  // RETRIEVE CREDENTIAL
  // ===========================================================================
  describe('retrieve', () => {
    it('should throw error if not initialized', () => {
      expect(() => service.retrieve('test.key')).toThrow(
        'CredentialService not initialized'
      )
    })

    it('should return null for non-existent credential', () => {
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(true)

      service.initialize()
      const result = service.retrieve('nonexistent.key')

      expect(result).toBeNull()
    })

    it('should decrypt encrypted credential', () => {
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(true)
      vi.mocked(safeStorage.decryptString).mockReturnValue('decrypted_secret')
      const encryptedHex = Buffer.from('encrypted_data').toString('hex')
      mockStoreData.credentials['test.key'] = `enc:${encryptedHex}`

      service.initialize()
      const result = service.retrieve('test.key')

      expect(result).toBe('decrypted_secret')
      expect(safeStorage.decryptString).toHaveBeenCalled()
    })

    it('should retrieve plaintext credential with warning', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(false)
      const plainHex = Buffer.from('plain_secret', 'utf-8').toString('hex')
      mockStoreData.credentials['test.key'] = `plain:${plainHex}`

      service.initialize()
      const result = service.retrieve('test.key')

      expect(result).toBe('plain_secret')
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('insecure storage')
      )
      consoleSpy.mockRestore()
    })

    it('should return null when cannot decrypt without encryption available', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(false)
      mockStoreData.credentials['test.key'] = 'enc:someencrypteddata'

      service.initialize()
      const result = service.retrieve('test.key')

      expect(result).toBeNull()
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Cannot decrypt')
      )
      consoleSpy.mockRestore()
    })

    it('should handle legacy format (hex without prefix)', () => {
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(true)
      const legacyHex = Buffer.from('legacy_value', 'utf-8').toString('hex')
      mockStoreData.credentials['legacy.key'] = legacyHex

      service.initialize()
      const result = service.retrieve('legacy.key')

      expect(result).toBe('legacy_value')
    })

    it('should handle decryption errors gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(true)
      vi.mocked(safeStorage.decryptString).mockImplementation(() => {
        throw new Error('Decryption failed')
      })
      mockStoreData.credentials['test.key'] = 'enc:invaliddata'

      service.initialize()
      const result = service.retrieve('test.key')

      expect(result).toBeNull()
      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })
  })

  // ===========================================================================
  // DELETE CREDENTIAL
  // ===========================================================================
  describe('delete', () => {
    it('should throw error if not initialized', () => {
      expect(() => service.delete('test.key')).toThrow(
        'CredentialService not initialized'
      )
    })

    it('should delete existing credential', () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(true)
      mockStoreData.credentials['test.key'] = 'enc:somedata'
      mockStoreData.credentials['other.key'] = 'enc:otherdata'

      service.initialize()
      service.delete('test.key')

      expect(mockStoreData.credentials['test.key']).toBeUndefined()
      expect(mockStoreData.credentials['other.key']).toBe('enc:otherdata')
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Deleted test.key')
      )
      consoleSpy.mockRestore()
    })

    it('should handle deleting non-existent credential', () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(true)

      service.initialize()

      // Should not throw
      expect(() => service.delete('nonexistent.key')).not.toThrow()
      consoleSpy.mockRestore()
    })
  })

  // ===========================================================================
  // HAS CREDENTIAL
  // ===========================================================================
  describe('has', () => {
    it('should return false if not initialized', () => {
      const result = service.has('test.key')

      expect(result).toBe(false)
    })

    it('should return true for existing credential', () => {
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(true)
      mockStoreData.credentials['test.key'] = 'enc:somedata'

      service.initialize()
      const result = service.has('test.key')

      expect(result).toBe(true)
    })

    it('should return false for non-existent credential', () => {
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(true)

      service.initialize()
      const result = service.has('nonexistent.key')

      expect(result).toBe(false)
    })

    it('should return false for empty string credential', () => {
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(true)
      mockStoreData.credentials['empty.key'] = ''

      service.initialize()
      const result = service.has('empty.key')

      expect(result).toBe(false)
    })
  })

  // ===========================================================================
  // LIST KEYS
  // ===========================================================================
  describe('listKeys', () => {
    it('should return empty array if not initialized', () => {
      const result = service.listKeys()

      expect(result).toEqual([])
    })

    it('should return all stored credential keys', () => {
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(true)
      mockStoreData.credentials = {
        'postgresql.password': 'enc:data1',
        'memgraph.password': 'enc:data2',
        'github.token': 'enc:data3',
      }

      service.initialize()
      const result = service.listKeys()

      expect(result).toHaveLength(3)
      expect(result).toContain('postgresql.password')
      expect(result).toContain('memgraph.password')
      expect(result).toContain('github.token')
    })

    it('should return empty array when no credentials stored', () => {
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(true)

      service.initialize()
      const result = service.listKeys()

      expect(result).toEqual([])
    })
  })

  // ===========================================================================
  // IS ENCRYPTION AVAILABLE
  // ===========================================================================
  describe('isEncryptionAvailable', () => {
    it('should return false before initialization', () => {
      expect(service.isEncryptionAvailable()).toBe(false)
    })

    it('should return true after initialization when encryption is available', () => {
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(true)

      service.initialize()

      expect(service.isEncryptionAvailable()).toBe(true)
    })

    it('should return false after initialization when encryption is not available', () => {
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(false)

      service.initialize()

      expect(service.isEncryptionAvailable()).toBe(false)
    })
  })

  // ===========================================================================
  // MIGRATE FROM ENV
  // ===========================================================================
  describe('migrateFromEnv', () => {
    const originalEnv = process.env

    beforeEach(() => {
      process.env = { ...originalEnv }
    })

    afterEach(() => {
      process.env = originalEnv
    })

    it('should throw error if not initialized', () => {
      expect(() =>
        service.migrateFromEnv({ TEST_VAR: 'test.key' })
      ).toThrow('CredentialService not initialized')
    })

    it('should migrate credentials from environment variables', () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(true)
      vi.mocked(safeStorage.encryptString).mockReturnValue(Buffer.from('encrypted'))
      process.env.MY_SECRET = 'env_secret_value'

      service.initialize()
      service.migrateFromEnv({ MY_SECRET: 'migrated.secret' })

      expect(mockStoreData.credentials['migrated.secret']).toBeDefined()
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Migrating MY_SECRET')
      )
      consoleSpy.mockRestore()
    })

    it('should not migrate if credential already exists', () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(true)
      mockStoreData.credentials['existing.key'] = 'enc:alreadythere'
      process.env.MY_SECRET = 'env_value'

      service.initialize()
      const initialValue = mockStoreData.credentials['existing.key']
      service.migrateFromEnv({ MY_SECRET: 'existing.key' })

      // Value should remain unchanged
      expect(mockStoreData.credentials['existing.key']).toBe(initialValue)
      consoleSpy.mockRestore()
    })

    it('should not migrate if env variable is empty', () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(true)
      process.env.EMPTY_VAR = ''

      service.initialize()
      service.migrateFromEnv({ EMPTY_VAR: 'should.not.exist' })

      expect(mockStoreData.credentials['should.not.exist']).toBeUndefined()
      consoleSpy.mockRestore()
    })

    it('should migrate multiple credentials', () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(true)
      vi.mocked(safeStorage.encryptString).mockReturnValue(Buffer.from('enc'))
      process.env.VAR1 = 'value1'
      process.env.VAR2 = 'value2'

      service.initialize()
      service.migrateFromEnv({
        VAR1: 'key1',
        VAR2: 'key2',
      })

      expect(mockStoreData.credentials['key1']).toBeDefined()
      expect(mockStoreData.credentials['key2']).toBeDefined()
      consoleSpy.mockRestore()
    })
  })

  // ===========================================================================
  // GET WITH FALLBACK
  // ===========================================================================
  describe('getWithFallback', () => {
    const originalEnv = process.env

    beforeEach(() => {
      process.env = { ...originalEnv }
    })

    afterEach(() => {
      process.env = originalEnv
    })

    it('should return stored credential if available', () => {
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(true)
      vi.mocked(safeStorage.decryptString).mockReturnValue('stored_secret')
      const hex = Buffer.from('encrypted').toString('hex')
      mockStoreData.credentials['postgresql.password'] = `enc:${hex}`
      process.env.FALLBACK_VAR = 'env_fallback'

      service.initialize()
      const result = service.getWithFallback('postgresql.password', 'FALLBACK_VAR')

      expect(result).toBe('stored_secret')
    })

    it('should return env variable when credential not stored', () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(true)
      process.env.MY_ENV_VAR = 'env_secret'

      service.initialize()
      const result = service.getWithFallback('nonexistent.key', 'MY_ENV_VAR')

      expect(result).toBe('env_secret')
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Using MY_ENV_VAR from environment')
      )
      consoleSpy.mockRestore()
    })

    it('should return undefined when neither credential nor env var exists', () => {
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(true)
      delete process.env.NONEXISTENT_VAR

      service.initialize()
      const result = service.getWithFallback('missing.key', 'NONEXISTENT_VAR')

      expect(result).toBeUndefined()
    })
  })

  // ===========================================================================
  // SECURITY TESTS
  // ===========================================================================
  describe('security', () => {
    it('should not expose raw encrypted values in listKeys', () => {
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(true)
      mockStoreData.credentials['secret.key'] = 'enc:supersecretencrypteddata'

      service.initialize()
      const keys = service.listKeys()

      // Keys should only contain key names, not values
      expect(keys).toEqual(['secret.key'])
      expect(keys.join('')).not.toContain('supersecret')
    })

    it('should store credentials with type prefix', () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(true)
      vi.mocked(safeStorage.encryptString).mockReturnValue(Buffer.from('data'))

      service.initialize()
      service.set('test.key', 'value')

      expect(mockStoreData.credentials['test.key']).toMatch(/^enc:/)
      consoleSpy.mockRestore()
    })
  })

  // ===========================================================================
  // EDGE CASES
  // ===========================================================================
  describe('edge cases', () => {
    it('should handle special characters in credential values', () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(true)
      vi.mocked(safeStorage.encryptString).mockReturnValue(Buffer.from('encrypted'))

      service.initialize()
      service.set('special.key', 'p@$$w0rd!@#$%^&*()')

      expect(safeStorage.encryptString).toHaveBeenCalledWith('p@$$w0rd!@#$%^&*()')
      consoleSpy.mockRestore()
    })

    it('should handle unicode in credential values', () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(true)
      vi.mocked(safeStorage.encryptString).mockReturnValue(Buffer.from('encrypted'))

      service.initialize()
      service.set('unicode.key', '\u4f60\u597d\u4e16\u754c')

      expect(safeStorage.encryptString).toHaveBeenCalledWith('\u4f60\u597d\u4e16\u754c')
      consoleSpy.mockRestore()
    })

    it('should handle very long credential values', () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(true)
      vi.mocked(safeStorage.encryptString).mockReturnValue(Buffer.from('encrypted'))

      const longValue = 'a'.repeat(10000)

      service.initialize()
      service.set('long.key', longValue)

      expect(safeStorage.encryptString).toHaveBeenCalledWith(longValue)
      consoleSpy.mockRestore()
    })

    it('should handle credential key with dots and dashes', () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(true)
      vi.mocked(safeStorage.encryptString).mockReturnValue(Buffer.from('enc'))

      service.initialize()

      // Should not throw
      expect(() => service.set('my-service.api-key.v2', 'value')).not.toThrow()
      consoleSpy.mockRestore()
    })
  })
})
