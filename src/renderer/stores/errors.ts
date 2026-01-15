// Error state management for renderer process

import { create } from 'zustand'

export type ErrorSeverity = 'critical' | 'error' | 'warning' | 'info'
export type ErrorCategory = 'ipc' | 'filesystem' | 'network' | 'database' | 'process' | 'validation' | 'ui' | 'auth' | 'unknown'

export interface ErrorNotification {
  id: string
  code: string
  message: string
  severity: ErrorSeverity
  category: ErrorCategory
  timestamp: number
  dismissed: boolean
  action?: {
    label: string
    handler: () => void
  }
}

interface ErrorStore {
  errors: ErrorNotification[]
  unreadCount: number

  // Actions
  addError: (error: Omit<ErrorNotification, 'id' | 'dismissed'>) => void
  dismissError: (id: string) => void
  dismissAll: () => void
  clearErrors: () => void
  markAllRead: () => void
}

let errorIdCounter = 0

export const useErrorStore = create<ErrorStore>((set, get) => ({
  errors: [],
  unreadCount: 0,

  addError: (error) => {
    const newError: ErrorNotification = {
      ...error,
      id: `error-${Date.now()}-${++errorIdCounter}`,
      dismissed: false,
    }

    set((state) => ({
      errors: [newError, ...state.errors].slice(0, 100), // Keep last 100 errors
      unreadCount: state.unreadCount + 1,
    }))
  },

  dismissError: (id) => {
    set((state) => ({
      errors: state.errors.map((e) =>
        e.id === id ? { ...e, dismissed: true } : e
      ),
    }))
  },

  dismissAll: () => {
    set((state) => ({
      errors: state.errors.map((e) => ({ ...e, dismissed: true })),
    }))
  },

  clearErrors: () => {
    set({ errors: [], unreadCount: 0 })
  },

  markAllRead: () => {
    set({ unreadCount: 0 })
  },
}))

/**
 * Initialize error listener from main process
 */
export function initializeErrorListener(): () => void {
  const unsubscribe = window.electron.on(
    'error:occurred',
    (data: {
      code: string
      message: string
      severity: ErrorSeverity
      category: ErrorCategory
      timestamp: number
    }) => {
      useErrorStore.getState().addError({
        code: data.code,
        message: data.message,
        severity: data.severity,
        category: data.category,
        timestamp: data.timestamp,
      })
    }
  )

  return unsubscribe
}

/**
 * Helper to create error from catch block
 */
export function captureError(
  error: unknown,
  context: { category?: ErrorCategory; operation?: string } = {}
): void {
  const message = error instanceof Error ? error.message : String(error)
  const severity: ErrorSeverity =
    error instanceof Error && error.message.includes('critical')
      ? 'critical'
      : 'error'

  useErrorStore.getState().addError({
    code: 'ERR_RENDERER',
    message,
    severity,
    category: context.category ?? 'unknown',
    timestamp: Date.now(),
  })
}

/**
 * Get severity color for UI
 */
export function getSeverityColor(severity: ErrorSeverity): string {
  switch (severity) {
    case 'critical':
      return 'text-accent-red bg-accent-red/10'
    case 'error':
      return 'text-accent-red bg-accent-red/10'
    case 'warning':
      return 'text-accent-yellow bg-accent-yellow/10'
    case 'info':
      return 'text-accent-blue bg-accent-blue/10'
    default:
      return 'text-text-muted bg-surface'
  }
}

/**
 * Get severity icon name for UI
 */
export function getSeverityIcon(severity: ErrorSeverity): string {
  switch (severity) {
    case 'critical':
      return 'AlertOctagon'
    case 'error':
      return 'AlertTriangle'
    case 'warning':
      return 'AlertCircle'
    case 'info':
      return 'Info'
    default:
      return 'AlertTriangle'
  }
}
