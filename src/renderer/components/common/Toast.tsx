/**
 * Toast Notification System
 *
 * A flexible, accessible toast notification system with multiple variants,
 * auto-dismiss, and stacking support.
 *
 * @module Toast
 */

import {
  createContext,
  useContext,
  useCallback,
  useState,
  useEffect,
  useRef,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle, XCircle, AlertTriangle, Info, X, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

// ============================================================================
// Types
// ============================================================================

export type ToastVariant = 'success' | 'error' | 'warning' | 'info' | 'loading'
export type ToastPosition =
  | 'top-right'
  | 'top-left'
  | 'bottom-right'
  | 'bottom-left'
  | 'top-center'
  | 'bottom-center'

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface Toast {
  id: string
  title?: string
  message: string
  variant: ToastVariant
  duration?: number
  action?: ToastAction
  dismissible?: boolean
  createdAt: number
}

export interface ToastOptions {
  title?: string
  duration?: number
  action?: ToastAction
  dismissible?: boolean
}

interface ToastContextValue {
  toasts: Toast[]
  addToast: (message: string, variant: ToastVariant, options?: ToastOptions) => string
  removeToast: (id: string) => void
  clearToasts: () => void
  success: (message: string, options?: ToastOptions) => string
  error: (message: string, options?: ToastOptions) => string
  warning: (message: string, options?: ToastOptions) => string
  info: (message: string, options?: ToastOptions) => string
  loading: (message: string, options?: ToastOptions) => string
  update: (id: string, message: string, variant?: ToastVariant) => void
}

// ============================================================================
// Context
// ============================================================================

const ToastContext = createContext<ToastContextValue | null>(null)

// ============================================================================
// Styling
// ============================================================================

const variantStyles: Record<ToastVariant, string> = {
  success: 'bg-accent-green/10 border-accent-green/30 text-accent-green',
  error: 'bg-accent-red/10 border-accent-red/30 text-accent-red',
  warning: 'bg-accent-yellow/10 border-accent-yellow/30 text-accent-yellow',
  info: 'bg-accent-blue/10 border-accent-blue/30 text-accent-blue',
  loading: 'bg-accent-purple/10 border-accent-purple/30 text-accent-purple',
}

const variantIcons: Record<ToastVariant, typeof CheckCircle> = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
  loading: Loader2,
}

const positionStyles: Record<ToastPosition, string> = {
  'top-right': 'top-4 right-4',
  'top-left': 'top-4 left-4',
  'bottom-right': 'bottom-4 right-4',
  'bottom-left': 'bottom-4 left-4',
  'top-center': 'top-4 left-1/2 -translate-x-1/2',
  'bottom-center': 'bottom-4 left-1/2 -translate-x-1/2',
}

const DEFAULT_DURATION = 5000
const MAX_TOASTS = 5

// ============================================================================
// Toast Item Component
// ============================================================================

interface ToastItemProps {
  toast: Toast
  onDismiss: () => void
}

function ToastItem({ toast, onDismiss }: ToastItemProps) {
  const [isExiting, setIsExiting] = useState(false)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const Icon = variantIcons[toast.variant]
  const isLoading = toast.variant === 'loading'
  const duration = toast.duration ?? DEFAULT_DURATION

  const handleDismiss = useCallback(() => {
    setIsExiting(true)
    setTimeout(onDismiss, 200) // Match animation duration
  }, [onDismiss])

  useEffect(() => {
    // Don't auto-dismiss loading toasts
    if (isLoading || duration === 0) return

    timerRef.current = setTimeout(handleDismiss, duration)

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [duration, handleDismiss, isLoading])

  // Pause timer on hover
  const handleMouseEnter = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }
  }

  const handleMouseLeave = () => {
    if (!isLoading && duration > 0) {
      timerRef.current = setTimeout(handleDismiss, duration)
    }
  }

  return (
    <div
      role="alert"
      aria-live={toast.variant === 'error' ? 'assertive' : 'polite'}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={cn(
        'flex items-start gap-3 p-4 rounded-lg border shadow-lg backdrop-blur-sm',
        'min-w-[320px] max-w-[420px]',
        'transition-all duration-200 ease-out',
        variantStyles[toast.variant],
        isExiting ? 'opacity-0 translate-x-4 scale-95' : 'opacity-100 translate-x-0 scale-100',
        'animate-in slide-in-from-right-4 fade-in duration-200'
      )}
    >
      <Icon className={cn('w-5 h-5 flex-shrink-0 mt-0.5', isLoading && 'animate-spin')} />

      <div className="flex-1 min-w-0">
        {toast.title && (
          <p className="font-semibold text-sm text-text-primary mb-1">{toast.title}</p>
        )}
        <p className="text-sm text-text-primary/90 break-words">{toast.message}</p>

        {toast.action && (
          <button
            onClick={() => {
              toast.action?.onClick()
              handleDismiss()
            }}
            className="mt-2 text-xs font-medium hover:underline focus:outline-none focus:ring-2 focus:ring-offset-2 rounded"
          >
            {toast.action.label}
          </button>
        )}
      </div>

      {toast.dismissible !== false && (
        <button
          onClick={handleDismiss}
          className="text-text-muted hover:text-text-primary transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 rounded"
          aria-label="Dismiss notification"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}

// ============================================================================
// Toast Container
// ============================================================================

interface ToastContainerProps {
  toasts: Toast[]
  position: ToastPosition
  onDismiss: (id: string) => void
}

function ToastContainer({ toasts, position, onDismiss }: ToastContainerProps) {
  const isTop = position.startsWith('top')

  return createPortal(
    <div
      className={cn(
        'fixed z-[100] flex flex-col gap-2 pointer-events-none',
        positionStyles[position],
        isTop ? 'flex-col' : 'flex-col-reverse'
      )}
      aria-label="Notifications"
    >
      {toasts.slice(0, MAX_TOASTS).map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <ToastItem toast={toast} onDismiss={() => onDismiss(toast.id)} />
        </div>
      ))}
    </div>,
    document.body
  )
}

