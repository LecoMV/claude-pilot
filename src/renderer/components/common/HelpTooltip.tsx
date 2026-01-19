import { useState, useRef, useEffect, type ReactNode } from 'react'
import { HelpCircle, ExternalLink, Info, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

type TooltipPlacement = 'top' | 'right' | 'bottom' | 'left'

interface HelpTooltipProps {
  /** Help content to display */
  content: string | ReactNode
  /** Optional link to documentation */
  docsLink?: string
  /** Tooltip placement */
  placement?: TooltipPlacement
  /** Icon variant */
  variant?: 'help' | 'info' | 'warning'
  /** Icon size */
  size?: 'sm' | 'md' | 'lg'
  /** Additional class names */
  className?: string
}

/**
 * Inline help tooltip component.
 * Provides contextual help with optional documentation links.
 *
 * @example
 * <FormField label="API Key">
 *   <Input />
 *   <HelpTooltip
 *     content="Your API key can be found in the dashboard settings."
 *     docsLink="/docs/api-keys"
 *   />
 * </FormField>
 */
export function HelpTooltip({
  content,
  docsLink,
  placement = 'top',
  variant = 'help',
  size = 'md',
  className,
}: HelpTooltipProps) {
  const [visible, setVisible] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  const icons = {
    help: HelpCircle,
    info: Info,
    warning: AlertCircle,
  }
  const Icon = icons[variant]

  const sizeClasses = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  }

  const variantColors = {
    help: 'text-text-muted hover:text-text-primary',
    info: 'text-accent-blue hover:text-accent-blue/80',
    warning: 'text-accent-yellow hover:text-accent-yellow/80',
  }

  // Position classes for tooltip
  const placementClasses: Record<TooltipPlacement, string> = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  }

  // Arrow classes
  const arrowClasses: Record<TooltipPlacement, string> = {
    top: 'top-full left-1/2 -translate-x-1/2 border-t-surface border-x-transparent border-b-transparent',
    bottom:
      'bottom-full left-1/2 -translate-x-1/2 border-b-surface border-x-transparent border-t-transparent',
    left: 'left-full top-1/2 -translate-y-1/2 border-l-surface border-y-transparent border-r-transparent',
    right:
      'right-full top-1/2 -translate-y-1/2 border-r-surface border-y-transparent border-l-transparent',
  }

  // Close on escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setVisible(false)
    }

    if (visible) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [visible])

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        tooltipRef.current &&
        !tooltipRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setVisible(false)
      }
    }

    if (visible) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [visible])

  return (
    <div className={cn('relative inline-flex', className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setVisible(!visible)}
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        className={cn(
          'cursor-help transition-colors focus:outline-none focus:ring-2 focus:ring-accent-blue/50 rounded',
          variantColors[variant]
        )}
        aria-label="Show help"
        aria-expanded={visible}
      >
        <Icon className={sizeClasses[size]} />
      </button>

      {visible && (
        <div
          ref={tooltipRef}
          role="tooltip"
          className={cn(
            'absolute z-50 animate-in fade-in-0 zoom-in-95',
            placementClasses[placement]
          )}
        >
          <div className="bg-surface border border-border rounded-lg shadow-lg max-w-xs p-3">
            <div className="text-sm text-text-primary">{content}</div>
            {docsLink && (
              <a
                href={docsLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-blue text-xs mt-2 flex items-center gap-1 hover:underline"
              >
                <ExternalLink className="w-3 h-3" />
                Learn more
              </a>
            )}
          </div>
          {/* Arrow */}
          <div
            className={cn('absolute w-0 h-0 border-4', arrowClasses[placement])}
            aria-hidden="true"
          />
        </div>
      )}
    </div>
  )
}

/**
 * Labeled form field with integrated help tooltip.
 */
interface FormFieldProps {
  /** Field label */
  label: string
  /** Field ID for accessibility */
  htmlFor?: string
  /** Help tooltip content */
  help?: string
  /** Documentation link */
  docsLink?: string
  /** Whether field is required */
  required?: boolean
  /** Error message */
  error?: string
  /** Field content */
  children: ReactNode
  /** Additional class names */
  className?: string
}

export function FormField({
  label,
  htmlFor,
  help,
  docsLink,
  required,
  error,
  children,
  className,
}: FormFieldProps) {
  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center gap-2">
        <label htmlFor={htmlFor} className="text-sm font-medium text-text-primary">
          {label}
          {required && <span className="text-accent-red ml-0.5">*</span>}
        </label>
        {help && <HelpTooltip content={help} docsLink={docsLink} size="sm" />}
      </div>
      {children}
      {error && (
        <p className="text-xs text-accent-red flex items-center gap-1">
          <AlertCircle className="w-3 h-3" />
          {error}
        </p>
      )}
    </div>
  )
}

/**
 * Info banner for important notes in forms/settings.
 */
interface InfoBannerProps {
  /** Banner content */
  children: ReactNode
  /** Banner variant */
  variant?: 'info' | 'warning' | 'success' | 'error'
  /** Optional title */
  title?: string
  /** Dismissible */
  dismissible?: boolean
  /** Callback when dismissed */
  onDismiss?: () => void
  /** Additional class names */
  className?: string
}

export function InfoBanner({
  children,
  variant = 'info',
  title,
  dismissible,
  onDismiss,
  className,
}: InfoBannerProps) {
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) return null

  const variantStyles = {
    info: 'bg-accent-blue/10 border-accent-blue/30 text-accent-blue',
    warning: 'bg-accent-yellow/10 border-accent-yellow/30 text-accent-yellow',
    success: 'bg-accent-green/10 border-accent-green/30 text-accent-green',
    error: 'bg-accent-red/10 border-accent-red/30 text-accent-red',
  }

  const icons = {
    info: Info,
    warning: AlertCircle,
    success: Info,
    error: AlertCircle,
  }
  const Icon = icons[variant]

  const handleDismiss = () => {
    setDismissed(true)
    onDismiss?.()
  }

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-4 rounded-lg border',
        variantStyles[variant],
        className
      )}
      role="alert"
    >
      <Icon className="w-5 h-5 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        {title && <p className="font-medium mb-1">{title}</p>}
        <div className="text-sm opacity-90">{children}</div>
      </div>
      {dismissible && (
        <button
          onClick={handleDismiss}
          className="text-current opacity-50 hover:opacity-100 transition-opacity"
          aria-label="Dismiss"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      )}
    </div>
  )
}
