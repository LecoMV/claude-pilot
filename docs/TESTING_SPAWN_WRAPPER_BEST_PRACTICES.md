# Testing Node.js Child Process Spawn Wrappers - Best Practices

## Overview

Comprehensive guide for testing `spawnAsync` and other child process wrapper utilities in Vitest, covering edge cases, mocking strategies, and test patterns.

---

## 1. Edge Cases to Test

### 1.1 Timeout Handling

- Process exceeds timeout limit
- Timeout with partial output
- Timeout during stderr output
- Process respects timeout and completes just before limit

### 1.2 Large Buffer Output

- stdout output exceeding buffer limits (default: 1MB)
- stderr output exceeding buffer limits
- Combined stdout/stderr exceeding limits
- Streaming vs buffered output handling

### 1.3 Signal Handling

- **SIGTERM**: Graceful termination (catchable)
- **SIGKILL**: Forceful termination (uncatchable)
- **SIGINT**: Interrupt signal (Ctrl+C)
- Process that ignores SIGTERM
- Windows vs Unix signal differences

### 1.4 Exit Codes

- Exit code 0 (success)
- Non-zero exit codes (1-255)
- Negative exit codes
- null exit code (killed by signal)

### 1.5 stderr vs stdout Handling

- Output to stdout only
- Output to stderr only
- Mixed stdout/stderr output
- stderr without error exit code (warnings)

### 1.6 Command Execution Errors

- Command not found (ENOENT)
- Permission denied (EACCES)
- Invalid executable path
- Missing shebang in script
- PATH resolution failures

---

## 2. Mocking Strategies

### 2.1 Basic Vitest Mock Pattern

```typescript
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'

// Mock the entire child_process module
vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}))

describe('spawnAsync', () => {
  let mockChildProcess: MockChildProcess

  beforeEach(() => {
    mockChildProcess = createMockChildProcess()
    vi.mocked(spawn).mockReturnValue(mockChildProcess as any)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })
})
```

### 2.2 Mock Child Process Factory

```typescript
import { Readable } from 'node:stream'

interface MockChildProcess extends EventEmitter {
  stdout: Readable
  stderr: Readable
  exitCode: number | null
  signalCode: NodeJS.Signals | null
  killed: boolean
  pid: number
  kill: (signal?: NodeJS.Signals | number) => boolean
}

function createMockChildProcess(): MockChildProcess {
  const emitter = new EventEmitter() as MockChildProcess

  // Create mock streams
  emitter.stdout = new Readable({
    read() {}, // No-op, we'll push manually
  })
  emitter.stderr = new Readable({
    read() {},
  })

  emitter.exitCode = null
  emitter.signalCode = null
  emitter.killed = false
  emitter.pid = Math.floor(Math.random() * 10000)

  emitter.kill = vi.fn((signal?: NodeJS.Signals | number) => {
    emitter.killed = true
    emitter.signalCode = (signal as NodeJS.Signals) || 'SIGTERM'

    // Simulate async process termination
    setImmediate(() => {
      emitter.emit('close', null, emitter.signalCode)
    })

    return true
  })

  return emitter
}
```

### 2.3 Helper Functions for Mock Control

```typescript
// Simulate successful command execution
function simulateSuccess(
  mock: MockChildProcess,
  stdout: string,
  stderr: string = '',
  exitCode: number = 0
) {
  setImmediate(() => {
    if (stdout) {
      mock.stdout.push(stdout)
      mock.stdout.push(null) // End stream
    }
    if (stderr) {
      mock.stderr.push(stderr)
      mock.stderr.push(null)
    }

    mock.exitCode = exitCode
    mock.emit('close', exitCode, null)
  })
}

// Simulate command failure
function simulateError(mock: MockChildProcess, error: Error) {
  setImmediate(() => {
    mock.emit('error', error)
  })
}

// Simulate timeout scenario
function simulateTimeout(mock: MockChildProcess, partialOutput: string = '') {
  if (partialOutput) {
    mock.stdout.push(partialOutput)
  }
  // Don't emit close - let timeout handler kill it
}

// Simulate streaming output
function simulateStreamingOutput(mock: MockChildProcess, chunks: string[], delayMs: number = 50) {
  let index = 0
  const interval = setInterval(() => {
    if (index < chunks.length) {
      mock.stdout.push(chunks[index])
      index++
    } else {
      clearInterval(interval)
      mock.stdout.push(null)
      mock.exitCode = 0
      mock.emit('close', 0, null)
    }
  }, delayMs)
}
```

---

## 3. Complete Test Suite Example