// ============================================================================
// Toast Provider
// ============================================================================

interface ToastProviderProps {
  children: ReactNode
  position?: ToastPosition
}

export function ToastProvider({ children, position = 'bottom-right' }: ToastProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const idCounter = useRef(0)

  const generateId = () => {
    idCounter.current += 1
    return `toast-${idCounter.current}-${Date.now()}`
  }

  const addToast = useCallback(
    (message: string, variant: ToastVariant, options?: ToastOptions): string => {
      const id = generateId()
      const toast: Toast = {
        id,
        message,
        variant,
        title: options?.title,
        duration: options?.duration,
        action: options?.action,
        dismissible: options?.dismissible,
        createdAt: Date.now(),
      }

      setToasts((prev) => [...prev, toast])
      return id
    },
    []
  )

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const clearToasts = useCallback(() => {
    setToasts([])
  }, [])

  const update = useCallback((id: string, message: string, variant?: ToastVariant) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, message, variant: variant ?? t.variant } : t))
    )
  }, [])

  // Convenience methods
  const success = useCallback(
    (message: string, options?: ToastOptions) => addToast(message, 'success', options),
    [addToast]
  )

  const error = useCallback(
    (message: string, options?: ToastOptions) =>
      addToast(message, 'error', { duration: 8000, ...options }),
    [addToast]
  )

  const warning = useCallback(
    (message: string, options?: ToastOptions) => addToast(message, 'warning', options),
    [addToast]
  )

  const info = useCallback(
    (message: string, options?: ToastOptions) => addToast(message, 'info', options),
    [addToast]
  )

  const loading = useCallback(
    (message: string, options?: ToastOptions) =>
      addToast(message, 'loading', { duration: 0, dismissible: false, ...options }),
    [addToast]
  )

  const value: ToastContextValue = {
    toasts,
    addToast,
    removeToast,
    clearToasts,
    success,
    error,
    warning,
    info,
    loading,
    update,
  }

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} position={position} onDismiss={removeToast} />
    </ToastContext.Provider>
  )
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook to access toast notifications
 *
 * @example
 * ```tsx
 * const toast = useToast()
 *
 * // Simple usage
 * toast.success('Settings saved!')
 * toast.error('Failed to connect')
 * toast.warning('Rate limit approaching')
 * toast.info('New version available')
 *
 * // With options
 * toast.success('File uploaded', {
 *   title: 'Upload Complete',
 *   action: { label: 'View', onClick: () => navigate('/files') }
 * })
 *
 * // Loading with update
 * const id = toast.loading('Saving...')
 * await save()
 * toast.update(id, 'Saved!', 'success')
 * ```
 */
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)

  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }

  return context
}

// ============================================================================
// Standalone Toast (for use outside React tree)
// ============================================================================

let globalToast: ToastContextValue | null = null

export function setGlobalToast(toast: ToastContextValue) {
  globalToast = toast
}

/**
 * Standalone toast function for use outside React components
 * Requires ToastProvider to be mounted and setGlobalToast to be called
 */
export const toast = {
  success: (message: string, options?: ToastOptions) => globalToast?.success(message, options),
  error: (message: string, options?: ToastOptions) => globalToast?.error(message, options),
  warning: (message: string, options?: ToastOptions) => globalToast?.warning(message, options),
  info: (message: string, options?: ToastOptions) => globalToast?.info(message, options),
  loading: (message: string, options?: ToastOptions) => globalToast?.loading(message, options),
  dismiss: (id: string) => globalToast?.removeToast(id),
  clear: () => globalToast?.clearToasts(),
}
