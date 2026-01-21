/**
 * Command Security Utilities
 *
 * Provides safe command execution patterns following Electron 2026 security best practices:
 * - Uses execFile/spawnSync with argument arrays (never shell strings)
 * - Validates commands against allowlists
 * - Sanitizes arguments to prevent injection
 * - Validates paths to prevent traversal
 *
 * @module utils/command-security
 * @see SEC-1 Shell Injection Prevention
 */

import { spawn, execFile, type ChildProcess, type SpawnOptions } from 'child_process'
import { promisify } from 'util'
import { realpath, access, constants } from 'fs/promises'
import { resolve, normalize, isAbsolute } from 'path'
import { homedir } from 'os'

const execFileAsync = promisify(execFile)

/**
 * Allowed commands for plan execution
 * Each entry specifies the command and whether it's allowed to have arbitrary arguments
 */
const ALLOWED_PLAN_COMMANDS: Map<string, { requiresArgValidation: boolean }> = new Map([
  // Build tools
  ['npm', { requiresArgValidation: false }],
  ['pnpm', { requiresArgValidation: false }],
  ['yarn', { requiresArgValidation: false }],
  ['npx', { requiresArgValidation: true }],
  ['node', { requiresArgValidation: true }],

  // Version control
  ['git', { requiresArgValidation: false }],

  // Testing
  ['vitest', { requiresArgValidation: false }],
  ['jest', { requiresArgValidation: false }],
  ['playwright', { requiresArgValidation: false }],

  // Linting/formatting
  ['eslint', { requiresArgValidation: false }],
  ['prettier', { requiresArgValidation: false }],
  ['tsc', { requiresArgValidation: false }],

  // Build tools
  ['vite', { requiresArgValidation: false }],
  ['webpack', { requiresArgValidation: false }],
  ['esbuild', { requiresArgValidation: false }],
  ['electron-vite', { requiresArgValidation: false }],
  ['electron-builder', { requiresArgValidation: false }],

  // Electron
  ['electron', { requiresArgValidation: true }],

  // Common utilities
  ['echo', { requiresArgValidation: false }],
  ['cat', { requiresArgValidation: true }],
  ['ls', { requiresArgValidation: false }],
  ['mkdir', { requiresArgValidation: true }],
  ['rm', { requiresArgValidation: true }],
  ['cp', { requiresArgValidation: true }],
  ['mv', { requiresArgValidation: true }],

  // Claude/Beads
  ['claude', { requiresArgValidation: false }],
  ['bd', { requiresArgValidation: false }],
])

/**
 * Dangerous argument patterns that should be rejected
 */
const DANGEROUS_ARG_PATTERNS = [
  /[;&|`$()]/, // Shell metacharacters
  /\$\{/, // Variable expansion
  /\$\(/, // Command substitution
  />\s*\/dev\/null/, // Redirect to nowhere
  />\s*\/etc\//, // Redirect to system dirs
  /;\s*rm\s/, // Chained rm
  /\|\s*sh/, // Pipe to shell
  /\|\s*bash/, // Pipe to bash
  /--exec/, // Git exec flag
  /-exec/, // Find exec flag
]

/**
 * Dangerous npm/npx commands that should be blocked
 */
const BLOCKED_NPX_COMMANDS = [
  /^(sh|bash|zsh|fish|ksh)$/,
  /^(curl|wget|nc|netcat)$/,
  /^(python|python3|perl|ruby)$/,
]

export interface CommandValidationResult {
  valid: boolean
  command?: string
  args?: string[]
  error?: string
}

export interface SafeExecResult {
  stdout: string
  stderr: string
  exitCode: number
}

export interface SafeSpawnResult {
  process: ChildProcess
  command: string
  args: string[]
}

/**
 * Check if a string contains shell metacharacters outside quotes
 */
function containsShellMetachars(str: string): boolean {
  // These characters are dangerous when used outside of quotes
  // as they could enable shell injection
  return /[;&|`$()<>]/.test(str)
}

/**
 * Parse a shell command string into command and arguments
 * Handles basic quoting but rejects complex shell features
 */
