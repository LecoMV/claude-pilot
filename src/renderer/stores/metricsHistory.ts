import { create } from 'zustand'

export interface MetricDataPoint {
  timestamp: number
  cpu: number
  memory: number
  diskUsed: number
}

interface MetricsHistoryState {
  history: MetricDataPoint[]
  maxDataPoints: number
  addDataPoint: (point: Omit<MetricDataPoint, 'timestamp'>) => void
  clearHistory: () => void
}

export const useMetricsHistoryStore = create<MetricsHistoryState>((set) => ({
  history: [],
  maxDataPoints: 60, // Keep last 60 data points (5 minutes at 5s intervals)

  addDataPoint: (point) =>
    set((state) => {
      const newPoint: MetricDataPoint = {
        ...point,
        timestamp: Date.now(),
      }
      const newHistory = [...state.history, newPoint]
      // Keep only the last maxDataPoints
      if (newHistory.length > state.maxDataPoints) {
        return { history: newHistory.slice(-state.maxDataPoints) }
      }
      return { history: newHistory }
    }),

  clearHistory: () => set({ history: [] }),
}))
