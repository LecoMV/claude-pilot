/**
 * Promisified Spawn Wrapper - Enterprise-grade async process execution
 *
 * SECURITY: All functions use shell:false by default to prevent command injection.
 * Buffer chunks are aggregated before decoding to avoid multi-byte character corruption.
 *
 * @see docs/Research/Electron App Architecture Research Guide.md (Chapter 2, 5)
 * @module spawn-async
 */

import { spawn, type SpawnOptions, type ChildProcess } from 'child_process'

// ============================================================================
// Types
// ============================================================================

export interface SpawnAsyncOptions extends Omit<SpawnOptions, 'shell'> {
  /**
   * Maximum time to wait for process completion (in milliseconds)
   * @default 30000 (30 seconds)
   */
  timeout?: number

  /**
   * Callback for streaming stdout data (useful for progress updates)
   */
  onStdout?: (data: Buffer) => void

  /**
   * Callback for streaming stderr data
   */
  onStderr?: (data: Buffer) => void

  /**
   * Kill signal to send on timeout
   * @default 'SIGTERM'
   */
  killSignal?: NodeJS.Signals

  /**
   * Allow non-zero exit codes without throwing
   * Useful for commands that use exit codes for status (e.g., grep)
   */
  allowNonZeroExit?: boolean
}

export interface SpawnAsyncResult {
  stdout: string
  stderr: string
  exitCode: number
  signal: NodeJS.Signals | null
}

export class SpawnAsyncError extends Error {
  constructor(
    message: string,
    public readonly stdout: string,
    public readonly stderr: string,
    public readonly exitCode: number | null,
    public readonly signal: NodeJS.Signals | null,
    public readonly command: string,
    public readonly args: string[]
  ) {
    super(message)
    this.name = 'SpawnAsyncError'
  }
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Execute a command asynchronously with proper buffer handling
 *
 * SECURITY: shell is always false to prevent command injection.
 * Arguments are passed as array elements, not parsed by shell.
 *
 * @example
 * // Good - arguments as array
 * await spawnAsync('nvidia-smi', ['--query-gpu=name', '--format=csv'])
 *
 * // Bad - would be shell injection risk if shell:true was allowed
 * await spawnAsync('nvidia-smi', ['--query-gpu=name; rm -rf /'])
 *
 * @param command - The command to execute (binary name)
 * @param args - Arguments as array (each element is literal, not shell-parsed)
 * @param options - Execution options
 * @returns Promise resolving to stdout string
 * @throws SpawnAsyncError on non-zero exit code (unless allowNonZeroExit)
 */
export function spawnAsync(
  command: string,
  args: string[] = [],
  options: SpawnAsyncOptions = {}
): Promise<string> {
  return spawnAsyncFull(command, args, options).then((result) => result.stdout)
}

/**
 * Execute a command and return full result including stderr and exit code
 *
 * @param command - The command to execute
 * @param args - Arguments as array
 * @param options - Execution options
 * @returns Promise resolving to full result object
 */
export function spawnAsyncFull(
  command: string,
  args: string[] = [],
  options: SpawnAsyncOptions = {}
): Promise<SpawnAsyncResult> {
  const {
    timeout = 30000,
    onStdout,
    onStderr,
    killSignal = 'SIGTERM',
    allowNonZeroExit = false,
    ...spawnOptions
  } = options

  return new Promise((resolve, reject) => {
    // SECURITY: shell is always false - arguments are literals, not parsed
    const child: ChildProcess = spawn(command, args, {
      ...spawnOptions,
      shell: false,
    })

    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []
    let timeoutId: NodeJS.Timeout | null = null
    let killed = false

    // Setup timeout
    if (timeout > 0) {
      timeoutId = setTimeout(() => {
        killed = true
        child.kill(killSignal)
        reject(
          new SpawnAsyncError(
            `Command timed out after ${timeout}ms`,
            Buffer.concat(stdoutChunks).toString(),
            Buffer.concat(stderrChunks).toString(),
            null,
            killSignal,
            command,
            args
          )
        )
      }, timeout)
    }

    // Collect stdout
    child.stdout?.on('data', (chunk: Buffer) => {
      stdoutChunks.push(chunk)
      onStdout?.(chunk)
    })

    // Collect stderr
    child.stderr?.on('data', (chunk: Buffer) => {
      stderrChunks.push(chunk)
      onStderr?.(chunk)
    })

    // Handle spawn errors (command not found, permission denied, etc.)
    child.on('error', (err: Error) => {
      if (timeoutId) clearTimeout(timeoutId)
      reject(
        new SpawnAsyncError(
          `Failed to spawn: ${err.message}`,
          Buffer.concat(stdoutChunks).toString(),
          Buffer.concat(stderrChunks).toString(),
          null,
          null,
          command,
          args
        )
      )
    })

    // Handle process completion
    child.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
      if (timeoutId) clearTimeout(timeoutId)
      if (killed) return // Already rejected by timeout

      // Decode complete buffers (avoids multi-byte character corruption)
      const stdout = Buffer.concat(stdoutChunks).toString()
      const stderr = Buffer.concat(stderrChunks).toString()
      const exitCode = code ?? 1

      if (exitCode === 0 || allowNonZeroExit) {
        resolve({ stdout, stderr, exitCode, signal })
      } else {
        reject(
          new SpawnAsyncError(
            `Command failed with exit code ${exitCode}: ${stderr || stdout}`,
            stdout,
            stderr,
            exitCode,
            signal,
            command,
            args
          )
        )
      }
    })
  })
}

/**
 * Check if a command exists in PATH
 *
 * @param command - Command name to check
 * @returns Promise resolving to boolean
 */
export async function commandExists(command: string): Promise<boolean> {
  try {
    await spawnAsync('which', [command], { timeout: 2000 })
    return true
  } catch {
    return false
  }
}

/**
 * Execute a command with streaming progress updates
 * Useful for long-running commands like ollama pull
 *
 * @param command - The command to execute
 * @param args - Arguments as array
 * @param onProgress - Callback for each line of stdout
 * @param options - Execution options
 * @returns Promise resolving to full stdout
 */
export function spawnWithProgress(
  command: string,
  args: string[],
  onProgress: (line: string) => void,
  options: SpawnAsyncOptions = {}
): Promise<string> {
  let buffer = ''

  return spawnAsync(command, args, {
    ...options,
    onStdout: (chunk) => {
      buffer += chunk.toString()
      const lines = buffer.split('\n')
      // Keep incomplete last line in buffer
      buffer = lines.pop() || ''
      // Emit complete lines
      lines.forEach((line) => {
        if (line.trim()) onProgress(line)
      })
    },
  }).then((result) => {
    // Emit any remaining buffer
    if (buffer.trim()) onProgress(buffer)
    return result
  })
}

// ============================================================================
// Exports
// ============================================================================

export default spawnAsync