export function parseCommand(commandString: string): CommandValidationResult {
  const trimmed = commandString.trim()

  if (!trimmed) {
    return { valid: false, error: 'Empty command' }
  }

  // Simple tokenizer that handles basic quoting
  const tokens: string[] = []
  let current = ''
  let inSingleQuote = false
  let inDoubleQuote = false

  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i]

    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote
      continue
    }

    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote
      continue
    }

    if (char === ' ' && !inSingleQuote && !inDoubleQuote) {
      if (current) {
        tokens.push(current)
        current = ''
      }
      continue
    }

    // Detect shell metacharacters outside quotes
    if (!inSingleQuote && !inDoubleQuote && containsShellMetachars(char)) {
      return {
        valid: false,
        error: `Command contains shell operator '${char}' - use argument arrays instead`,
      }
    }

    current += char
  }

  if (current) {
    tokens.push(current)
  }

  if (inSingleQuote || inDoubleQuote) {
    return { valid: false, error: 'Unclosed quote in command' }
  }

  if (tokens.length === 0) {
    return { valid: false, error: 'No command found' }
  }

  const [command, ...args] = tokens

  return { valid: true, command, args }
}

/**
 * Validate a command against the allowlist
 */
export function validateCommand(
  command: string,
  args: string[],
  options: { allowlist?: Map<string, { requiresArgValidation: boolean }> } = {}
): CommandValidationResult {
  const allowlist = options.allowlist || ALLOWED_PLAN_COMMANDS

  // Extract base command name (handle paths like /usr/bin/npm)
  const baseName = command.split('/').pop() || command

  // Check if command is in allowlist
  const config = allowlist.get(baseName)
  if (!config) {
    return {
      valid: false,
      error: `Command '${baseName}' is not in the allowed commands list`,
    }
  }

  // Validate arguments if required
  if (config.requiresArgValidation) {
    for (const arg of args) {
      for (const pattern of DANGEROUS_ARG_PATTERNS) {
        if (pattern.test(arg)) {
          return {
            valid: false,
            error: `Argument contains dangerous pattern: ${arg}`,
          }
        }
      }
    }
  }

  // Special validation for npx
  if (baseName === 'npx' && args.length > 0) {
    const npxCommand = args[0]
    for (const blocked of BLOCKED_NPX_COMMANDS) {
      if (blocked.test(npxCommand)) {
        return {
          valid: false,
          error: `npx command '${npxCommand}' is blocked for security`,
        }
      }
    }
  }

  // Special validation for node
  if (baseName === 'node' && args.length > 0) {
    const firstArg = args[0]
    // Block -e and --eval flags
    if (firstArg === '-e' || firstArg === '--eval') {
      return {
        valid: false,
        error: 'node --eval is not allowed for security',
      }
    }
  }

  return { valid: true, command, args }
}

/**
 * Validate a command string (parse + validate)
 */
export function validateCommandString(
  commandString: string,
  options: { allowlist?: Map<string, { requiresArgValidation: boolean }> } = {}
): CommandValidationResult {
  const parsed = parseCommand(commandString)
  if (!parsed.valid || !parsed.command) {
    return parsed
  }

  return validateCommand(parsed.command, parsed.args || [], options)
}

/**
 * Execute a command safely using execFile (no shell)
 */
export async function safeExec(
  command: string,
  args: string[],
  options: {
    cwd?: string
    env?: NodeJS.ProcessEnv
    timeout?: number
    validate?: boolean
    allowlist?: Map<string, { requiresArgValidation: boolean }>
  } = {}
): Promise<SafeExecResult> {
  // Validate command if requested
  if (options.validate !== false) {
    const validation = validateCommand(command, args, { allowlist: options.allowlist })
    if (!validation.valid) {
      throw new Error(`Command validation failed: ${validation.error}`)
    }
  }

  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd: options.cwd,
      env: options.env || process.env,
      timeout: options.timeout || 60000,
      maxBuffer: 10 * 1024 * 1024, // 10MB
    })

    return { stdout, stderr, exitCode: 0 }
  } catch (error) {
    const execError = error as Error & { code?: number; stdout?: string; stderr?: string }
    return {
      stdout: execError.stdout || '',
      stderr: execError.stderr || execError.message,
      exitCode: execError.code || 1,
    }
  }
}

