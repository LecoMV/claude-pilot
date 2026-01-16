// Credential Service - Secure storage using Electron's safeStorage API
// Provides OS-level encryption for sensitive credentials

import { safeStorage } from 'electron'
import Store from 'electron-store'

// Credential keys - type-safe key management
export type CredentialKey =
  | 'postgresql.password'
  | 'memgraph.password'
  | 'qdrant.apiKey'
  | 'anthropic.apiKey'
  | 'github.token'
  | string // Allow custom keys

interface EncryptedStore {
  credentials: Record<string, string> // hex-encoded encrypted values
  encryptionAvailable: boolean
}

class CredentialService {
  private store: Store<EncryptedStore>
  private encryptionAvailable: boolean = false
  private initialized: boolean = false

  constructor() {
    this.store = new Store<EncryptedStore>({
      name: 'credentials',
      defaults: {
        credentials: {},
        encryptionAvailable: false,
      },
    })
  }

  /**
   * Initialize the credential service
   * Must be called after app.whenReady() in Electron
   */
  initialize(): boolean {
    if (this.initialized) return this.encryptionAvailable

    // Check if OS-level encryption is available
    // On Linux, requires libsecret (gnome-keyring, kwallet, or secret-service)
    this.encryptionAvailable = safeStorage.isEncryptionAvailable()
    this.store.set('encryptionAvailable', this.encryptionAvailable)

    if (!this.encryptionAvailable) {
      console.warn(
        '[Credentials] OS-level encryption not available.',
        'On Linux, ensure libsecret is installed: sudo apt install libsecret-1-dev'
      )
    } else {
      console.log('[Credentials] Encryption available via OS keychain')
    }

    this.initialized = true
    return this.encryptionAvailable
  }

  /**
   * Store a credential securely
   * Returns true if stored encrypted, false if stored in plaintext (warning)
   */
  store(key: CredentialKey, value: string): boolean {
    if (!this.initialized) {
      throw new Error('CredentialService not initialized. Call initialize() first.')
    }

    if (!value) {
      // Empty values are stored as empty (deletion)
      const credentials = this.store.get('credentials', {})
      delete credentials[key]
      this.store.set('credentials', credentials)
      return true
    }

    if (!this.encryptionAvailable) {
      // Store in plaintext with warning - not recommended for production
      console.warn(`[Credentials] Storing ${key} without encryption (insecure)`)
      const credentials = this.store.get('credentials', {})
      credentials[key] = `plain:${Buffer.from(value, 'utf-8').toString('hex')}`
      this.store.set('credentials', credentials)
      return false
    }

    try {
      // Encrypt using OS keychain
      const encrypted = safeStorage.encryptString(value)
      const hexEncrypted = `enc:${encrypted.toString('hex')}`

      const credentials = this.store.get('credentials', {})
      credentials[key] = hexEncrypted
      this.store.set('credentials', credentials)

      console.log(`[Credentials] Stored ${key} securely`)
      return true
    } catch (error) {
      console.error(`[Credentials] Failed to encrypt ${key}:`, error)
      throw error
    }
  }

  /**
   * Retrieve a credential
   * Returns null if not found, decrypted value if encrypted
   */
  retrieve(key: CredentialKey): string | null {
    if (!this.initialized) {
      throw new Error('CredentialService not initialized. Call initialize() first.')
    }

    const credentials = this.store.get('credentials', {})
    const stored = credentials[key]

    if (!stored) return null

    try {
      if (stored.startsWith('enc:')) {
        // Encrypted value - decrypt
        if (!this.encryptionAvailable) {
          console.error(`[Credentials] Cannot decrypt ${key} - encryption not available`)
          return null
        }

        const hexData = stored.slice(4)
        const buffer = Buffer.from(hexData, 'hex')
        return safeStorage.decryptString(buffer)
      } else if (stored.startsWith('plain:')) {
        // Plaintext fallback value
        console.warn(`[Credentials] Retrieving ${key} from insecure storage`)
        const hexData = stored.slice(6)
        return Buffer.from(hexData, 'hex').toString('utf-8')
      } else {
        // Legacy format - treat as plaintext hex
        return Buffer.from(stored, 'hex').toString('utf-8')
      }
    } catch (error) {
      console.error(`[Credentials] Failed to retrieve ${key}:`, error)
      return null
    }
  }

  /**
   * Delete a credential
   */
  delete(key: CredentialKey): void {
    if (!this.initialized) {
      throw new Error('CredentialService not initialized. Call initialize() first.')
    }

    const credentials = this.store.get('credentials', {})
    delete credentials[key]
    this.store.set('credentials', credentials)
    console.log(`[Credentials] Deleted ${key}`)
  }

  /**
   * Check if a credential exists
   */
  has(key: CredentialKey): boolean {
    if (!this.initialized) return false

    const credentials = this.store.get('credentials', {})
    return key in credentials && !!credentials[key]
  }

  /**
   * List all stored credential keys (not values!)
   */
  listKeys(): CredentialKey[] {
    if (!this.initialized) return []

    const credentials = this.store.get('credentials', {})
    return Object.keys(credentials) as CredentialKey[]
  }

  /**
   * Check if encryption is available
   */
  isEncryptionAvailable(): boolean {
    return this.encryptionAvailable
  }

  /**
   * Migrate credentials from environment variables to secure storage
   * Call this during app startup to migrate legacy credentials
   */
  migrateFromEnv(envMappings: Record<string, CredentialKey>): void {
    if (!this.initialized) {
      throw new Error('CredentialService not initialized. Call initialize() first.')
    }

    for (const [envVar, credKey] of Object.entries(envMappings)) {
      const value = process.env[envVar]
      if (value && !this.has(credKey)) {
        console.log(`[Credentials] Migrating ${envVar} to secure storage`)
        this.store(credKey, value)
      }
    }
  }

  /**
   * Get a credential for use in database connections
   * Falls back to environment variable if not in secure storage
   */
  getWithFallback(key: CredentialKey, envVar: string): string | undefined {
    const stored = this.retrieve(key)
    if (stored) return stored

    const envValue = process.env[envVar]
    if (envValue) {
      console.log(`[Credentials] Using ${envVar} from environment (consider migrating to secure storage)`)
      return envValue
    }

    return undefined
  }
}

// Export singleton instance
export const credentialService = new CredentialService()

// Export class for testing
export { CredentialService }
