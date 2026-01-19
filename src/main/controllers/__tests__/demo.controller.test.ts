/**
 * Demo Controller Tests
 *
 * Comprehensive tests for the demo tRPC controller.
 * Tests all 3 procedures: ping, systemInfo, logMessage
 *
 * @module demo.controller.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { demoRouter } from '../demo.controller'
import { detectGPU, performSystemCheck } from '../../services/ollama'

// Mock the ollama services
vi.mock('../../services/ollama', () => ({
  detectGPU: vi.fn(),
  performSystemCheck: vi.fn(),
}))

// Create a test caller using createCaller pattern
const createTestCaller = () => demoRouter.createCaller({})

describe('demo.controller', () => {
  let caller: ReturnType<typeof createTestCaller>

  beforeEach(() => {
    vi.clearAllMocks()
    caller = createTestCaller()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ===========================================================================
  // PING PROCEDURE
  // ===========================================================================
  describe('ping', () => {
    it('should return pong with message', async () => {
      const result = await caller.ping({ message: 'Hello' })

      expect(result.pong).toBe('Received: Hello')
      expect(result.version).toBe('0.1.0')
      expect(result.timestamp).toBeDefined()
      expect(typeof result.timestamp).toBe('number')
    })

    it('should include timestamp close to now', async () => {
      const before = Date.now()
      const result = await caller.ping({ message: 'Test' })
      const after = Date.now()

      expect(result.timestamp).toBeGreaterThanOrEqual(before)
      expect(result.timestamp).toBeLessThanOrEqual(after)
    })

    it('should reject empty message', async () => {
      await expect(caller.ping({ message: '' })).rejects.toThrow()
    })

    it('should reject message exceeding 100 characters', async () => {
      const longMessage = 'a'.repeat(101)
      await expect(caller.ping({ message: longMessage })).rejects.toThrow()
    })

    it('should accept message at exact max length', async () => {
      const maxMessage = 'a'.repeat(100)
      const result = await caller.ping({ message: maxMessage })

      expect(result.pong).toBe(`Received: ${maxMessage}`)
    })

    it('should accept single character message', async () => {
      const result = await caller.ping({ message: 'x' })

      expect(result.pong).toBe('Received: x')
    })

    it('should handle special characters in message', async () => {
      const specialMessage = 'Hello! @#$%^&*() 123'
      const result = await caller.ping({ message: specialMessage })

      expect(result.pong).toBe(`Received: ${specialMessage}`)
    })

    it('should handle unicode characters in message', async () => {
      const unicodeMessage = 'Hello Monde'
      const result = await caller.ping({ message: unicodeMessage })

      expect(result.pong).toContain(unicodeMessage)
    })
  })

  // ===========================================================================
  // SYSTEM INFO PROCEDURE
  // ===========================================================================
  describe('systemInfo', () => {
    it('should return basic system info without GPU/Ollama', async () => {
      const result = await caller.systemInfo({
        includeGpu: false,
        includeOllama: false,
      })

      expect(result.platform).toBe(process.platform)
      expect(result.arch).toBe(process.arch)
      expect(result.nodeVersion).toBe(process.version)
      expect(result.electronVersion).toBe(process.versions.electron)
      expect(result.timestamp).toBeDefined()
      expect(result.gpu).toBeUndefined()
      expect(result.ollama).toBeUndefined()
    })

    it('should include GPU info when requested', async () => {
      const mockGpuInfo = {
        vendor: 'NVIDIA',
        renderer: 'GeForce RTX 4090',
        memoryMB: 24576,
      }
      vi.mocked(detectGPU).mockResolvedValue(mockGpuInfo)

      const result = await caller.systemInfo({
        includeGpu: true,
        includeOllama: false,
      })

      expect(result.gpu).toEqual(mockGpuInfo)
      expect(detectGPU).toHaveBeenCalledTimes(1)
    })

    it('should handle GPU detection failure', async () => {
      vi.mocked(detectGPU).mockRejectedValue(new Error('GPU not detected'))

      const result = await caller.systemInfo({
        includeGpu: true,
        includeOllama: false,
      })

      expect(result.gpu).toEqual({ error: 'Failed to detect GPU' })
    })

    it('should include Ollama info when requested', async () => {
      const mockSystemCheck = {
        ollama: {
          installed: true,
          running: true,
        },
        gpu: {
          available: true,
          vendor: 'NVIDIA',
          memoryMB: 24576,
          recommended: {
            name: 'llama2:7b',
            quantization: 'Q4_0',
          },
        },
        recommendedAction: 'Use recommended model',
      }
      vi.mocked(performSystemCheck).mockResolvedValue(mockSystemCheck)

      const result = await caller.systemInfo({
        includeGpu: false,
        includeOllama: true,
      })

      expect(result.ollama).toEqual({
        installed: true,
        running: true,
        recommendedModel: 'llama2:7b',
        recommendedAction: 'Use recommended model',
      })
      expect(performSystemCheck).toHaveBeenCalledTimes(1)
    })

    it('should handle Ollama check failure', async () => {
      vi.mocked(performSystemCheck).mockRejectedValue(new Error('Ollama not installed'))

      const result = await caller.systemInfo({
        includeGpu: false,
        includeOllama: true,
      })

      expect(result.ollama).toEqual({ error: 'Failed to check Ollama' })
    })

    it('should include both GPU and Ollama when requested', async () => {
      const mockGpuInfo = {
        vendor: 'NVIDIA',
        renderer: 'GeForce RTX 4090',
        memoryMB: 24576,
      }
      const mockSystemCheck = {
        ollama: {
          installed: true,
          running: true,
        },
        gpu: {
          available: true,
          vendor: 'NVIDIA',
          memoryMB: 24576,
          recommended: {
            name: 'llama2:7b',
            quantization: 'Q4_0',
          },
        },
        recommendedAction: 'Use recommended model',
      }
      vi.mocked(detectGPU).mockResolvedValue(mockGpuInfo)
      vi.mocked(performSystemCheck).mockResolvedValue(mockSystemCheck)

      const result = await caller.systemInfo({
        includeGpu: true,
        includeOllama: true,
      })

      expect(result.gpu).toEqual(mockGpuInfo)
      expect(result.ollama).toBeDefined()
      expect(detectGPU).toHaveBeenCalledTimes(1)
      expect(performSystemCheck).toHaveBeenCalledTimes(1)
    })

    it('should use default values when no input provided', async () => {
      const result = await caller.systemInfo({})

      expect(result.platform).toBeDefined()
      expect(result.gpu).toBeUndefined()
      expect(result.ollama).toBeUndefined()
    })

    it('should handle both GPU and Ollama failures gracefully', async () => {
      vi.mocked(detectGPU).mockRejectedValue(new Error('GPU error'))
      vi.mocked(performSystemCheck).mockRejectedValue(new Error('Ollama error'))

      const result = await caller.systemInfo({
        includeGpu: true,
        includeOllama: true,
      })

      expect(result.gpu).toEqual({ error: 'Failed to detect GPU' })
      expect(result.ollama).toEqual({ error: 'Failed to check Ollama' })
    })
  })

  // ===========================================================================
  // LOG MESSAGE PROCEDURE
  // ===========================================================================
  describe('logMessage', () => {
    it('should log info level message', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})

      const result = await caller.logMessage({
        level: 'info',
        message: 'Test info message',
      })

      expect(result.logged).toBe(true)
      expect(result.timestamp).toBeDefined()
      expect(consoleSpy).toHaveBeenCalledWith('[Demo] Test info message', '')

      consoleSpy.mockRestore()
    })

    it('should log warn level message', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const result = await caller.logMessage({
        level: 'warn',
        message: 'Test warning message',
      })

      expect(result.logged).toBe(true)
      expect(consoleSpy).toHaveBeenCalledWith('[Demo] Test warning message', '')

      consoleSpy.mockRestore()
    })

    it('should log error level message', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const result = await caller.logMessage({
        level: 'error',
        message: 'Test error message',
      })

      expect(result.logged).toBe(true)
      expect(consoleSpy).toHaveBeenCalledWith('[Demo] Test error message', '')

      consoleSpy.mockRestore()
    })

    it('should include metadata when provided', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
      const metadata = { userId: 123, action: 'test' }

      const result = await caller.logMessage({
        level: 'info',
        message: 'Message with metadata',
        metadata,
      })

      expect(result.logged).toBe(true)
      expect(consoleSpy).toHaveBeenCalledWith('[Demo] Message with metadata', metadata)

      consoleSpy.mockRestore()
    })

    it('should handle empty metadata object', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})

      const result = await caller.logMessage({
        level: 'info',
        message: 'Message with empty metadata',
        metadata: {},
      })

      expect(result.logged).toBe(true)
      expect(consoleSpy).toHaveBeenCalledWith('[Demo] Message with empty metadata', {})

      consoleSpy.mockRestore()
    })

    it('should handle complex metadata', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
      const complexMetadata = {
        nested: { key: 'value' },
        array: [1, 2, 3],
        nullValue: null,
        boolValue: true,
        numberValue: 42,
      }

      const result = await caller.logMessage({
        level: 'info',
        message: 'Complex metadata',
        metadata: complexMetadata,
      })

      expect(result.logged).toBe(true)
      expect(consoleSpy).toHaveBeenCalledWith('[Demo] Complex metadata', complexMetadata)

      consoleSpy.mockRestore()
    })

    it('should reject invalid log level', async () => {
      await expect(
        caller.logMessage({
          level: 'debug' as never,
          message: 'Test',
        })
      ).rejects.toThrow()
    })

    it('should return timestamp close to now', async () => {
      vi.spyOn(console, 'info').mockImplementation(() => {})

      const before = Date.now()
      const result = await caller.logMessage({
        level: 'info',
        message: 'Test',
      })
      const after = Date.now()

      expect(result.timestamp).toBeGreaterThanOrEqual(before)
      expect(result.timestamp).toBeLessThanOrEqual(after)
    })
  })

  // ===========================================================================
  // INTEGRATION-STYLE TESTS
  // ===========================================================================
  describe('demo lifecycle', () => {
    it('should handle full ping-log cycle', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})

      // Ping
      const pingResult = await caller.ping({ message: 'Hello from test' })
      expect(pingResult.pong).toBe('Received: Hello from test')

      // Log
      const logResult = await caller.logMessage({
        level: 'info',
        message: 'Ping received',
        metadata: { pong: pingResult.pong },
      })
      expect(logResult.logged).toBe(true)

      consoleSpy.mockRestore()
    })

    it('should handle system info with mixed results', async () => {
      vi.mocked(detectGPU).mockResolvedValue({
        vendor: 'NVIDIA',
        renderer: 'RTX 4090',
        memoryMB: 24576,
      })
      vi.mocked(performSystemCheck).mockRejectedValue(new Error('Ollama not available'))

      const result = await caller.systemInfo({
        includeGpu: true,
        includeOllama: true,
      })

      expect(result.gpu).toEqual({
        vendor: 'NVIDIA',
        renderer: 'RTX 4090',
        memoryMB: 24576,
      })
      expect(result.ollama).toEqual({ error: 'Failed to check Ollama' })
    })
  })

  // ===========================================================================
  // EDGE CASES
  // ===========================================================================
  describe('edge cases', () => {
    it('should handle concurrent ping requests', async () => {
      const results = await Promise.all([
        caller.ping({ message: 'Message 1' }),
        caller.ping({ message: 'Message 2' }),
        caller.ping({ message: 'Message 3' }),
      ])

      expect(results).toHaveLength(3)
      expect(results[0].pong).toBe('Received: Message 1')
      expect(results[1].pong).toBe('Received: Message 2')
      expect(results[2].pong).toBe('Received: Message 3')
    })

    it('should handle concurrent system info requests', async () => {
      vi.mocked(detectGPU).mockResolvedValue({ vendor: 'NVIDIA' })
      vi.mocked(performSystemCheck).mockResolvedValue({
        ollama: { installed: true, running: true },
        gpu: { available: true, vendor: 'NVIDIA', memoryMB: 8192, recommended: { name: 'llama2', quantization: 'Q4' } },
        recommendedAction: 'Use GPU',
      })

      const results = await Promise.all([
        caller.systemInfo({ includeGpu: true, includeOllama: true }),
        caller.systemInfo({ includeGpu: false, includeOllama: true }),
        caller.systemInfo({ includeGpu: true, includeOllama: false }),
      ])

      expect(results).toHaveLength(3)
      expect(results[0].gpu).toBeDefined()
      expect(results[0].ollama).toBeDefined()
      expect(results[1].gpu).toBeUndefined()
      expect(results[1].ollama).toBeDefined()
      expect(results[2].gpu).toBeDefined()
      expect(results[2].ollama).toBeUndefined()
    })

    it('should handle concurrent log requests', async () => {
      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const results = await Promise.all([
        caller.logMessage({ level: 'info', message: 'Info 1' }),
        caller.logMessage({ level: 'warn', message: 'Warn 1' }),
        caller.logMessage({ level: 'error', message: 'Error 1' }),
      ])

      expect(results).toHaveLength(3)
      results.forEach((result) => {
        expect(result.logged).toBe(true)
      })

      infoSpy.mockRestore()
      warnSpy.mockRestore()
      errorSpy.mockRestore()
    })

    it('should handle whitespace-only message', async () => {
      // Whitespace-only should fail because min length is 1 non-empty char
      // But actually the schema only checks min length, not content
      // Let's verify the actual behavior
      const result = await caller.ping({ message: '   ' })
      expect(result.pong).toBe('Received:    ')
    })

    it('should handle message with newlines', async () => {
      const result = await caller.ping({ message: 'Line1\nLine2' })
      expect(result.pong).toBe('Received: Line1\nLine2')
    })

    it('should handle message with tabs', async () => {
      const result = await caller.ping({ message: 'Col1\tCol2' })
      expect(result.pong).toBe('Received: Col1\tCol2')
    })
  })

  // ===========================================================================
  // SECURITY TESTS
  // ===========================================================================
  describe('security', () => {
    it('should not execute code in message', async () => {
      const maliciousMessage = '${process.exit(1)}'
      const result = await caller.ping({ message: maliciousMessage })

      // Should just return the string, not execute it
      expect(result.pong).toBe('Received: ${process.exit(1)}')
    })

    it('should handle injection attempts in metadata', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})

      const maliciousMetadata = {
        __proto__: { polluted: true },
        constructor: 'malicious',
      }

      const result = await caller.logMessage({
        level: 'info',
        message: 'Test',
        metadata: maliciousMetadata,
      })

      expect(result.logged).toBe(true)
      // Verify prototype wasn't polluted
      expect(({} as Record<string, unknown>).polluted).toBeUndefined()

      consoleSpy.mockRestore()
    })
  })
})