### 3.1 spawnAsync Implementation (for reference)

```typescript
// src/utils/spawn.ts
import { spawn } from 'node:child_process'

export interface SpawnOptions {
  cwd?: string
  env?: NodeJS.ProcessEnv
  timeout?: number
  encoding?: BufferEncoding
  maxBuffer?: number
}

export interface SpawnResult {
  stdout: string
  stderr: string
  exitCode: number | null
  signalCode: NodeJS.Signals | null
  timedOut: boolean
}

export class SpawnError extends Error {
  constructor(
    message: string,
    public code: string,
    public stdout: string = '',
    public stderr: string = '',
    public exitCode: number | null = null
  ) {
    super(message)
    this.name = 'SpawnError'
  }
}

export async function spawnAsync(
  command: string,
  args: string[] = [],
  options: SpawnOptions = {}
): Promise<SpawnResult> {
  const {
    timeout = 30000,
    encoding = 'utf8',
    maxBuffer = 10 * 1024 * 1024, // 10MB
    ...spawnOptions
  } = options

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      ...spawnOptions,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    let timedOut = false
    let timeoutId: NodeJS.Timeout | undefined

    // Setup timeout
    if (timeout > 0) {
      timeoutId = setTimeout(() => {
        timedOut = true
        child.kill('SIGTERM')

        // Fallback to SIGKILL if SIGTERM doesn't work
        setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGKILL')
          }
        }, 5000)
      }, timeout)
    }

    // Collect stdout
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString(encoding)

      if (stdout.length > maxBuffer) {
        child.kill('SIGTERM')
        reject(
          new SpawnError(
            `stdout maxBuffer (${maxBuffer}) exceeded`,
            'ERR_BUFFER_OVERFLOW',
            stdout,
            stderr
          )
        )
      }
    })

    // Collect stderr
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString(encoding)

      if (stderr.length > maxBuffer) {
        child.kill('SIGTERM')
        reject(
          new SpawnError(
            `stderr maxBuffer (${maxBuffer}) exceeded`,
            'ERR_BUFFER_OVERFLOW',
            stdout,
            stderr
          )
        )
      }
    })

    // Handle errors
    child.on('error', (error: NodeJS.ErrnoException) => {
      if (timeoutId) clearTimeout(timeoutId)

      reject(new SpawnError(error.message, error.code || 'UNKNOWN_ERROR', stdout, stderr))
    })

    // Handle completion
    child.on('close', (exitCode, signalCode) => {
      if (timeoutId) clearTimeout(timeoutId)

      const result: SpawnResult = {
        stdout,
        stderr,
        exitCode,
        signalCode,
        timedOut,
      }

      if (timedOut) {
        reject(
          new SpawnError(
            `Command timed out after ${timeout}ms`,
            'ETIMEDOUT',
            stdout,
            stderr,
            exitCode
          )
        )
      } else if (exitCode !== 0 && exitCode !== null) {
        reject(
          new SpawnError(
            `Command failed with exit code ${exitCode}`,
            'ERR_COMMAND_FAILED',
            stdout,
            stderr,
            exitCode
          )
        )
      } else {
        resolve(result)
      }
    })
  })
}
```

### 3.2 Complete Test Suite

