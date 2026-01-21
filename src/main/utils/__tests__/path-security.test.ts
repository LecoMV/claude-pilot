/**
 * Tests for path-security utility module
 * @see SEC-2 Path Traversal Prevention
 */

import { describe, it, expect } from 'vitest'
import { homedir } from 'os'
import { join } from 'path'
import {
  containsTraversal,
  normalizePath,
  isWithinAllowedPaths,
  validatePathSync,
  validatePath,
  sanitizePath,
  safePath,
  createProjectPathSchema,
  SecureProjectPathSchema,
  DEFAULT_ALLOWED_PATHS,
} from '../path-security'

const HOME = homedir()

describe('path-security', () => {
  describe('containsTraversal', () => {
    it('detects Unix traversal sequences', () => {
      expect(containsTraversal('../etc/passwd')).toBe(true)
      expect(containsTraversal('path/../secret')).toBe(true)
      expect(containsTraversal('../../root')).toBe(true)
    })

    it('detects Windows traversal sequences', () => {
      expect(containsTraversal('..\\windows\\system32')).toBe(true)
      expect(containsTraversal('path\\..\\secret')).toBe(true)
    })

    it('detects URL-encoded traversal', () => {
      expect(containsTraversal('%2e%2e/etc/passwd')).toBe(true)
      expect(containsTraversal('%2e%2e%2f..%2f')).toBe(true)
    })

    it('detects double URL-encoded traversal', () => {
      expect(containsTraversal('%252e%252e/etc')).toBe(true)
    })

    it('detects mixed encoding', () => {
      expect(containsTraversal('..%2fpasswd')).toBe(true)
      expect(containsTraversal('..%5cwindows')).toBe(true)
    })

    it('allows safe paths', () => {
      expect(containsTraversal('/home/user/project')).toBe(false)
      expect(containsTraversal('relative/path/file.txt')).toBe(false)
      expect(containsTraversal('./current/dir')).toBe(false)
    })
  })

  describe('normalizePath', () => {
    it('converts relative to absolute', () => {
      const result = normalizePath('relative/path', '/base')
      expect(result).toBe('/base/relative/path')
    })

    it('keeps absolute paths absolute', () => {
      const result = normalizePath('/absolute/path')
      expect(result).toBe('/absolute/path')
    })

    it('normalizes path separators', () => {
      const result = normalizePath('/path//double/slash')
      expect(result).toBe('/path/double/slash')
    })
  })

  describe('isWithinAllowedPaths', () => {
    it('allows paths within home directory', () => {
      expect(isWithinAllowedPaths(join(HOME, 'projects'), [HOME])).toBe(true)
    })

    it('allows exact match of allowed path', () => {
      expect(isWithinAllowedPaths(HOME, [HOME])).toBe(true)
    })

    it('rejects paths outside allowed directories', () => {
      expect(isWithinAllowedPaths('/etc/passwd', [HOME])).toBe(false)
    })

    it('allows /tmp paths when configured', () => {
      expect(isWithinAllowedPaths('/tmp/test', ['/tmp'])).toBe(true)
    })

    it('handles tilde expansion', () => {
      expect(isWithinAllowedPaths(join(HOME, 'file'), ['~'])).toBe(true)
    })
  })

  describe('validatePathSync', () => {
    it('validates paths within home directory', () => {
      const result = validatePathSync(join(HOME, 'projects'))
      expect(result.valid).toBe(true)
      expect(result.canonicalPath).toBeDefined()
    })

    it('rejects traversal attempts', () => {
      // Note: join() normalizes the path, so traversal is caught by "outside allowed" check
      const result = validatePathSync(join(HOME, '../../../etc/passwd'))
      expect(result.valid).toBe(false)
      // The important thing is that the path is rejected
      expect(result.error).toBeDefined()
    })

    it('rejects raw traversal strings', () => {
      // Test with raw string that hasn't been normalized
      const result = validatePathSync('../../../etc/passwd')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('traversal')
    })

    it('rejects paths outside allowed directories', () => {
      const result = validatePathSync('/etc/shadow')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('outside allowed')
    })

    it('rejects empty paths', () => {
      const result = validatePathSync('')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('empty')
    })

    it('rejects paths exceeding max length', () => {
      const longPath = '/a'.repeat(5000)
      const result = validatePathSync(longPath, { maxLength: 4096 })
      expect(result.valid).toBe(false)
      expect(result.error).toContain('maximum length')
    })

    it('enforces absolute paths when configured', () => {
      const result = validatePathSync('relative/path', { absoluteOnly: true })
      expect(result.valid).toBe(false)
      expect(result.error).toContain('must be absolute')
    })

    it('allows custom allowed paths', () => {
      const result = validatePathSync('/custom/path', {
        allowedPaths: ['/custom'],
      })
      expect(result.valid).toBe(true)
    })
  })

  describe('validatePath (async)', () => {
    it('validates existing paths', async () => {
      const result = await validatePath(HOME)
      expect(result.valid).toBe(true)
    })

    it('rejects traversal in async validation', async () => {
      const result = await validatePath('../../../etc/passwd')
      expect(result.valid).toBe(false)
    })

    it('handles mustExist option', async () => {
      const result = await validatePath(join(HOME, 'nonexistent-file-xyz'), {
        mustExist: true,
      })
      expect(result.valid).toBe(false)
      expect(result.error).toContain('does not exist')
    })
  })

  describe('sanitizePath', () => {
    it('removes traversal sequences', () => {
      expect(sanitizePath('../test')).toBe('test')
      expect(sanitizePath('path/../file')).toBe('path/file')
    })

    it('removes null bytes', () => {
      expect(sanitizePath('file\0name')).toBe('filename')
    })

    it('removes URL-encoded traversal', () => {
      expect(sanitizePath('%2e%2e%2ftest')).toBe('test')
    })

    it('preserves safe paths', () => {
      expect(sanitizePath('/home/user/file.txt')).toBe('/home/user/file.txt')
    })
  })

  describe('safePath', () => {
    it('joins paths safely', () => {
      const result = safePath(HOME, 'projects', 'myapp')
      expect(result.valid).toBe(true)
      expect(result.canonicalPath).toBe(join(HOME, 'projects', 'myapp'))
    })

    it('rejects traversal in segments', () => {
      const result = safePath(HOME, '..', 'etc')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('traversal')
    })

    it('rejects segments that escape base', () => {
      const result = safePath('/tmp', '..', '..', 'etc')
      expect(result.valid).toBe(false)
    })
  })

  describe('createProjectPathSchema', () => {
    it('validates and transforms valid paths', () => {
      const schema = createProjectPathSchema()
      const result = schema.safeParse(join(HOME, 'projects'))
      expect(result.success).toBe(true)
    })

    it('rejects traversal attempts', () => {
      const schema = createProjectPathSchema()
      const result = schema.safeParse('../../../etc/passwd')
      expect(result.success).toBe(false)
    })

    it('rejects empty paths', () => {
      const schema = createProjectPathSchema()
      const result = schema.safeParse('')
      expect(result.success).toBe(false)
    })

    it('respects custom allowed paths', () => {
      const schema = createProjectPathSchema({
        allowedPaths: ['/custom/base'],
      })
      const result = schema.safeParse('/custom/base/project')
      expect(result.success).toBe(true)
    })
  })

  describe('SecureProjectPathSchema', () => {
    it('validates objects with projectPath', () => {
      const result = SecureProjectPathSchema.safeParse({
        projectPath: join(HOME, 'projects'),
      })
      expect(result.success).toBe(true)
    })

    it('rejects missing projectPath', () => {
      const result = SecureProjectPathSchema.safeParse({})
      expect(result.success).toBe(false)
    })

    it('rejects traversal in projectPath', () => {
      const result = SecureProjectPathSchema.safeParse({
        projectPath: '../../../etc',
      })
      expect(result.success).toBe(false)
    })
  })

  describe('edge cases', () => {
    it('handles paths with special characters', () => {
      const result = validatePathSync(join(HOME, 'projects', 'my project (1)'))
      expect(result.valid).toBe(true)
    })

    it('handles paths with unicode', () => {
      const result = validatePathSync(join(HOME, 'projets', 'café'))
      expect(result.valid).toBe(true)
    })

    it('rejects obvious attack patterns', () => {
      const attacks = [
        '/etc/passwd',
        '/etc/shadow',
        '/root/.ssh/id_rsa',
        '../../../../etc/passwd',
        join(HOME, '..', '..', '..', 'etc', 'passwd'),
      ]

      for (const attack of attacks) {
        const result = validatePathSync(attack)
        expect(result.valid).toBe(false)
      }
    })
  })

  describe('DEFAULT_ALLOWED_PATHS', () => {
    it('includes home directory', () => {
      expect(DEFAULT_ALLOWED_PATHS).toContain(HOME)
    })

    it('includes /tmp', () => {
      expect(DEFAULT_ALLOWED_PATHS).toContain('/tmp')
    })

    it('includes /var/tmp', () => {
      expect(DEFAULT_ALLOWED_PATHS).toContain('/var/tmp')
    })
  })
})
