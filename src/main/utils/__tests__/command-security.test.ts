/**
 * Tests for command-security utility module
 * @see SEC-1 Shell Injection Prevention
 */

import { describe, it, expect } from 'vitest'
import {
  parseCommand,
  validateCommand,
  validateCommandString,
  ALLOWED_PLAN_COMMANDS,
  DANGEROUS_ARG_PATTERNS,
} from '../command-security'

describe('command-security', () => {
  describe('parseCommand', () => {
    it('parses simple command', () => {
      const result = parseCommand('npm install')
      expect(result.valid).toBe(true)
      expect(result.command).toBe('npm')
      expect(result.args).toEqual(['install'])
    })

    it('parses command with multiple arguments', () => {
      const result = parseCommand('git commit -m "test message"')
      expect(result.valid).toBe(true)
      expect(result.command).toBe('git')
      expect(result.args).toEqual(['commit', '-m', 'test message'])
    })

    it('handles single quoted arguments', () => {
      const result = parseCommand("echo 'hello world'")
      expect(result.valid).toBe(true)
      expect(result.command).toBe('echo')
      expect(result.args).toEqual(['hello world'])
    })

    it('handles double quoted arguments', () => {
      const result = parseCommand('git commit -m "fix: bug"')
      expect(result.valid).toBe(true)
      expect(result.command).toBe('git')
      expect(result.args).toEqual(['commit', '-m', 'fix: bug'])
    })

    it('rejects empty command', () => {
      const result = parseCommand('')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Empty command')
    })

    it('rejects unclosed quotes', () => {
      const result = parseCommand('echo "hello')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Unclosed quote in command')
    })

    it('handles command with no arguments', () => {
      const result = parseCommand('ls')
      expect(result.valid).toBe(true)
      expect(result.command).toBe('ls')
      expect(result.args).toEqual([])
    })
  })

  describe('validateCommand', () => {
    it('allows commands in the allowlist', () => {
      const result = validateCommand('npm', ['install'])
      expect(result.valid).toBe(true)
    })

    it('rejects commands not in allowlist', () => {
      const result = validateCommand('curl', ['http://evil.com'])
      expect(result.valid).toBe(false)
      expect(result.error).toContain('not in the allowed commands list')
    })

    it('allows git commands', () => {
      const result = validateCommand('git', ['status'])
      expect(result.valid).toBe(true)
    })

    it('allows vitest commands', () => {
      const result = validateCommand('vitest', ['run'])
      expect(result.valid).toBe(true)
    })

    it('blocks dangerous npx commands', () => {
      const result = validateCommand('npx', ['bash', '-c', 'malicious'])
      expect(result.valid).toBe(false)
      expect(result.error).toContain('blocked for security')
    })

    it('blocks shell interpreters via npx', () => {
      const result = validateCommand('npx', ['sh'])
      expect(result.valid).toBe(false)
    })

    it('blocks curl via npx', () => {
      const result = validateCommand('npx', ['curl', 'http://evil.com'])
      expect(result.valid).toBe(false)
    })

    it('blocks node --eval', () => {
      const result = validateCommand('node', ['-e', 'console.log("pwned")'])
      expect(result.valid).toBe(false)
      // The dangerous arg pattern catches this before the -e check
      expect(result.error).toBeDefined()
    })

    it('blocks node --eval long form', () => {
      const result = validateCommand('node', ['--eval', 'process.exit(1)'])
      expect(result.valid).toBe(false)
      // The parens in process.exit(1) trigger dangerous pattern
      expect(result.error).toBeDefined()
    })

    it('blocks node -e flag directly', () => {
      const result = validateCommand('node', ['-e', 'process.env'])
      expect(result.valid).toBe(false)
    })

    it('allows node with file argument', () => {
      const result = validateCommand('node', ['script.js'])
      expect(result.valid).toBe(true)
    })

    it('handles path-prefixed commands', () => {
      const result = validateCommand('/usr/bin/npm', ['install'])
      expect(result.valid).toBe(true)
    })
  })

  describe('validateCommandString', () => {
    it('validates and parses npm install', () => {
      const result = validateCommandString('npm install')
      expect(result.valid).toBe(true)
      expect(result.command).toBe('npm')
      expect(result.args).toEqual(['install'])
    })

    it('validates git commit with message', () => {
      const result = validateCommandString('git commit -m "test"')
      expect(result.valid).toBe(true)
    })

    it('rejects shell injection attempts with semicolon', () => {
      const result = validateCommandString('npm install; rm -rf /')
      // The semicolon is detected as a shell operator
      expect(result.valid).toBe(false)
      expect(result.error).toContain('shell operator')
    })

    it('rejects pipe injection', () => {
      const result = validateCommandString('echo test | bash')
      // The pipe is detected as a shell operator
      expect(result.valid).toBe(false)
      expect(result.error).toContain('shell operator')
    })

    it('rejects command substitution', () => {
      const result = validateCommandString('echo $(whoami)')
      // The $ and ( are detected as shell operators
      expect(result.valid).toBe(false)
      expect(result.error).toContain('shell operator')
    })

    it('rejects backtick substitution', () => {
      const result = validateCommandString('echo `whoami`')
      // The backtick is detected as a shell operator
      expect(result.valid).toBe(false)
      expect(result.error).toContain('shell operator')
    })

    it('validates electron-vite commands', () => {
      const result = validateCommandString('electron-vite build')
      expect(result.valid).toBe(true)
    })

    it('validates beads commands', () => {
      const result = validateCommandString('bd list --status=open')
      expect(result.valid).toBe(true)
    })

    it('validates claude commands', () => {
      const result = validateCommandString('claude --help')
      expect(result.valid).toBe(true)
    })
  })

  describe('DANGEROUS_ARG_PATTERNS', () => {
    const testDangerousArgs = [
      ['semicolon injection', 'test; rm -rf'],
      ['pipe injection', 'test | bash'],
      ['ampersand', 'test && malicious'],
      ['backtick', 'test `whoami`'],
      ['dollar paren', '$(whoami)'],
      ['variable expansion', '${HOME}'],
      ['redirect to etc', '> /etc/passwd'],
    ]

    it.each(testDangerousArgs)('detects %s', (_name, arg) => {
      const matches = DANGEROUS_ARG_PATTERNS.some((pattern) => pattern.test(arg))
      expect(matches).toBe(true)
    })
  })

  describe('ALLOWED_PLAN_COMMANDS', () => {
    it('includes npm', () => {
      expect(ALLOWED_PLAN_COMMANDS.has('npm')).toBe(true)
    })

    it('includes git', () => {
      expect(ALLOWED_PLAN_COMMANDS.has('git')).toBe(true)
    })

    it('includes vitest', () => {
      expect(ALLOWED_PLAN_COMMANDS.has('vitest')).toBe(true)
    })

    it('includes electron-builder', () => {
      expect(ALLOWED_PLAN_COMMANDS.has('electron-builder')).toBe(true)
    })

    it('includes bd (beads)', () => {
      expect(ALLOWED_PLAN_COMMANDS.has('bd')).toBe(true)
    })

    it('does not include dangerous commands', () => {
      expect(ALLOWED_PLAN_COMMANDS.has('curl')).toBe(false)
      expect(ALLOWED_PLAN_COMMANDS.has('wget')).toBe(false)
      expect(ALLOWED_PLAN_COMMANDS.has('nc')).toBe(false)
      expect(ALLOWED_PLAN_COMMANDS.has('bash')).toBe(false)
      expect(ALLOWED_PLAN_COMMANDS.has('sh')).toBe(false)
    })
  })

  describe('custom allowlist', () => {
    it('allows custom allowlist to override defaults', () => {
      const customAllowlist = new Map([['custom-tool', { requiresArgValidation: false }]])

      const result = validateCommand('custom-tool', ['arg1'], { allowlist: customAllowlist })
      expect(result.valid).toBe(true)

      // npm should not be allowed with custom allowlist
      const npmResult = validateCommand('npm', ['install'], { allowlist: customAllowlist })
      expect(npmResult.valid).toBe(false)
    })
  })
})