```typescript
// tests/utils/spawn.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import { spawnAsync, SpawnError } from '@/utils/spawn'

// Mock setup
vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}))

describe('spawnAsync', () => {
  let mockChildProcess: ReturnType<typeof createMockChildProcess>

  beforeEach(() => {
    vi.useFakeTimers()
    mockChildProcess = createMockChildProcess()
    vi.mocked(spawn).mockReturnValue(mockChildProcess as any)
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  describe('Success Cases', () => {
    it('should resolve with stdout on successful execution', async () => {
      const output = 'Hello World\n'

      const promise = spawnAsync('echo', ['Hello World'])
      simulateSuccess(mockChildProcess, output)
      await vi.runAllTimersAsync()

      const result = await promise

      expect(result.stdout).toBe(output)
      expect(result.stderr).toBe('')
      expect(result.exitCode).toBe(0)
      expect(result.timedOut).toBe(false)
    })

    it('should handle mixed stdout and stderr', async () => {
      const stdout = 'Normal output\n'
      const stderr = 'Warning message\n'

      const promise = spawnAsync('command', ['--verbose'])
      simulateSuccess(mockChildProcess, stdout, stderr, 0)
      await vi.runAllTimersAsync()

      const result = await promise

      expect(result.stdout).toBe(stdout)
      expect(result.stderr).toBe(stderr)
      expect(result.exitCode).toBe(0)
    })

    it('should handle large output buffers', async () => {
      const largeOutput = 'x'.repeat(1024 * 1024) // 1MB

      const promise = spawnAsync('command', [], { maxBuffer: 2 * 1024 * 1024 })
      simulateSuccess(mockChildProcess, largeOutput)
      await vi.runAllTimersAsync()

      const result = await promise

      expect(result.stdout).toBe(largeOutput)
    })

    it('should handle streaming output correctly', async () => {
      const chunks = ['chunk1\n', 'chunk2\n', 'chunk3\n']

      const promise = spawnAsync('command', [])
      simulateStreamingOutput(mockChildProcess, chunks, 50)

      await vi.advanceTimersByTimeAsync(200)

      const result = await promise

      expect(result.stdout).toBe(chunks.join(''))
    })
  })

  describe('Exit Code Handling', () => {
    it('should reject on non-zero exit code', async () => {
      const promise = spawnAsync('command', ['--fail'])
      simulateSuccess(mockChildProcess, '', 'Error occurred', 1)
      await vi.runAllTimersAsync()

      await expect(promise).rejects.toThrow(SpawnError)
      await expect(promise).rejects.toMatchObject({
        code: 'ERR_COMMAND_FAILED',
        exitCode: 1,
        stderr: 'Error occurred',
      })
    })

    it('should handle various exit codes', async () => {
      const testCases = [2, 127, 255]

      for (const exitCode of testCases) {
        const promise = spawnAsync('command', [])
        simulateSuccess(mockChildProcess, '', '', exitCode)
        await vi.runAllTimersAsync()

        await expect(promise).rejects.toMatchObject({
          exitCode,
          code: 'ERR_COMMAND_FAILED',
        })

        vi.clearAllMocks()
        mockChildProcess = createMockChildProcess()
        vi.mocked(spawn).mockReturnValue(mockChildProcess as any)
      }
    })
  })

  describe('Timeout Handling', () => {
    it('should timeout and kill process after timeout', async () => {
      const promise = spawnAsync('long-command', [], { timeout: 1000 })

      simulateTimeout(mockChildProcess, 'Partial output')

      // Advance to timeout
      await vi.advanceTimersByTimeAsync(1000)

      expect(mockChildProcess.kill).toHaveBeenCalledWith('SIGTERM')

      // Simulate process close after SIGTERM
      mockChildProcess.exitCode = null
      mockChildProcess.signalCode = 'SIGTERM'
      mockChildProcess.emit('close', null, 'SIGTERM')

      await vi.runAllTimersAsync()

      await expect(promise).rejects.toMatchObject({
        code: 'ETIMEDOUT',
        message: expect.stringContaining('timed out after 1000ms'),
      })
    })

    it('should use SIGKILL if SIGTERM fails', async () => {
      const promise = spawnAsync('stubborn-command', [], { timeout: 1000 })

      simulateTimeout(mockChildProcess)

      // Advance to initial timeout
      await vi.advanceTimersByTimeAsync(1000)
      expect(mockChildProcess.kill).toHaveBeenCalledWith('SIGTERM')

      // Mock that process is still alive
      mockChildProcess.killed = false

      // Advance to SIGKILL timeout (5 seconds after SIGTERM)
      await vi.advanceTimersByTimeAsync(5000)

      expect(mockChildProcess.kill).toHaveBeenCalledWith('SIGKILL')
    })

    it('should not timeout if process completes before limit', async () => {
      const promise = spawnAsync('quick-command', [], { timeout: 5000 })

      // Complete in 1 second
      setTimeout(() => {
        simulateSuccess(mockChildProcess, 'Done!')
      }, 1000)

      await vi.advanceTimersByTimeAsync(1000)
      await vi.runAllTimersAsync()

      const result = await promise
      expect(result.timedOut).toBe(false)
      expect(mockChildProcess.kill).not.toHaveBeenCalled()
    })
  })

  describe('Signal Handling', () => {
    it('should handle SIGTERM gracefully', async () => {
      const promise = spawnAsync('command', [])

      setImmediate(() => {
        mockChildProcess.exitCode = null
        mockChildProcess.signalCode = 'SIGTERM'
        mockChildProcess.emit('close', null, 'SIGTERM')
      })
      await vi.runAllTimersAsync()

      const result = await promise

      expect(result.exitCode).toBeNull()
      expect(result.signalCode).toBe('SIGTERM')
    })

    it('should handle SIGKILL', async () => {
      const promise = spawnAsync('command', [])

      setImmediate(() => {
        mockChildProcess.kill('SIGKILL')
        mockChildProcess.exitCode = null
        mockChildProcess.signalCode = 'SIGKILL'
        mockChildProcess.emit('close', null, 'SIGKILL')
      })
      await vi.runAllTimersAsync()

      const result = await promise

      expect(result.signalCode).toBe('SIGKILL')
    })
  })

  describe('Buffer Overflow Handling', () => {
    it('should reject when stdout exceeds maxBuffer', async () => {
      const largeOutput = 'x'.repeat(11 * 1024 * 1024) // 11MB

      const promise = spawnAsync('command', [], { maxBuffer: 10 * 1024 * 1024 })

      setImmediate(() => {
        mockChildProcess.stdout.push(largeOutput)
        mockChildProcess.stdout.emit('data', Buffer.from(largeOutput))
      })
      await vi.runAllTimersAsync()

      await expect(promise).rejects.toMatchObject({
        code: 'ERR_BUFFER_OVERFLOW',
        message: expect.stringContaining('maxBuffer'),
      })
    })

    it('should reject when stderr exceeds maxBuffer', async () => {
      const largeError = 'e'.repeat(11 * 1024 * 1024) // 11MB

      const promise = spawnAsync('command', [], { maxBuffer: 10 * 1024 * 1024 })

      setImmediate(() => {
        mockChildProcess.stderr.push(largeError)
        mockChildProcess.stderr.emit('data', Buffer.from(largeError))
      })
      await vi.runAllTimersAsync()

      await expect(promise).rejects.toMatchObject({
        code: 'ERR_BUFFER_OVERFLOW',
      })
    })
  })

  describe('Command Execution Errors', () => {
    it('should handle command not found (ENOENT)', async () => {
      const promise = spawnAsync('nonexistent-command', [])

      const error = new Error('spawn nonexistent-command ENOENT') as NodeJS.ErrnoException
      error.code = 'ENOENT'
      simulateError(mockChildProcess, error)
      await vi.runAllTimersAsync()

      await expect(promise).rejects.toMatchObject({
        code: 'ENOENT',
        message: expect.stringContaining('ENOENT'),
      })
    })

    it('should handle permission denied (EACCES)', async () => {
      const promise = spawnAsync('/usr/bin/restricted', [])

      const error = new Error('spawn EACCES') as NodeJS.ErrnoException
      error.code = 'EACCES'
      simulateError(mockChildProcess, error)
      await vi.runAllTimersAsync()

      await expect(promise).rejects.toMatchObject({
        code: 'EACCES',
      })
    })
  })

  describe('Options Handling', () => {
    it('should pass through cwd option', async () => {
      const promise = spawnAsync('pwd', [], { cwd: '/tmp' })
      simulateSuccess(mockChildProcess, '/tmp\n')
      await vi.runAllTimersAsync()

      await promise

      expect(spawn).toHaveBeenCalledWith('pwd', [], expect.objectContaining({ cwd: '/tmp' }))
    })

    it('should pass through env option', async () => {
      const customEnv = { ...process.env, CUSTOM_VAR: 'value' }

      const promise = spawnAsync('env', [], { env: customEnv })
      simulateSuccess(mockChildProcess, 'CUSTOM_VAR=value\n')
      await vi.runAllTimersAsync()

      await promise

      expect(spawn).toHaveBeenCalledWith('env', [], expect.objectContaining({ env: customEnv }))
    })

    it('should use custom encoding', async () => {
      const promise = spawnAsync('command', [], { encoding: 'base64' })
      simulateSuccess(mockChildProcess, 'SGVsbG8gV29ybGQ=')
      await vi.runAllTimersAsync()

      const result = await promise
      expect(result.stdout).toBe('SGVsbG8gV29ybGQ=')
    })
  })
})

// Helper functions (from earlier)
function createMockChildProcess() {
  const emitter = new EventEmitter() as any

  emitter.stdout = new Readable({ read() {} })
  emitter.stderr = new Readable({ read() {} })
  emitter.exitCode = null
  emitter.signalCode = null
  emitter.killed = false
  emitter.pid = Math.floor(Math.random() * 10000)

  emitter.kill = vi.fn((signal?: NodeJS.Signals | number) => {
    emitter.killed = true
    emitter.signalCode = signal || 'SIGTERM'
    return true
  })

  return emitter
}

function simulateSuccess(mock: any, stdout: string, stderr: string = '', exitCode: number = 0) {
  setImmediate(() => {
    if (stdout) {
      mock.stdout.push(stdout)
      mock.stdout.push(null)
    }
    if (stderr) {
      mock.stderr.push(stderr)
      mock.stderr.push(null)
    }
    mock.exitCode = exitCode
    mock.emit('close', exitCode, null)
  })
}

function simulateError(mock: any, error: Error) {
  setImmediate(() => {
    mock.emit('error', error)
  })
}

function simulateTimeout(mock: any, partialOutput: string = '') {
  if (partialOutput) {
    mock.stdout.push(partialOutput)
  }
}

function simulateStreamingOutput(mock: any, chunks: string[], delayMs: number = 50) {
  let index = 0
  const interval = setInterval(() => {
    if (index < chunks.length) {
      mock.stdout.push(chunks[index])
      index++
    } else {
      clearInterval(interval)
      mock.stdout.push(null)
      mock.exitCode = 0
      mock.emit('close', 0, null)
    }
  }, delayMs)
}
```

