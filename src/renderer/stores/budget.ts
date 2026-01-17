import { create } from 'zustand'
import type { ExternalSession, BudgetSettings } from '../../shared/types'
import { calculateSessionCost, MODEL_CAPABILITIES } from '../../shared/types'

export type { BudgetSettings }

export interface CostBreakdown {
  modelId: string
  modelName: string
  cost: number
  inputTokens: number
  outputTokens: number
  cachedTokens: number
  sessionCount: number
}

export interface DailyCost {
  date: string // YYYY-MM-DD
  cost: number
  sessions: number
}

interface BudgetState {
  // Budget configuration
  budgetSettings: BudgetSettings

  // Calculated costs
  currentMonthCost: number
  todayCost: number
  activeSessions: {
    sessionId: string
    projectName: string
    cost: number
    model: string
  }[]

  // Breakdown data
  costByModel: CostBreakdown[]
  dailyCosts: DailyCost[]

  // Status
  isLoading: boolean
  lastUpdate: number
  budgetWarning: boolean
  budgetExceeded: boolean

  // Actions
  setBudgetSettings: (settings: Partial<BudgetSettings>) => void
  calculateCosts: (sessions: ExternalSession[]) => void
  loadBudgetSettings: () => Promise<void>
  saveBudgetSettings: () => Promise<boolean>
}

const defaultBudgetSettings: BudgetSettings = {
  monthlyLimit: 100, // $100/month default
  warningThreshold: 80, // Warn at 80%
  alertsEnabled: true,
}

export const useBudgetStore = create<BudgetState>((set, get) => ({
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

  setBudgetSettings: (settings) =>
    set((state) => {
      const newSettings = { ...state.budgetSettings, ...settings }
      // Recalculate warnings with new settings
      const percentage = (state.currentMonthCost / newSettings.monthlyLimit) * 100
      return {
        budgetSettings: newSettings,
        budgetWarning: percentage >= newSettings.warningThreshold,
        budgetExceeded: percentage >= 100,
      }
    }),

  calculateCosts: (sessions: ExternalSession[]) => {
    const now = new Date()
    const currentMonth = now.getMonth()
    const currentYear = now.getFullYear()
    const today = now.toISOString().split('T')[0]

    // Filter to current month sessions
    const monthSessions = sessions.filter((s) => {
      const sessionDate = new Date(s.startTime)
      return (
        sessionDate.getMonth() === currentMonth &&
        sessionDate.getFullYear() === currentYear
      )
    })

    // Calculate total costs
    let currentMonthCost = 0
    let todayCost = 0
    const modelCosts: Map<string, CostBreakdown> = new Map()
    const dailyCostsMap: Map<string, DailyCost> = new Map()

    for (const session of monthSessions) {
      const cost = session.model
        ? calculateSessionCost(
            session.stats.inputTokens,
            session.stats.outputTokens,
            session.stats.cachedTokens,
            session.model
          )
        : session.stats.estimatedCost || 0

      currentMonthCost += cost

      // Today's cost
      const sessionDate = new Date(session.startTime).toISOString().split('T')[0]
      if (sessionDate === today) {
        todayCost += cost
      }

      // Cost by model
      if (session.model) {
        const existing = modelCosts.get(session.model) || {
          modelId: session.model,
          modelName: MODEL_CAPABILITIES[session.model]?.name || session.model,
          cost: 0,
          inputTokens: 0,
          outputTokens: 0,
          cachedTokens: 0,
          sessionCount: 0,
        }
        existing.cost += cost
        existing.inputTokens += session.stats.inputTokens
        existing.outputTokens += session.stats.outputTokens
        existing.cachedTokens += session.stats.cachedTokens
        existing.sessionCount += 1
        modelCosts.set(session.model, existing)
      }

      // Daily costs
      const dailyExisting = dailyCostsMap.get(sessionDate) || {
        date: sessionDate,
        cost: 0,
        sessions: 0,
      }
      dailyExisting.cost += cost
      dailyExisting.sessions += 1
      dailyCostsMap.set(sessionDate, dailyExisting)
    }

    // Active sessions with live costs
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000
    const activeSessions = sessions
      .filter((s) => s.lastActivity > fiveMinutesAgo)
      .map((s) => ({
        sessionId: s.id,
        projectName: s.projectName,
        cost: s.model
          ? calculateSessionCost(
              s.stats.inputTokens,
              s.stats.outputTokens,
              s.stats.cachedTokens,
              s.model
            )
          : s.stats.estimatedCost || 0,
        model: s.model || 'unknown',
      }))

    // Calculate budget warnings
    const { budgetSettings } = get()
    const percentage = (currentMonthCost / budgetSettings.monthlyLimit) * 100

    set({
      currentMonthCost,
      todayCost,
      activeSessions,
      costByModel: Array.from(modelCosts.values()).sort((a, b) => b.cost - a.cost),
      dailyCosts: Array.from(dailyCostsMap.values()).sort((a, b) =>
        a.date.localeCompare(b.date)
      ),
      lastUpdate: Date.now(),
      budgetWarning: percentage >= budgetSettings.warningThreshold,
      budgetExceeded: percentage >= 100,
    })
  },

  loadBudgetSettings: async () => {
    set({ isLoading: true })
    try {
      const settings = await window.electron.invoke('settings:get')
      if (settings?.budget) {
        set({
          budgetSettings: { ...defaultBudgetSettings, ...settings.budget },
          isLoading: false,
        })
      } else {
        set({ isLoading: false })
      }
    } catch (error) {
      console.error('Failed to load budget settings:', error)
      set({ isLoading: false })
    }
  },

  saveBudgetSettings: async () => {
    const { budgetSettings } = get()
    try {
      const success = await window.electron.invoke('settings:setBudget', budgetSettings)
      return success
    } catch (error) {
      console.error('Failed to save budget settings:', error)
      return false
    }
  },
}))

// Selector for budget percentage
export const selectBudgetPercentage = (state: BudgetState): number => {
  if (state.budgetSettings.monthlyLimit === 0) return 0
  return (state.currentMonthCost / state.budgetSettings.monthlyLimit) * 100
}
