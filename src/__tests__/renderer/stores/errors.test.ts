import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  useErrorStore,
  captureError,
  getSeverityColor,
  getSeverityIcon,
} from '@/stores/errors'

describe('Error Store', () => {
  beforeEach(() => {
    useErrorStore.getState().clearErrors()
  })

  describe('addError', () => {
    it('should add error to the store', () => {
      useErrorStore.getState().addError({
        code: 'ERR_TEST',
        message: 'Test error',
        severity: 'error',
        category: 'ipc',
        timestamp: Date.now(),
      })

      // Get fresh state after mutation
      const state = useErrorStore.getState()
      expect(state.errors).toHaveLength(1)
      expect(state.errors[0].code).toBe('ERR_TEST')
      expect(state.errors[0].dismissed).toBe(false)
      expect(state.unreadCount).toBe(1)
    })

    it('should generate unique IDs', () => {
      useErrorStore.getState().addError({
        code: 'ERR_1',
        message: 'Error 1',
        severity: 'error',
        category: 'ipc',
        timestamp: Date.now(),
      })

      useErrorStore.getState().addError({
        code: 'ERR_2',
        message: 'Error 2',
        severity: 'error',
        category: 'ipc',
        timestamp: Date.now(),
      })

      const state = useErrorStore.getState()
      expect(state.errors[0].id).not.toBe(state.errors[1].id)
    })

    it('should limit errors to 100', () => {
      for (let i = 0; i < 110; i++) {
        useErrorStore.getState().addError({
          code: `ERR_${i}`,
          message: `Error ${i}`,
          severity: 'error',
          category: 'ipc',
          timestamp: Date.now(),
        })
      }

      const state = useErrorStore.getState()
      expect(state.errors).toHaveLength(100)
      // Most recent should be first
      expect(state.errors[0].code).toBe('ERR_109')
    })
  })

  describe('dismissError', () => {
    it('should mark error as dismissed', () => {
      useErrorStore.getState().addError({
        code: 'ERR_TEST',
        message: 'Test error',
        severity: 'error',
        category: 'ipc',
        timestamp: Date.now(),
      })

      const errorId = useErrorStore.getState().errors[0].id
      useErrorStore.getState().dismissError(errorId)

      expect(useErrorStore.getState().errors[0].dismissed).toBe(true)
    })
  })

  describe('dismissAll', () => {
    it('should dismiss all errors', () => {
      useErrorStore.getState().addError({
        code: 'ERR_1',
        message: 'Error 1',
        severity: 'error',
        category: 'ipc',
        timestamp: Date.now(),
      })

      useErrorStore.getState().addError({
        code: 'ERR_2',
        message: 'Error 2',
        severity: 'error',
        category: 'ipc',
        timestamp: Date.now(),
      })

      useErrorStore.getState().dismissAll()

      expect(useErrorStore.getState().errors.every((e) => e.dismissed)).toBe(true)
    })
  })

  describe('clearErrors', () => {
    it('should clear all errors and reset unread count', () => {
      useErrorStore.getState().addError({
        code: 'ERR_TEST',
        message: 'Test error',
        severity: 'error',
        category: 'ipc',
        timestamp: Date.now(),
      })

      useErrorStore.getState().clearErrors()

      const state = useErrorStore.getState()
      expect(state.errors).toHaveLength(0)
      expect(state.unreadCount).toBe(0)
    })
  })

  describe('markAllRead', () => {
    it('should reset unread count', () => {
      useErrorStore.getState().addError({
        code: 'ERR_TEST',
        message: 'Test error',
        severity: 'error',
        category: 'ipc',
        timestamp: Date.now(),
      })

      expect(useErrorStore.getState().unreadCount).toBe(1)

      useErrorStore.getState().markAllRead()

      expect(useErrorStore.getState().unreadCount).toBe(0)
    })
  })
})

describe('captureError', () => {
  beforeEach(() => {
    useErrorStore.getState().clearErrors()
  })

  it('should capture Error instance', () => {
    captureError(new Error('Test error'), { category: 'ui' })

    const store = useErrorStore.getState()
    expect(store.errors).toHaveLength(1)
    expect(store.errors[0].message).toBe('Test error')
    expect(store.errors[0].category).toBe('ui')
  })

  it('should capture string error', () => {
    captureError('String error')

    const store = useErrorStore.getState()
    expect(store.errors).toHaveLength(1)
    expect(store.errors[0].message).toBe('String error')
  })

  it('should detect critical errors from message', () => {
    captureError(new Error('critical failure occurred'))

    const store = useErrorStore.getState()
    expect(store.errors[0].severity).toBe('critical')
  })
})

describe('Helper Functions', () => {
  describe('getSeverityColor', () => {
    it('should return correct colors for each severity', () => {
      expect(getSeverityColor('critical')).toContain('accent-red')
      expect(getSeverityColor('error')).toContain('accent-red')
      expect(getSeverityColor('warning')).toContain('accent-yellow')
      expect(getSeverityColor('info')).toContain('accent-blue')
    })
  })

  describe('getSeverityIcon', () => {
    it('should return correct icon names', () => {
      expect(getSeverityIcon('critical')).toBe('AlertOctagon')
      expect(getSeverityIcon('error')).toBe('AlertTriangle')
      expect(getSeverityIcon('warning')).toBe('AlertCircle')
      expect(getSeverityIcon('info')).toBe('Info')
    })
  })
})