---

## 4. Integration Tests

For higher confidence, supplement unit tests with integration tests using real processes:

```typescript
// tests/integration/spawn.integration.test.ts
import { describe, it, expect } from 'vitest'
import { spawnAsync } from '@/utils/spawn'

describe('spawnAsync integration', () => {
  it('should execute real commands', async () => {
    const result = await spawnAsync('echo', ['hello world'])

    expect(result.stdout.trim()).toBe('hello world')
    expect(result.exitCode).toBe(0)
  })

  it('should handle real command failures', async () => {
    await expect(spawnAsync('ls', ['/nonexistent-directory'])).rejects.toMatchObject({
      code: 'ERR_COMMAND_FAILED',
      exitCode: expect.any(Number),
    })
  })

  it('should timeout real long-running processes', async () => {
    await expect(spawnAsync('sleep', ['10'], { timeout: 100 })).rejects.toMatchObject({
      code: 'ETIMEDOUT',
    })
  }, 10000) // Test timeout set higher than command timeout
})
```

---

## 5. Best Practices Summary

### Do's ✅

1. **Use fake timers** (`vi.useFakeTimers()`) for timeout tests
2. **Mock at module level** with `vi.mock('node:child_process')`
3. **Test both success and failure paths** for every feature
4. **Use `setImmediate()`** to simulate async process events
5. **Create reusable mock factories** for consistent testing
6. **Test edge cases**: timeouts, large buffers, signals, errors
7. **Verify cleanup**: Check that timers are cleared, streams are closed
8. **Use integration tests** for critical paths with real processes

