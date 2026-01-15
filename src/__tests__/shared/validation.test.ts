import { describe, it, expect } from 'vitest'
import {
  validate,
  validators,
  validateIPCInput,
  sanitizeString,
  sanitizePath,
} from '@shared/validation'
import { ValidationError } from '@shared/errors'

describe('Validation', () => {
  describe('validate', () => {
    it('should validate string fields', () => {
      const schema = {
        name: validators.string({ required: true }),
      }

      const result = validate({ name: 'test' }, schema, 'test')
      expect(result).toEqual({ name: 'test' })
    })

    it('should throw for missing required field', () => {
      const schema = {
        name: validators.string({ required: true }),
      }

      expect(() => validate({}, schema, 'test')).toThrow(ValidationError)
    })

    it('should throw for wrong type', () => {
      const schema = {
        count: validators.number({ required: true }),
      }

      expect(() => validate({ count: 'not a number' }, schema, 'test')).toThrow(
        ValidationError
      )
    })

    it('should validate string length', () => {
      const schema = {
        name: validators.string({ minLength: 3, maxLength: 10 }),
      }

      expect(() => validate({ name: 'ab' }, schema, 'test')).toThrow(
        ValidationError
      )
      expect(() => validate({ name: 'abcdefghijk' }, schema, 'test')).toThrow(
        ValidationError
      )
      expect(validate({ name: 'valid' }, schema, 'test')).toEqual({
        name: 'valid',
      })
    })

    it('should validate number range', () => {
      const schema = {
        port: validators.number({ min: 1, max: 65535 }),
      }

      expect(() => validate({ port: 0 }, schema, 'test')).toThrow(
        ValidationError
      )
      expect(() => validate({ port: 70000 }, schema, 'test')).toThrow(
        ValidationError
      )
      expect(validate({ port: 8080 }, schema, 'test')).toEqual({ port: 8080 })
    })

    it('should validate enum values', () => {
      const schema = {
        action: { type: 'string' as const, enum: ['start', 'stop', 'restart'] },
      }

      expect(() => validate({ action: 'invalid' }, schema, 'test')).toThrow(
        ValidationError
      )
      expect(validate({ action: 'start' }, schema, 'test')).toEqual({
        action: 'start',
      })
    })

    it('should validate regex patterns', () => {
      const schema = {
        email: validators.email(),
      }

      expect(() => validate({ email: 'invalid' }, schema, 'test')).toThrow(
        ValidationError
      )
      expect(validate({ email: 'test@example.com' }, schema, 'test')).toEqual({
        email: 'test@example.com',
      })
    })

    it('should validate arrays', () => {
      const schema = {
        items: validators.array(validators.string()),
      }

      expect(validate({ items: ['a', 'b'] }, schema, 'test')).toEqual({
        items: ['a', 'b'],
      })
      expect(() => validate({ items: [1, 2] }, schema, 'test')).toThrow(
        ValidationError
      )
    })

    it('should validate nested objects', () => {
      const schema = {
        config: validators.object({
          name: validators.string({ required: true }),
          port: validators.number(),
        }),
      }

      expect(
        validate({ config: { name: 'test', port: 8080 } }, schema, 'test')
      ).toEqual({ config: { name: 'test', port: 8080 } })
    })

    it('should run custom validation', () => {
      const schema = {
        value: {
          type: 'number' as const,
          custom: (v: unknown) => (v as number) % 2 === 0 || 'Must be even',
        },
      }

      expect(() => validate({ value: 3 }, schema, 'test')).toThrow(
        ValidationError
      )
      expect(validate({ value: 4 }, schema, 'test')).toEqual({ value: 4 })
    })

    it('should throw for non-object input', () => {
      const schema = { name: validators.string() }

      expect(() => validate('not an object', schema, 'test')).toThrow(
        ValidationError
      )
      expect(() => validate(null, schema, 'test')).toThrow(ValidationError)
    })
  })

  describe('validators', () => {
    describe('filePath', () => {
      it('should validate file paths', () => {
        const rule = validators.filePath()

        expect(rule.type).toBe('string')
        expect(rule.required).toBe(true)
        expect(rule.pattern?.test('/home/user/file.txt')).toBe(true)
        expect(rule.pattern?.test('~/config.json')).toBe(true)
        expect(rule.custom?.('/home/../etc/passwd')).toContain('traversal')
      })
    })

    describe('port', () => {
      it('should validate port numbers', () => {
        const rule = validators.port()

        expect(rule.type).toBe('number')
        expect(rule.min).toBe(1)
        expect(rule.max).toBe(65535)
      })
    })

    describe('id', () => {
      it('should validate IDs', () => {
        const rule = validators.id()

        expect(rule.pattern?.test('valid-id-123')).toBe(true)
        expect(rule.pattern?.test('invalid id!')).toBe(false)
      })
    })
  })

  describe('validateIPCInput', () => {
    it('should validate mcp:toggle input', () => {
      const result = validateIPCInput('mcp:toggle', ['server-name', true])

      expect(result).toEqual({ name: 'server-name', enabled: true })
    })

    it('should throw for invalid mcp:toggle input', () => {
      expect(() => validateIPCInput('mcp:toggle', ['', true])).toThrow(
        ValidationError
      )
    })

    it('should allow unknown channels through', () => {
      const result = validateIPCInput('unknown:channel', ['arg1', 'arg2'])

      expect(result).toEqual(['arg1', 'arg2'])
    })

    it('should validate services:systemdAction', () => {
      const result = validateIPCInput('services:systemdAction', [
        'nginx',
        'restart',
      ])

      expect(result).toEqual({ name: 'nginx', action: 'restart' })
    })

    it('should reject invalid action for services:systemdAction', () => {
      expect(() =>
        validateIPCInput('services:systemdAction', ['nginx', 'invalid'])
      ).toThrow(ValidationError)
    })
  })

  describe('sanitizeString', () => {
    it('should remove HTML tags', () => {
      expect(sanitizeString('<script>alert(1)</script>')).toBe(
        'scriptalert(1)/script'
      )
    })

    it('should remove control characters', () => {
      expect(sanitizeString('test\x00\x1fstring')).toBe('teststring')
    })

    it('should trim whitespace', () => {
      expect(sanitizeString('  test  ')).toBe('test')
    })
  })

  describe('sanitizePath', () => {
    it('should remove parent directory references', () => {
      expect(sanitizePath('/home/../etc/passwd')).toBe('/home//etc/passwd')
    })

    it('should remove invalid path characters', () => {
      expect(sanitizePath('file<>:"|?*.txt')).toBe('file.txt')
    })

    it('should trim whitespace', () => {
      expect(sanitizePath('  /path/to/file  ')).toBe('/path/to/file')
    })
  })
})
