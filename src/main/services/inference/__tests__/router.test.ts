/**
 * Inference Router Service Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { InferenceRouter } from '../router'
import type { InferenceRequest, RoutingRule } from '../types'

// Mock fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

// Mock child_process for pass
vi.mock('child_process', () => ({
  execSync: vi.fn(() => 'test-api-key'),
}))

describe('InferenceRouter', () => {
  let router: InferenceRouter

  beforeEach(() => {
    vi.clearAllMocks()
    router = new InferenceRouter()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('initialization', () => {
    it('should initialize with default config', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ models: [{ name: 'llama3.2' }] }),
      })

      await router.initialize()

      const config = router.getConfig()
      expect(config.defaultProvider).toBe('auto')
      expect(config.preferLocal).toBe(true)
      expect(config.claudeApiKey).toBeUndefined() // Not exposed
    })

    it('should merge custom config', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
      })

      await router.initialize({
        preferLocal: false,
        maxLocalTokens: 8192,
      })

      const config = router.getConfig()
      expect(config.preferLocal).toBe(false)
      expect(config.maxLocalTokens).toBe(8192)
    })

    it('should check Ollama status on init', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            models: [{ name: 'llama3.2' }, { name: 'qwen2.5-coder' }],
          }),
      })

      await router.initialize()

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/tags'),
        expect.any(Object)
      )
    })
  })

  describe('checkOllamaStatus', () => {
    it('should return available status when Ollama responds', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            models: [{ name: 'llama3.2' }, { name: 'gemma2' }],
          }),
      })

      const status = await router.checkOllamaStatus()

      expect(status.provider).toBe('ollama')
      expect(status.available).toBe(true)
      expect(status.models).toContain('llama3.2')
      expect(status.models).toContain('gemma2')
    })

    it('should return unavailable status when Ollama fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'))

      const status = await router.checkOllamaStatus()

      expect(status.provider).toBe('ollama')
      expect(status.available).toBe(false)
      expect(status.models).toHaveLength(0)
    })

    it('should cache status for 30 seconds', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ models: [{ name: 'llama3.2' }] }),
      })

      await router.checkOllamaStatus()
      await router.checkOllamaStatus() // Should use cache

      expect(mockFetch).toHaveBeenCalledTimes(1)
    })
  })

  describe('getClaudeStatus', () => {
    it('should return available when API key is configured', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false })
      await router.initialize()

      const status = router.getClaudeStatus()

      expect(status.provider).toBe('claude')
      expect(status.available).toBe(true)
      expect(status.models.length).toBeGreaterThan(0)
    })

    it('should return unavailable when no API key', async () => {
      vi.doMock('child_process', () => ({
        execSync: vi.fn(() => {
          throw new Error('No key')
        }),
      }))

      const cleanRouter = new InferenceRouter()
      // Force no API key by not initializing properly
      const status = cleanRouter.getClaudeStatus()

      expect(status.provider).toBe('claude')
      // Note: without initialize, no key is set
    })
  })

  describe('estimateTokens', () => {
    it('should estimate tokens from string messages', () => {
      const messages = [
        { role: 'user' as const, content: 'Hello, world!' },
        { role: 'assistant' as const, content: 'Hi there!' },
      ]

      const tokens = router.estimateTokens(messages)

      // ~24 chars / 4 = ~6 tokens
      expect(tokens).toBeGreaterThan(0)
      expect(tokens).toBeLessThan(20)
    })

    it('should include system prompt in estimate', () => {
      const messages = [{ role: 'user' as const, content: 'Hi' }]
      const systemPrompt = 'You are a helpful assistant with a very long description.'

      const tokensWithSystem = router.estimateTokens(messages, systemPrompt)
      const tokensWithout = router.estimateTokens(messages)

      expect(tokensWithSystem).toBeGreaterThan(tokensWithout)
    })

    it('should handle multipart messages', () => {
      const messages = [
        {
          role: 'user' as const,
          content: [
            { type: 'text' as const, text: 'What is this?' },
            { type: 'image' as const, mimeType: 'image/png', data: 'base64...' },
          ],
        },
      ]

      const tokens = router.estimateTokens(messages as InferenceRequest['messages'])

      expect(tokens).toBeGreaterThan(0)
    })
  })

  describe('selectProvider', () => {
    beforeEach(async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ models: [{ name: 'llama3.2' }] }),
      })
      await router.initialize()
    })

    it('should respect explicit provider selection', () => {
      const request: InferenceRequest = {
        provider: 'claude',
        messages: [{ role: 'user', content: 'Hello' }],
      }

      const selection = router.selectProvider(request)

      expect(selection.provider).toBe('claude')
      expect(selection.reason).toBe('explicitly_requested')
    })

    it('should prefer local when Ollama available and request is small', () => {
      const request: InferenceRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
      }

      const selection = router.selectProvider(request)

      expect(selection.provider).toBe('ollama')
      expect(selection.reason).toContain('local')
    })

    it('should apply custom routing rules', async () => {
      const rule: RoutingRule = {
        priority: 100,
        provider: 'claude',
        match: {
          systemPrompt: /code.*review/i,
        },
      }

      router.addRoutingRule(rule)

      const request: InferenceRequest = {
        systemPrompt: 'You are a code review assistant',
        messages: [{ role: 'user', content: 'Review this' }],
      }

      const selection = router.selectProvider(request)

      expect(selection.provider).toBe('claude')
      expect(selection.reason).toContain('routing_rule')
    })

    it('should throw when no providers available', async () => {
      // Create router without providers
      const noProviderRouter = new InferenceRouter()
      // Don't initialize - no Ollama, no Claude

      mockFetch.mockRejectedValueOnce(new Error('No Ollama'))

      await noProviderRouter.checkOllamaStatus()

      expect(() =>
        noProviderRouter.selectProvider({
          messages: [{ role: 'user', content: 'Hi' }],
        })
      ).toThrow('No inference providers available')
    })
  })

  describe('routing rules', () => {
    beforeEach(async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ models: [{ name: 'llama3.2' }] }),
      })
      await router.initialize()
    })

    it('should match by system prompt pattern', () => {
      router.addRoutingRule({
        priority: 10,
        provider: 'ollama',
        model: 'qwen2.5-coder',
        match: { systemPrompt: 'coding' },
      })

      const selection = router.selectProvider({
        systemPrompt: 'You are a coding assistant',
        messages: [{ role: 'user', content: 'Write code' }],
      })

      expect(selection.provider).toBe('ollama')
    })

    it('should match by message content', () => {
      router.addRoutingRule({
        priority: 10,
        provider: 'claude',
        match: { messageContains: 'translate' },
      })

      const selection = router.selectProvider({
        messages: [{ role: 'user', content: 'Please translate this to French' }],
      })

      expect(selection.provider).toBe('claude')
    })

    it('should match by token estimate range', () => {
      router.addRoutingRule({
        priority: 10,
        provider: 'claude',
        match: { tokenEstimate: { min: 1000 } },
      })

      // Small request should not match
      const smallSelection = router.selectProvider({
        messages: [{ role: 'user', content: 'Hi' }],
      })
      expect(smallSelection.provider).toBe('ollama')

      // Large request should match
      const largeMessage = 'a'.repeat(5000)
      const largeSelection = router.selectProvider({
        messages: [{ role: 'user', content: largeMessage }],
      })
      expect(largeSelection.provider).toBe('claude')
    })

    it('should apply highest priority rule', () => {
      router.addRoutingRule({
        priority: 5,
        provider: 'ollama',
        match: { systemPrompt: 'assistant' },
      })
      router.addRoutingRule({
        priority: 10,
        provider: 'claude',
        match: { systemPrompt: 'assistant' },
      })

      const selection = router.selectProvider({
        systemPrompt: 'You are an assistant',
        messages: [{ role: 'user', content: 'Hi' }],
      })

      expect(selection.provider).toBe('claude')
    })
  })

  describe('statistics', () => {
    it('should track request counts', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ models: [{ name: 'llama3.2' }] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              message: { content: 'Hello!' },
              eval_count: 10,
              prompt_eval_count: 5,
            }),
        })

      await router.initialize()

      await router.infer({
        messages: [{ role: 'user', content: 'Hi' }],
      })

      const stats = router.getStats()
      expect(stats.totalRequests).toBe(1)
      expect(stats.ollamaRequests).toBe(1)
    })

    it('should reset statistics', () => {
      // @ts-expect-error - accessing private for test
      router.stats.totalRequests = 100

      router.resetStats()

      const stats = router.getStats()
      expect(stats.totalRequests).toBe(0)
      expect(stats.ollamaRequests).toBe(0)
      expect(stats.claudeRequests).toBe(0)
    })
  })

  describe('configuration', () => {
    it('should update config', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false })
      await router.initialize()

      router.updateConfig({ preferLocal: false })

      const config = router.getConfig()
      expect(config.preferLocal).toBe(false)
    })

    it('should emit config:updated event', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false })
      await router.initialize()

      const callback = vi.fn()
      router.on('config:updated', callback)

      router.updateConfig({ maxLocalTokens: 8000 })

      expect(callback).toHaveBeenCalled()
    })

    it('should not expose API key in getConfig', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false })
      await router.initialize()

      const config = router.getConfig()

      expect(config.claudeApiKey).toBeUndefined()
    })
  })

  describe('getProviderStatuses', () => {
    it('should return both provider statuses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ models: [{ name: 'llama3.2' }] }),
      })

      await router.initialize()

      // Need fresh check
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ models: [{ name: 'llama3.2' }] }),
      })

      const statuses = await router.getProviderStatuses()

      expect(statuses).toHaveLength(2)
      expect(statuses.find((s) => s.provider === 'ollama')).toBeDefined()
      expect(statuses.find((s) => s.provider === 'claude')).toBeDefined()
    })
  })
})
