import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useBudgetStore, selectBudgetPercentage } from '@/stores/budget'
import type { ExternalSession } from '../../../shared/types'

// Mock tRPC client
vi.mock('@/lib/trpc/client', () => ({
  trpc: {
    settings: {
      get: {
        query: vi.fn(),
      },
      setBudget: {
        mutate: vi.fn(),
      },
    },
  },
}))

describe('Budget Store', () => {
  const defaultBudgetSettings = {
    billingType: 'subscription' as const,
    subscriptionPlan: 'max' as const,
    monthlyLimit: 100,
    warningThreshold: 80,
    alertsEnabled: true,
  }

  beforeEach(() => {
    // Reset the store to initial state
    useBudgetStore.setState({
      budgetSettings: { ...defaultBudgetSettings },
      currentMonthCost: 0,
      todayCost: 0,
      activeSessions: [],
      costByModel: [],
      dailyCosts: [],
      isLoading: false,
      lastUpdate: 0,
      budgetWarning: false,
      budgetExceeded: false,
    })
  })

  describe('initial state', () => {
    it('should have correct default values', () => {
      const state = useBudgetStore.getState()
      expect(state.budgetSettings.billingType).toBe('subscription')
      expect(state.budgetSettings.subscriptionPlan).toBe('max')
      expect(state.budgetSettings.monthlyLimit).toBe(100)
      expect(state.budgetSettings.warningThreshold).toBe(80)
      expect(state.budgetSettings.alertsEnabled).toBe(true)
      expect(state.currentMonthCost).toBe(0)
      expect(state.todayCost).toBe(0)
      expect(state.activeSessions).toEqual([])
      expect(state.costByModel).toEqual([])
      expect(state.dailyCosts).toEqual([])
      expect(state.isLoading).toBe(false)
      expect(state.lastUpdate).toBe(0)
      expect(state.budgetWarning).toBe(false)
      expect(state.budgetExceeded).toBe(false)
    })
  })

  describe('setBudgetSettings', () => {
    it('should update budget settings with partial update', () => {
      useBudgetStore.getState().setBudgetSettings({ monthlyLimit: 200 })
      expect(useBudgetStore.getState().budgetSettings.monthlyLimit).toBe(200)
      // Other settings should remain unchanged
      expect(useBudgetStore.getState().budgetSettings.billingType).toBe('subscription')
    })

    it('should update billing type to api', () => {
      useBudgetStore.getState().setBudgetSettings({ billingType: 'api' })
      expect(useBudgetStore.getState().budgetSettings.billingType).toBe('api')
    })

    it('should update subscription plan', () => {
      useBudgetStore.getState().setBudgetSettings({ subscriptionPlan: 'pro' })
      expect(useBudgetStore.getState().budgetSettings.subscriptionPlan).toBe('pro')
    })

    it('should update warning threshold', () => {
      useBudgetStore.getState().setBudgetSettings({ warningThreshold: 90 })
      expect(useBudgetStore.getState().budgetSettings.warningThreshold).toBe(90)
    })

    it('should disable alerts', () => {
      useBudgetStore.getState().setBudgetSettings({ alertsEnabled: false })
      expect(useBudgetStore.getState().budgetSettings.alertsEnabled).toBe(false)
    })

    it('should recalculate budget warning when settings change', () => {
      // Set current month cost to 85 (85% of 100)
      useBudgetStore.setState({ currentMonthCost: 85 })

      // With default 80% threshold, should trigger warning
      useBudgetStore.getState().setBudgetSettings({ warningThreshold: 80 })
      expect(useBudgetStore.getState().budgetWarning).toBe(true)

      // Increase threshold to 90%, warning should go away
      useBudgetStore.getState().setBudgetSettings({ warningThreshold: 90 })
      expect(useBudgetStore.getState().budgetWarning).toBe(false)
    })

    it('should set budgetExceeded when cost exceeds limit', () => {
      useBudgetStore.setState({ currentMonthCost: 150 })
      useBudgetStore.getState().setBudgetSettings({ monthlyLimit: 100 })
      expect(useBudgetStore.getState().budgetExceeded).toBe(true)
    })

    it('should update multiple settings at once', () => {
      useBudgetStore.getState().setBudgetSettings({
        billingType: 'api',
        monthlyLimit: 500,
        warningThreshold: 75,
      })
      const settings = useBudgetStore.getState().budgetSettings
      expect(settings.billingType).toBe('api')
      expect(settings.monthlyLimit).toBe(500)
      expect(settings.warningThreshold).toBe(75)
    })
  })

  describe('calculateCosts', () => {
    const createMockSession = (overrides: Partial<ExternalSession> = {}): ExternalSession => {
      const now = new Date()
      return {
        id: `session-${Math.random().toString(36).substr(2, 9)}`,
        projectPath: '/home/user/project',
        projectName: 'test-project',
        filePath: '/home/user/.claude/sessions/test.jsonl',
        startTime: now.getTime(),
        lastActivity: now.getTime(),
        isActive: false,
        model: 'claude-sonnet-4-5-20250929',
        stats: {
          messageCount: 10,
          userMessages: 5,
          assistantMessages: 5,
          toolCalls: 3,
          inputTokens: 1000,
          outputTokens: 500,
          cachedTokens: 200,
        },
        ...overrides,
      }
    }

    it('should calculate current month cost from sessions', () => {
      const sessions = [
        createMockSession({
          startTime: Date.now(),
          stats: {
            messageCount: 10,
            userMessages: 5,
            assistantMessages: 5,
            toolCalls: 3,
            inputTokens: 10000,
            outputTokens: 5000,
            cachedTokens: 1000,
          },
        }),
      ]

      useBudgetStore.getState().calculateCosts(sessions)
      expect(useBudgetStore.getState().currentMonthCost).toBeGreaterThan(0)
    })

    it('should calculate today cost for sessions from today', () => {
      const today = new Date()
      const sessions = [
        createMockSession({
          startTime: today.getTime(),
          stats: {
            messageCount: 10,
            userMessages: 5,
            assistantMessages: 5,
            toolCalls: 3,
            inputTokens: 10000,
            outputTokens: 5000,
            cachedTokens: 1000,
          },
        }),
      ]

      useBudgetStore.getState().calculateCosts(sessions)
      expect(useBudgetStore.getState().todayCost).toBeGreaterThan(0)
    })

    it('should not include yesterday sessions in today cost', () => {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)

      const sessions = [
        createMockSession({
          startTime: yesterday.getTime(),
          stats: {
            messageCount: 10,
            userMessages: 5,
            assistantMessages: 5,
            toolCalls: 3,
            inputTokens: 10000,
            outputTokens: 5000,
            cachedTokens: 1000,
          },
        }),
      ]

      useBudgetStore.getState().calculateCosts(sessions)
      expect(useBudgetStore.getState().todayCost).toBe(0)
      expect(useBudgetStore.getState().currentMonthCost).toBeGreaterThan(0)
    })

    it('should filter out sessions from previous months', () => {
      const lastMonth = new Date()
      lastMonth.setMonth(lastMonth.getMonth() - 1)

      const sessions = [
        createMockSession({
          startTime: lastMonth.getTime(),
          stats: {
            messageCount: 10,
            userMessages: 5,
            assistantMessages: 5,
            toolCalls: 3,
            inputTokens: 10000,
            outputTokens: 5000,
            cachedTokens: 1000,
          },
        }),
      ]

      useBudgetStore.getState().calculateCosts(sessions)
      expect(useBudgetStore.getState().currentMonthCost).toBe(0)
    })

    it('should aggregate costs by model', () => {
      const sessions = [
        createMockSession({
          model: 'claude-opus-4-5-20251101',
          stats: {
            messageCount: 10,
            userMessages: 5,
            assistantMessages: 5,
            toolCalls: 3,
            inputTokens: 10000,
            outputTokens: 5000,
            cachedTokens: 1000,
          },
        }),
        createMockSession({
          model: 'claude-sonnet-4-5-20250929',
          stats: {
            messageCount: 5,
            userMessages: 3,
            assistantMessages: 2,
            toolCalls: 1,
            inputTokens: 5000,
            outputTokens: 2000,
            cachedTokens: 500,
          },
        }),
        createMockSession({
          model: 'claude-opus-4-5-20251101',
          stats: {
            messageCount: 3,
            userMessages: 2,
            assistantMessages: 1,
            toolCalls: 0,
            inputTokens: 3000,
            outputTokens: 1000,
            cachedTokens: 200,
          },
        }),
      ]

      useBudgetStore.getState().calculateCosts(sessions)
      const costByModel = useBudgetStore.getState().costByModel

      expect(costByModel).toHaveLength(2)
      const opusCost = costByModel.find((c) => c.modelId === 'claude-opus-4-5-20251101')
      expect(opusCost).toBeDefined()
      expect(opusCost!.sessionCount).toBe(2)
      expect(opusCost!.inputTokens).toBe(13000)
      expect(opusCost!.outputTokens).toBe(6000)
    })

    it('should sort cost by model in descending order', () => {
      const sessions = [
        createMockSession({
          model: 'claude-haiku-3-5-20241022',
          stats: {
            messageCount: 10,
            userMessages: 5,
            assistantMessages: 5,
            toolCalls: 3,
            inputTokens: 1000,
            outputTokens: 500,
            cachedTokens: 100,
          },
        }),
        createMockSession({
          model: 'claude-opus-4-5-20251101',
          stats: {
            messageCount: 10,
            userMessages: 5,
            assistantMessages: 5,
            toolCalls: 3,
            inputTokens: 10000,
            outputTokens: 5000,
            cachedTokens: 1000,
          },
        }),
      ]

      useBudgetStore.getState().calculateCosts(sessions)
      const costByModel = useBudgetStore.getState().costByModel

      // Opus should be first due to higher cost
      expect(costByModel[0].modelId).toBe('claude-opus-4-5-20251101')
    })

    it('should aggregate daily costs', () => {
      const today = new Date()
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)

      const sessions = [
        createMockSession({
          startTime: today.getTime(),
          stats: {
            messageCount: 10,
            userMessages: 5,
            assistantMessages: 5,
            toolCalls: 3,
            inputTokens: 10000,
            outputTokens: 5000,
            cachedTokens: 1000,
          },
        }),
        createMockSession({
          startTime: yesterday.getTime(),
          stats: {
            messageCount: 5,
            userMessages: 3,
            assistantMessages: 2,
            toolCalls: 1,
            inputTokens: 5000,
            outputTokens: 2000,
            cachedTokens: 500,
          },
        }),
      ]

      useBudgetStore.getState().calculateCosts(sessions)
      const dailyCosts = useBudgetStore.getState().dailyCosts

      expect(dailyCosts).toHaveLength(2)
      // Should be sorted by date ascending
      expect(new Date(dailyCosts[0].date) < new Date(dailyCosts[1].date)).toBe(true)
    })

    it('should identify active sessions', () => {
      const sessions = [
        createMockSession({
          id: 'session-1',
          isActive: true,
          projectName: 'active-project',
          model: 'claude-sonnet-4-5-20250929',
        }),
        createMockSession({
          id: 'session-2',
          isActive: false,
          projectName: 'inactive-project',
        }),
      ]

      useBudgetStore.getState().calculateCosts(sessions)
      const activeSessions = useBudgetStore.getState().activeSessions

      expect(activeSessions).toHaveLength(1)
      expect(activeSessions[0].sessionId).toBe('session-1')
      expect(activeSessions[0].projectName).toBe('active-project')
      expect(activeSessions[0].model).toBe('claude-sonnet-4-5-20250929')
    })

    it('should set budget warning when threshold exceeded', () => {
      // Set monthly limit to 10
      useBudgetStore.getState().setBudgetSettings({ monthlyLimit: 10 })

      const sessions = [
        createMockSession({
          model: 'claude-opus-4-5-20251101',
          stats: {
            messageCount: 100,
            userMessages: 50,
            assistantMessages: 50,
            toolCalls: 30,
            inputTokens: 1000000,
            outputTokens: 200000,
            cachedTokens: 100000,
          },
        }),
      ]

      useBudgetStore.getState().calculateCosts(sessions)
      expect(useBudgetStore.getState().budgetWarning).toBe(true)
    })

    it('should set budget exceeded when 100% reached', () => {
      useBudgetStore.getState().setBudgetSettings({ monthlyLimit: 0.01 })

      const sessions = [
        createMockSession({
          model: 'claude-opus-4-5-20251101',
          stats: {
            messageCount: 100,
            userMessages: 50,
            assistantMessages: 50,
            toolCalls: 30,
            inputTokens: 100000,
            outputTokens: 50000,
            cachedTokens: 10000,
          },
        }),
      ]

      useBudgetStore.getState().calculateCosts(sessions)
      expect(useBudgetStore.getState().budgetExceeded).toBe(true)
    })

    it('should update lastUpdate timestamp', () => {
      const before = Date.now()
      useBudgetStore.getState().calculateCosts([])
      const after = Date.now()

      const lastUpdate = useBudgetStore.getState().lastUpdate
      expect(lastUpdate).toBeGreaterThanOrEqual(before)
      expect(lastUpdate).toBeLessThanOrEqual(after)
    })

    it('should handle sessions without model using estimatedCost', () => {
      const sessions = [
        createMockSession({
          model: undefined,
          stats: {
            messageCount: 10,
            userMessages: 5,
            assistantMessages: 5,
            toolCalls: 3,
            inputTokens: 10000,
            outputTokens: 5000,
            cachedTokens: 1000,
            estimatedCost: 0.5,
          },
        }),
      ]

      useBudgetStore.getState().calculateCosts(sessions)
      expect(useBudgetStore.getState().currentMonthCost).toBe(0.5)
    })

    it('should handle empty sessions array', () => {
      useBudgetStore.getState().calculateCosts([])

      expect(useBudgetStore.getState().currentMonthCost).toBe(0)
      expect(useBudgetStore.getState().todayCost).toBe(0)
      expect(useBudgetStore.getState().activeSessions).toEqual([])
      expect(useBudgetStore.getState().costByModel).toEqual([])
      expect(useBudgetStore.getState().dailyCosts).toEqual([])
    })
  })

  describe('loadBudgetSettings', () => {
    it('should set isLoading while loading', async () => {
      const { trpc } = await import('@/lib/trpc/client')
      vi.mocked(trpc.settings.get.query).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(null), 100))
      )

      const loadPromise = useBudgetStore.getState().loadBudgetSettings()
      expect(useBudgetStore.getState().isLoading).toBe(true)
      await loadPromise
    })

    it('should load budget settings from trpc', async () => {
      const { trpc } = await import('@/lib/trpc/client')
      vi.mocked(trpc.settings.get.query).mockResolvedValue({
        budget: {
          billingType: 'api',
          monthlyLimit: 500,
          warningThreshold: 70,
          alertsEnabled: false,
        },
      })

      await useBudgetStore.getState().loadBudgetSettings()

      const settings = useBudgetStore.getState().budgetSettings
      expect(settings.billingType).toBe('api')
      expect(settings.monthlyLimit).toBe(500)
      expect(settings.warningThreshold).toBe(70)
      expect(settings.alertsEnabled).toBe(false)
      expect(useBudgetStore.getState().isLoading).toBe(false)
    })

    it('should keep defaults when no budget settings returned', async () => {
      const { trpc } = await import('@/lib/trpc/client')
      vi.mocked(trpc.settings.get.query).mockResolvedValue({})

      await useBudgetStore.getState().loadBudgetSettings()

      const settings = useBudgetStore.getState().budgetSettings
      expect(settings.billingType).toBe('subscription')
      expect(settings.monthlyLimit).toBe(100)
      expect(useBudgetStore.getState().isLoading).toBe(false)
    })

    it('should handle errors gracefully', async () => {
      const { trpc } = await import('@/lib/trpc/client')
      vi.mocked(trpc.settings.get.query).mockRejectedValue(new Error('Network error'))
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await useBudgetStore.getState().loadBudgetSettings()

      expect(useBudgetStore.getState().isLoading).toBe(false)
      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })
  })

  describe('saveBudgetSettings', () => {
    it('should save budget settings via trpc', async () => {
      const { trpc } = await import('@/lib/trpc/client')
      vi.mocked(trpc.settings.setBudget.mutate).mockResolvedValue(true)

      useBudgetStore.getState().setBudgetSettings({ monthlyLimit: 250 })
      const result = await useBudgetStore.getState().saveBudgetSettings()

      expect(result).toBe(true)
      expect(trpc.settings.setBudget.mutate).toHaveBeenCalledWith(
        expect.objectContaining({ monthlyLimit: 250 })
      )
    })

    it('should return false on save failure', async () => {
      const { trpc } = await import('@/lib/trpc/client')
      vi.mocked(trpc.settings.setBudget.mutate).mockRejectedValue(new Error('Save failed'))
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const result = await useBudgetStore.getState().saveBudgetSettings()

      expect(result).toBe(false)
      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })
  })

  describe('selectBudgetPercentage', () => {
    it('should return 0 when monthly limit is 0', () => {
      useBudgetStore.setState({
        budgetSettings: { ...defaultBudgetSettings, monthlyLimit: 0 },
        currentMonthCost: 50,
      })

      const percentage = selectBudgetPercentage(useBudgetStore.getState())
      expect(percentage).toBe(0)
    })

    it('should calculate correct percentage', () => {
      useBudgetStore.setState({
        budgetSettings: { ...defaultBudgetSettings, monthlyLimit: 100 },
        currentMonthCost: 25,
      })

      const percentage = selectBudgetPercentage(useBudgetStore.getState())
      expect(percentage).toBe(25)
    })

    it('should handle percentage over 100', () => {
      useBudgetStore.setState({
        budgetSettings: { ...defaultBudgetSettings, monthlyLimit: 100 },
        currentMonthCost: 150,
      })

      const percentage = selectBudgetPercentage(useBudgetStore.getState())
      expect(percentage).toBe(150)
    })

    it('should return 0 when no cost', () => {
      useBudgetStore.setState({
        budgetSettings: { ...defaultBudgetSettings, monthlyLimit: 100 },
        currentMonthCost: 0,
      })

      const percentage = selectBudgetPercentage(useBudgetStore.getState())
      expect(percentage).toBe(0)
    })
  })
})