### Don'ts ❌

1. **Don't test real child processes in unit tests** (too slow, flaky)
2. **Don't forget to advance timers** when using `vi.useFakeTimers()`
3. **Don't assume synchronous behavior** - use `await` with timers
4. **Don't ignore platform differences** (Windows vs Unix signals)
5. **Don't test implementation details** - test observable behavior
6. **Don't forget to clear mocks** between tests

---

## 6. Platform-Specific Considerations

### Unix/Linux/macOS

```typescript
it('should handle POSIX signals correctly', async () => {
  // Test SIGTERM, SIGKILL, SIGINT, etc.
  // These signals work as expected on Unix
})
```

### Windows

```typescript
import { platform } from 'node:os'

it.skipIf(platform() === 'win32')('should handle SIGTERM gracefully', async () => {
  // Skip on Windows where signals behave differently
})

it.runIf(platform() === 'win32')('should use Windows process termination', async () => {
  // Windows-specific test
})
```

---

## Sources

- [Vitest Mock child_process.exec Gist](https://gist.github.com/joemaller/f9171aa19a187f59f406ef1ffe87d9ac)
- [Testing Multiprocess Code in Node.js - Aha! Engineering](https://www.aha.io/engineering/articles/testing-multiprocess-code)
- [Vitest child_process Mocking Discussion](https://github.com/vitest-dev/vitest/discussions/2075)
- [Node.js Child Process Documentation](https://nodejs.org/api/child_process.html)
- [Vitest API Reference](https://vitest.dev/api/)
- [Vitest Timeout Configuration](https://vitest.dev/config/testtimeout)
- [Vitest Large Output Stack Overflow Issue](https://github.com/vitest-dev/vitest/issues/5614)
- [Node.js Process Signal Handling](https://nodejs.org/api/process.html)

---

## Conclusion

Testing child process wrappers requires careful attention to:

- **Asynchronous behavior** (events, streams, timers)
- **Edge cases** (timeouts, signals, buffer overflows)
- **Platform differences** (Windows vs Unix)
- **Proper mocking** (EventEmitter, streams, process lifecycle)

The patterns in this guide provide a comprehensive foundation for testing `spawnAsync` and similar utilities with confidence.
