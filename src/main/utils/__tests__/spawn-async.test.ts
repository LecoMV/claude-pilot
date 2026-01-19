/**
 * Spawn Async Utility Tests
 *
 * Tests for the spawn-async module that wraps child_process.spawn with async/await.
 *
 * @module spawn-async.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'events'
import {
  spawnAsync,
  spawnAsyncFull,
  commandExists,
  spawnWithProgress,
  SpawnAsyncError,
} from '../spawn-async'

// Mock child_process
vi.mock('child_process', () => {
  const mockSpawn = vi.fn()
  return {
    spawn: mockSpawn,
    type: { SpawnOptions: {}, ChildProcess: {} },
  }
})

// Get the mocked spawn function
import { spawn } from 'child_process'
const mockSpawn = vi.mocked(spawn)

// Helper to create a mock child process
function createMockChild() {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter
    stderr: EventEmitter
    kill: ReturnType<typeof vi.fn>
  }
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.kill = vi.fn()
  return child
}

describe('spawn-async', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ===========================================================================
  // SpawnAsyncError
  // ===========================================================================
  describe('SpawnAsyncError', () => {
    it('creates error with all properties', () => {
      const error = new SpawnAsyncError(
        'Test error',
        'stdout content',
        'stderr content',
        1,
        'SIGTERM',
        'test-cmd',
        ['arg1', 'arg2']
      )

      expect(error.message).toBe('Test error')
      expect(error.stdout).toBe('stdout content')
      expect(error.stderr).toBe('stderr content')
      expect(error.exitCode).toBe(1)
      expect(error.signal).toBe('SIGTERM')
      expect(error.command).toBe('test-cmd')
      expect(error.args).toEqual(['arg1', 'arg2'])
      expect(error.name).toBe('SpawnAsyncError')
    })

    it('extends Error', () => {
      const error = new SpawnAsyncError('Test', '', '', null, null, 'cmd', [])
      expect(error instanceof Error).toBe(true)
    })
  })

  // ===========================================================================
  // spawnAsyncFull
  // ===========================================================================
  describe('spawnAsyncFull', () => {
    it('resolves with stdout, stderr, and exit code on success', async () => {
      const mockChild = createMockChild()
      mockSpawn.mockReturnValue(mockChild as never)

      const promise = spawnAsyncFull('echo', ['hello'])

      // Simulate stdout
      mockChild.stdout.emit('data', Buffer.from('hello world'))

      // Simulate stderr
      mockChild.stderr.emit('data', Buffer.from('some warning'))

      // Simulate successful exit
      mockChild.emit('close', 0, null)

      const result = await promise

      expect(result.stdout).toBe('hello world')
      expect(result.stderr).toBe('some warning')
      expect(result.exitCode).toBe(0)
      expect(result.signal).toBeNull()
    })

    it('calls spawn with shell:false for security', async () => {
      const mockChild = createMockChild()
      mockSpawn.mockReturnValue(mockChild as never)

      const promise = spawnAsyncFull('test', ['arg'])
      mockChild.emit('close', 0, null)
      await promise

      expect(mockSpawn).toHaveBeenCalledWith('test', ['arg'], {
        shell: false,
      })
    })

    it('rejects on non-zero exit code', async () => {
      const mockChild = createMockChild()
      mockSpawn.mockReturnValue(mockChild as never)

      const promise = spawnAsyncFull('failing-cmd', [])

      mockChild.stderr.emit('data', Buffer.from('error message'))
      mockChild.emit('close', 1, null)

      await expect(promise).rejects.toThrow(SpawnAsyncError)
      await expect(promise).rejects.toThrow('Command failed with exit code 1')
    })

    it('allows non-zero exit with allowNonZeroExit option', async () => {
      const mockChild = createMockChild()
      mockSpawn.mockReturnValue(mockChild as never)

      const promise = spawnAsyncFull('grep', ['pattern'], {
        allowNonZeroExit: true,
      })

      mockChild.emit('close', 1, null)

      const result = await promise
      expect(result.exitCode).toBe(1)
    })

    it('handles spawn error', async () => {
      const mockChild = createMockChild()
      mockSpawn.mockReturnValue(mockChild as never)

      const promise = spawnAsyncFull('nonexistent-cmd', [])

      mockChild.emit('error', new Error('ENOENT: command not found'))

      await expect(promise).rejects.toThrow(SpawnAsyncError)
      await expect(promise).rejects.toThrow('Failed to spawn')
    })

    it('calls onStdout callback with data', async () => {
      const mockChild = createMockChild()
      mockSpawn.mockReturnValue(mockChild as never)

      const onStdout = vi.fn()
      const promise = spawnAsyncFull('cmd', [], { onStdout })

      const chunk = Buffer.from('data')
      mockChild.stdout.emit('data', chunk)
      mockChild.emit('close', 0, null)

      await promise

      expect(onStdout).toHaveBeenCalledWith(chunk)
    })

    it('calls onStderr callback with data', async () => {
      const mockChild = createMockChild()
      mockSpawn.mockReturnValue(mockChild as never)

      const onStderr = vi.fn()
      const promise = spawnAsyncFull('cmd', [], { onStderr })

      const chunk = Buffer.from('error')
      mockChild.stderr.emit('data', chunk)
      mockChild.emit('close', 0, null)

      await promise

      expect(onStderr).toHaveBeenCalledWith(chunk)
    })

    it('times out and kills process', async () => {
      const mockChild = createMockChild()
      mockSpawn.mockReturnValue(mockChild as never)

      const promise = spawnAsyncFull('slow-cmd', [], { timeout: 1000 })

      // Advance timer past timeout
      vi.advanceTimersByTime(1001)

      await expect(promise).rejects.toThrow('Command timed out after 1000ms')
      expect(mockChild.kill).toHaveBeenCalledWith('SIGTERM')
    })

    it('uses custom kill signal on timeout', async () => {
      const mockChild = createMockChild()
      mockSpawn.mockReturnValue(mockChild as never)

      const promise = spawnAsyncFull('slow-cmd', [], {
        timeout: 1000,
        killSignal: 'SIGKILL',
      })

      vi.advanceTimersByTime(1001)

      await expect(promise).rejects.toThrow(SpawnAsyncError)
      expect(mockChild.kill).toHaveBeenCalledWith('SIGKILL')
    })

    it('concatenates multiple stdout chunks', async () => {
      const mockChild = createMockChild()
      mockSpawn.mockReturnValue(mockChild as never)

      const promise = spawnAsyncFull('cmd', [])

      mockChild.stdout.emit('data', Buffer.from('hello '))
      mockChild.stdout.emit('data', Buffer.from('world'))
      mockChild.emit('close', 0, null)

      const result = await promise
      expect(result.stdout).toBe('hello world')
    })

    it('passes through spawn options', async () => {
      const mockChild = createMockChild()
      mockSpawn.mockReturnValue(mockChild as never)

      const promise = spawnAsyncFull('cmd', [], {
        cwd: '/some/dir',
        env: { MY_VAR: 'value' },
      })

      mockChild.emit('close', 0, null)
      await promise

      expect(mockSpawn).toHaveBeenCalledWith('cmd', [], {
        cwd: '/some/dir',
        env: { MY_VAR: 'value' },
        shell: false,
      })
    })

    it('handles null exit code', async () => {
      const mockChild = createMockChild()
      mockSpawn.mockReturnValue(mockChild as never)

      const promise = spawnAsyncFull('cmd', [], { allowNonZeroExit: true })

      mockChild.emit('close', null, 'SIGTERM')

      const result = await promise
      expect(result.exitCode).toBe(1) // Defaults to 1 when null
      expect(result.signal).toBe('SIGTERM')
    })
  })

  // ===========================================================================
  // spawnAsync
  // ===========================================================================
  describe('spawnAsync', () => {
    it('returns only stdout on success', async () => {
      const mockChild = createMockChild()
      mockSpawn.mockReturnValue(mockChild as never)

      const promise = spawnAsync('echo', ['hello'])

      mockChild.stdout.emit('data', Buffer.from('hello'))
      mockChild.emit('close', 0, null)

      const result = await promise
      expect(result).toBe('hello')
    })

    it('rejects on error', async () => {
      const mockChild = createMockChild()
      mockSpawn.mockReturnValue(mockChild as never)

      const promise = spawnAsync('failing-cmd', [])

      mockChild.emit('close', 1, null)

      await expect(promise).rejects.toThrow(SpawnAsyncError)
    })
  })

  // ===========================================================================
  // commandExists
  // ===========================================================================
  describe('commandExists', () => {
    it('returns true when command exists', async () => {
      const mockChild = createMockChild()
      mockSpawn.mockReturnValue(mockChild as never)

      const promise = commandExists('node')

      mockChild.stdout.emit('data', Buffer.from('/usr/bin/node'))
      mockChild.emit('close', 0, null)

      const result = await promise
      expect(result).toBe(true)
      expect(mockSpawn).toHaveBeenCalledWith('which', ['node'], expect.any(Object))
    })

    it('returns false when command does not exist', async () => {
      const mockChild = createMockChild()
      mockSpawn.mockReturnValue(mockChild as never)

      const promise = commandExists('nonexistent-command')

      mockChild.emit('close', 1, null)

      const result = await promise
      expect(result).toBe(false)
    })

    it('returns false on spawn error', async () => {
      const mockChild = createMockChild()
      mockSpawn.mockReturnValue(mockChild as never)

      const promise = commandExists('some-command')

      mockChild.emit('error', new Error('spawn error'))

      const result = await promise
      expect(result).toBe(false)
    })
  })

  // ===========================================================================
  // spawnWithProgress
  // ===========================================================================
  describe('spawnWithProgress', () => {
    it('calls onProgress for each complete line', async () => {
      const mockChild = createMockChild()
      mockSpawn.mockReturnValue(mockChild as never)

      const onProgress = vi.fn()
      const promise = spawnWithProgress('cmd', [], onProgress)

      // Emit data with newlines
      mockChild.stdout.emit('data', Buffer.from('line1\nline2\n'))
      mockChild.emit('close', 0, null)

      await promise

      expect(onProgress).toHaveBeenCalledWith('line1')
      expect(onProgress).toHaveBeenCalledWith('line2')
    })

    it('handles partial lines correctly', async () => {
      const mockChild = createMockChild()
      mockSpawn.mockReturnValue(mockChild as never)

      const onProgress = vi.fn()
      const promise = spawnWithProgress('cmd', [], onProgress)

      // Emit partial line, then rest
      mockChild.stdout.emit('data', Buffer.from('partial'))
      mockChild.stdout.emit('data', Buffer.from(' line\ncomplete\n'))
      mockChild.emit('close', 0, null)

      await promise

      expect(onProgress).toHaveBeenCalledWith('partial line')
      expect(onProgress).toHaveBeenCalledWith('complete')
    })

    it('emits remaining buffer after close', async () => {
      const mockChild = createMockChild()
      mockSpawn.mockReturnValue(mockChild as never)

      const onProgress = vi.fn()
      const promise = spawnWithProgress('cmd', [], onProgress)

      // Emit data without trailing newline
      mockChild.stdout.emit('data', Buffer.from('last line'))
      mockChild.emit('close', 0, null)

      await promise

      expect(onProgress).toHaveBeenCalledWith('last line')
    })

    it('skips empty lines', async () => {
      const mockChild = createMockChild()
      mockSpawn.mockReturnValue(mockChild as never)

      const onProgress = vi.fn()
      const promise = spawnWithProgress('cmd', [], onProgress)

      mockChild.stdout.emit('data', Buffer.from('line1\n\n\nline2\n'))
      mockChild.emit('close', 0, null)

      await promise

      expect(onProgress).toHaveBeenCalledTimes(2)
      expect(onProgress).toHaveBeenCalledWith('line1')
      expect(onProgress).toHaveBeenCalledWith('line2')
    })

    it('returns full stdout', async () => {
      const mockChild = createMockChild()
      mockSpawn.mockReturnValue(mockChild as never)

      const onProgress = vi.fn()
      const promise = spawnWithProgress('cmd', [], onProgress)

      mockChild.stdout.emit('data', Buffer.from('line1\nline2\n'))
      mockChild.emit('close', 0, null)

      const result = await promise
      expect(result).toBe('line1\nline2\n')
    })
  })
})