/**
 * Spawn a command safely using spawn with argument array (no shell)
 */
export function safeSpawn(
  command: string,
  args: string[],
  options: {
    cwd?: string
    env?: NodeJS.ProcessEnv
    stdio?: SpawnOptions['stdio']
    validate?: boolean
    allowlist?: Map<string, { requiresArgValidation: boolean }>
  } = {}
): SafeSpawnResult {
  // Validate command if requested
  if (options.validate !== false) {
    const validation = validateCommand(command, args, { allowlist: options.allowlist })
    if (!validation.valid) {
      throw new Error(`Command validation failed: ${validation.error}`)
    }
  }

  const proc = spawn(command, args, {
    cwd: options.cwd,
    env: options.env || process.env,
    stdio: options.stdio || ['ignore', 'pipe', 'pipe'],
    // CRITICAL: Never use shell: true
    shell: false,
  })

  return { process: proc, command, args }
}

/**
 * Execute a command string safely (parse, validate, execute)
 */
export async function safeExecString(
  commandString: string,
  options: {
    cwd?: string
    env?: NodeJS.ProcessEnv
    timeout?: number
    allowlist?: Map<string, { requiresArgValidation: boolean }>
  } = {}
): Promise<SafeExecResult> {
  const parsed = parseCommand(commandString)
  if (!parsed.valid || !parsed.command) {
    throw new Error(`Invalid command: ${parsed.error}`)
  }

  return safeExec(parsed.command, parsed.args || [], {
    ...options,
    validate: true,
  })
}

/**
 * Spawn a command string safely (parse, validate, spawn)
 */
export function safeSpawnString(
  commandString: string,
  options: {
    cwd?: string
    env?: NodeJS.ProcessEnv
    stdio?: SpawnOptions['stdio']
    allowlist?: Map<string, { requiresArgValidation: boolean }>
  } = {}
): SafeSpawnResult {
  const parsed = parseCommand(commandString)
  if (!parsed.valid || !parsed.command) {
    throw new Error(`Invalid command: ${parsed.error}`)
  }

  return safeSpawn(parsed.command, parsed.args || [], {
    ...options,
    validate: true,
  })
}

/**
 * Validate a path is within allowed directories
 */
export async function validatePath(
  inputPath: string,
  allowedBasePaths: string[]
): Promise<{ valid: boolean; resolvedPath?: string; error?: string }> {
  try {
    // Normalize and resolve the path
    const normalized = normalize(inputPath)

    // Make absolute if not already
    const absolutePath = isAbsolute(normalized) ? normalized : resolve(process.cwd(), normalized)

    // Resolve symlinks to get the real path
    let resolvedPath: string
    try {
      resolvedPath = await realpath(absolutePath)
    } catch {
      // Path doesn't exist yet, use the absolute path
      resolvedPath = absolutePath
    }

    // Expand ~ in allowed paths
    const expandedAllowed = allowedBasePaths.map((p) =>
      p.startsWith('~') ? p.replace('~', homedir()) : p
    )

    // Check if path is within any allowed base path
    for (const basePath of expandedAllowed) {
      const resolvedBase = await realpath(basePath).catch(() => basePath)
      if (resolvedPath.startsWith(resolvedBase + '/') || resolvedPath === resolvedBase) {
        return { valid: true, resolvedPath }
      }
    }

    return {
      valid: false,
      error: `Path '${inputPath}' is outside allowed directories`,
    }
  } catch (error) {
    return {
      valid: false,
      error: `Path validation failed: ${(error as Error).message}`,
    }
  }
}

/**
 * Check if a file exists and is accessible
 */
export async function fileAccessible(
  filePath: string,
  mode: 'read' | 'write' | 'execute' = 'read'
): Promise<boolean> {
  const flags = {
    read: constants.R_OK,
    write: constants.W_OK,
    execute: constants.X_OK,
  }

  try {
    await access(filePath, flags[mode])
    return true
  } catch {
    return false
  }
}

// Export allowlist for testing and extension
export { ALLOWED_PLAN_COMMANDS, DANGEROUS_ARG_PATTERNS, BLOCKED_NPX_COMMANDS }
