import { describe, it, expect, beforeEach } from 'vitest'
import { useMetricsHistoryStore } from '@/stores/metricsHistory'

describe('MetricsHistory Store', () => {
  beforeEach(() => {
    // Reset the store to initial state
    useMetricsHistoryStore.setState({
      history: [],
      maxDataPoints: 60,
    })
  })

  describe('initial state', () => {
    it('should have empty history', () => {
      const state = useMetricsHistoryStore.getState()
      expect(state.history).toEqual([])
    })

    it('should have maxDataPoints set to 60', () => {
      const state = useMetricsHistoryStore.getState()
      expect(state.maxDataPoints).toBe(60)
    })
  })

  describe('addDataPoint', () => {
    it('should add a data point with timestamp', () => {
      const before = Date.now()

      useMetricsHistoryStore.getState().addDataPoint({
        cpu: 50,
        memory: 60,
        diskUsed: 70,
      })

      const after = Date.now()
      const history = useMetricsHistoryStore.getState().history

      expect(history).toHaveLength(1)
      expect(history[0].cpu).toBe(50)
      expect(history[0].memory).toBe(60)
      expect(history[0].diskUsed).toBe(70)
      expect(history[0].timestamp).toBeGreaterThanOrEqual(before)
      expect(history[0].timestamp).toBeLessThanOrEqual(after)
    })

    it('should add multiple data points', () => {
      useMetricsHistoryStore.getState().addDataPoint({
        cpu: 50,
        memory: 60,
        diskUsed: 70,
      })

      useMetricsHistoryStore.getState().addDataPoint({
        cpu: 55,
        memory: 65,
        diskUsed: 72,
      })

      useMetricsHistoryStore.getState().addDataPoint({
        cpu: 45,
        memory: 55,
        diskUsed: 68,
      })

      const history = useMetricsHistoryStore.getState().history
      expect(history).toHaveLength(3)
    })

    it('should preserve order of data points', () => {
      useMetricsHistoryStore.getState().addDataPoint({ cpu: 10, memory: 20, diskUsed: 30 })
      useMetricsHistoryStore.getState().addDataPoint({ cpu: 40, memory: 50, diskUsed: 60 })
      useMetricsHistoryStore.getState().addDataPoint({ cpu: 70, memory: 80, diskUsed: 90 })

      const history = useMetricsHistoryStore.getState().history
      expect(history[0].cpu).toBe(10)
      expect(history[1].cpu).toBe(40)
      expect(history[2].cpu).toBe(70)
    })

    it('should include GPU metrics when provided', () => {
      useMetricsHistoryStore.getState().addDataPoint({
        cpu: 50,
        memory: 60,
        diskUsed: 70,
        gpuUtilization: 80,
        gpuMemoryUsed: 4000,
        gpuMemoryTotal: 8000,
        gpuTemperature: 65,
      })

      const history = useMetricsHistoryStore.getState().history
      expect(history[0].gpuUtilization).toBe(80)
      expect(history[0].gpuMemoryUsed).toBe(4000)
      expect(history[0].gpuMemoryTotal).toBe(8000)
      expect(history[0].gpuTemperature).toBe(65)
    })

    it('should handle optional GPU metrics as undefined', () => {
      useMetricsHistoryStore.getState().addDataPoint({
        cpu: 50,
        memory: 60,
        diskUsed: 70,
      })

      const history = useMetricsHistoryStore.getState().history
      expect(history[0].gpuUtilization).toBeUndefined()
      expect(history[0].gpuMemoryUsed).toBeUndefined()
      expect(history[0].gpuMemoryTotal).toBeUndefined()
      expect(history[0].gpuTemperature).toBeUndefined()
    })

    it('should handle partial GPU metrics', () => {
      useMetricsHistoryStore.getState().addDataPoint({
        cpu: 50,
        memory: 60,
        diskUsed: 70,
        gpuUtilization: 80,
        // Other GPU metrics not provided
      })

      const history = useMetricsHistoryStore.getState().history
      expect(history[0].gpuUtilization).toBe(80)
      expect(history[0].gpuMemoryUsed).toBeUndefined()
    })

    it('should limit history to maxDataPoints', () => {
      // Add more than 60 data points
      for (let i = 0; i < 70; i++) {
        useMetricsHistoryStore.getState().addDataPoint({
          cpu: i,
          memory: i * 2,
          diskUsed: i * 3,
        })
      }

      const history = useMetricsHistoryStore.getState().history
      expect(history).toHaveLength(60)
    })

    it('should keep the most recent data points when exceeding maxDataPoints', () => {
      // Add 65 data points
      for (let i = 0; i < 65; i++) {
        useMetricsHistoryStore.getState().addDataPoint({
          cpu: i,
          memory: i * 2,
          diskUsed: i * 3,
        })
      }

      const history = useMetricsHistoryStore.getState().history
      expect(history).toHaveLength(60)
      // First data point should be i=5 (0-4 should have been removed)
      expect(history[0].cpu).toBe(5)
      // Last data point should be i=64
      expect(history[59].cpu).toBe(64)
    })

    it('should handle exactly maxDataPoints', () => {
      for (let i = 0; i < 60; i++) {
        useMetricsHistoryStore.getState().addDataPoint({
          cpu: i,
          memory: i,
          diskUsed: i,
        })
      }

      const history = useMetricsHistoryStore.getState().history
      expect(history).toHaveLength(60)
      expect(history[0].cpu).toBe(0)
      expect(history[59].cpu).toBe(59)
    })

    it('should handle adding one more after reaching maxDataPoints', () => {
      for (let i = 0; i < 60; i++) {
        useMetricsHistoryStore.getState().addDataPoint({
          cpu: i,
          memory: i,
          diskUsed: i,
        })
      }

      // Add one more
      useMetricsHistoryStore.getState().addDataPoint({
        cpu: 100,
        memory: 100,
        diskUsed: 100,
      })

      const history = useMetricsHistoryStore.getState().history
      expect(history).toHaveLength(60)
      expect(history[0].cpu).toBe(1) // 0 removed
      expect(history[59].cpu).toBe(100) // newest added
    })

    it('should handle zero values', () => {
      useMetricsHistoryStore.getState().addDataPoint({
        cpu: 0,
        memory: 0,
        diskUsed: 0,
      })

      const history = useMetricsHistoryStore.getState().history
      expect(history[0].cpu).toBe(0)
      expect(history[0].memory).toBe(0)
      expect(history[0].diskUsed).toBe(0)
    })

    it('should handle 100% values', () => {
      useMetricsHistoryStore.getState().addDataPoint({
        cpu: 100,
        memory: 100,
        diskUsed: 100,
      })

      const history = useMetricsHistoryStore.getState().history
      expect(history[0].cpu).toBe(100)
      expect(history[0].memory).toBe(100)
      expect(history[0].diskUsed).toBe(100)
    })

    it('should handle decimal values', () => {
      useMetricsHistoryStore.getState().addDataPoint({
        cpu: 45.5,
        memory: 67.8,
        diskUsed: 82.3,
      })

      const history = useMetricsHistoryStore.getState().history
      expect(history[0].cpu).toBe(45.5)
      expect(history[0].memory).toBe(67.8)
      expect(history[0].diskUsed).toBe(82.3)
    })

    it('should have increasing timestamps', async () => {
      useMetricsHistoryStore.getState().addDataPoint({
        cpu: 50,
        memory: 60,
        diskUsed: 70,
      })

      // Small delay to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 10))

      useMetricsHistoryStore.getState().addDataPoint({
        cpu: 55,
        memory: 65,
        diskUsed: 75,
      })

      const history = useMetricsHistoryStore.getState().history
      expect(history[1].timestamp).toBeGreaterThan(history[0].timestamp)
    })
  })

  describe('clearHistory', () => {
    it('should clear all history', () => {
      // Add some data points
      useMetricsHistoryStore.getState().addDataPoint({
        cpu: 50,
        memory: 60,
        diskUsed: 70,
      })
      useMetricsHistoryStore.getState().addDataPoint({
        cpu: 55,
        memory: 65,
        diskUsed: 75,
      })

      expect(useMetricsHistoryStore.getState().history).toHaveLength(2)

      // Clear history
      useMetricsHistoryStore.getState().clearHistory()

      expect(useMetricsHistoryStore.getState().history).toEqual([])
      expect(useMetricsHistoryStore.getState().history).toHaveLength(0)
    })

    it('should handle clearing empty history', () => {
      useMetricsHistoryStore.getState().clearHistory()

      expect(useMetricsHistoryStore.getState().history).toEqual([])
    })

    it('should allow adding new data after clearing', () => {
      useMetricsHistoryStore.getState().addDataPoint({
        cpu: 50,
        memory: 60,
        diskUsed: 70,
      })

      useMetricsHistoryStore.getState().clearHistory()

      useMetricsHistoryStore.getState().addDataPoint({
        cpu: 30,
        memory: 40,
        diskUsed: 50,
      })

      const history = useMetricsHistoryStore.getState().history
      expect(history).toHaveLength(1)
      expect(history[0].cpu).toBe(30)
    })

    it('should preserve maxDataPoints after clearing', () => {
      useMetricsHistoryStore.getState().clearHistory()

      expect(useMetricsHistoryStore.getState().maxDataPoints).toBe(60)
    })
  })

  describe('maxDataPoints configuration', () => {
    it('should respect custom maxDataPoints when set', () => {
      useMetricsHistoryStore.setState({ maxDataPoints: 10 })

      for (let i = 0; i < 15; i++) {
        useMetricsHistoryStore.getState().addDataPoint({
          cpu: i,
          memory: i,
          diskUsed: i,
        })
      }

      const history = useMetricsHistoryStore.getState().history
      expect(history).toHaveLength(10)
      expect(history[0].cpu).toBe(5)
      expect(history[9].cpu).toBe(14)
    })

    it('should handle maxDataPoints of 1', () => {
      useMetricsHistoryStore.setState({ maxDataPoints: 1 })

      useMetricsHistoryStore.getState().addDataPoint({ cpu: 10, memory: 20, diskUsed: 30 })
      useMetricsHistoryStore.getState().addDataPoint({ cpu: 40, memory: 50, diskUsed: 60 })

      const history = useMetricsHistoryStore.getState().history
      expect(history).toHaveLength(1)
      expect(history[0].cpu).toBe(40)
    })

    it('should handle large maxDataPoints', () => {
      useMetricsHistoryStore.setState({ maxDataPoints: 1000 })

      for (let i = 0; i < 500; i++) {
        useMetricsHistoryStore.getState().addDataPoint({
          cpu: i,
          memory: i,
          diskUsed: i,
        })
      }

      const history = useMetricsHistoryStore.getState().history
      expect(history).toHaveLength(500)
    })
  })

  describe('data integrity', () => {
    it('should not modify existing data points when adding new ones', () => {
      const firstPoint = { cpu: 50, memory: 60, diskUsed: 70 }
      useMetricsHistoryStore.getState().addDataPoint(firstPoint)

      const historyBefore = useMetricsHistoryStore.getState().history[0]
      const timestampBefore = historyBefore.timestamp

      useMetricsHistoryStore.getState().addDataPoint({ cpu: 80, memory: 90, diskUsed: 95 })

      const historyAfter = useMetricsHistoryStore.getState().history[0]
      expect(historyAfter.cpu).toBe(50)
      expect(historyAfter.memory).toBe(60)
      expect(historyAfter.diskUsed).toBe(70)
      expect(historyAfter.timestamp).toBe(timestampBefore)
    })

    it('should create independent copies for each data point', () => {
      const point = { cpu: 50, memory: 60, diskUsed: 70 }
      useMetricsHistoryStore.getState().addDataPoint(point)

      // Modify original object
      point.cpu = 999

      // History should not be affected
      const history = useMetricsHistoryStore.getState().history
      expect(history[0].cpu).toBe(50)
    })
  })

  describe('edge cases', () => {
    it('should handle very high metric values', () => {
      useMetricsHistoryStore.getState().addDataPoint({
        cpu: 100,
        memory: 100,
        diskUsed: 100,
        gpuUtilization: 100,
        gpuMemoryUsed: 48000, // 48GB
        gpuMemoryTotal: 48000,
        gpuTemperature: 90,
      })

      const history = useMetricsHistoryStore.getState().history
      expect(history[0].gpuMemoryUsed).toBe(48000)
    })

    it('should handle very small decimal values', () => {
      useMetricsHistoryStore.getState().addDataPoint({
        cpu: 0.001,
        memory: 0.001,
        diskUsed: 0.001,
      })

      const history = useMetricsHistoryStore.getState().history
      expect(history[0].cpu).toBe(0.001)
    })

    it('should handle negative GPU temperature values (during initialization)', () => {
      // Some GPUs report negative temps during initialization
      useMetricsHistoryStore.getState().addDataPoint({
        cpu: 50,
        memory: 60,
        diskUsed: 70,
        gpuTemperature: -1,
      })

      const history = useMetricsHistoryStore.getState().history
      expect(history[0].gpuTemperature).toBe(-1)
    })
  })
})
