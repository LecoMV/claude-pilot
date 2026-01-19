import { useState, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AdvancedSectionProps {
  /** Section title */
  title?: string
  /** Whether to start expanded */
  defaultExpanded?: boolean
  /** Content to show when expanded */
  children: ReactNode
  /** Badge text to show (e.g., "8 options") */
  badge?: string
  /** Additional class names */
  className?: string
  /** Border style variant */
  variant?: 'default' | 'subtle' | 'none'
}

/**
 * Progressive disclosure component for advanced options.
 * Hides complexity by default, revealing on demand.
 *
 * @example
 * <AdvancedSection title="Advanced Settings" badge="12 options">
 *   <Input label="Timeout" />
 *   <Input label="Retries" />
 * </AdvancedSection>
 */
export function AdvancedSection({
  title = 'Advanced Options',
  defaultExpanded = false,
  children,
  badge,
  className,
  variant = 'default',
}: AdvancedSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  return (
    <div
      className={cn(
        'mt-4 pt-4',
        variant === 'default' && 'border-t border-border',
        variant === 'subtle' && 'border-t border-border/50',
        className
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-text-muted hover:text-text-primary transition-colors w-full text-left"
        aria-expanded={expanded}
        aria-controls="advanced-content"
      >
        <ChevronRight
          className={cn('w-4 h-4 transition-transform duration-200', expanded && 'rotate-90')}
        />
        <span className="text-sm font-medium">{title}</span>
        {badge && (
          <span className="text-xs bg-surface px-2 py-0.5 rounded-full text-text-muted">
            {badge}
          </span>
        )}
      </button>

      <div
        id="advanced-content"
        className={cn(
          'overflow-hidden transition-all duration-200',
          expanded ? 'max-h-[2000px] opacity-100 mt-4' : 'max-h-0 opacity-0'
        )}
      >
        <div className="space-y-4">{children}</div>
      </div>
    </div>
  )
}

/**
 * Collapsible card variant of AdvancedSection
 * for standalone collapsible content
 */
interface CollapsibleCardProps {
  title: string
  subtitle?: string
  defaultExpanded?: boolean
  children: ReactNode
  className?: string
  headerActions?: ReactNode
}

export function CollapsibleCard({
  title,
  subtitle,
  defaultExpanded = false,
  children,
  className,
  headerActions,
}: CollapsibleCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  return (
    <div className={cn('card overflow-hidden', className)}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-center gap-3 text-left hover:bg-surface-hover transition-colors"
        aria-expanded={expanded}
      >
        <ChevronRight
          className={cn(
            'w-5 h-5 text-text-muted transition-transform duration-200',
            expanded && 'rotate-90'
          )}
        />
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-text-primary">{title}</h3>
          {subtitle && <p className="text-sm text-text-muted truncate">{subtitle}</p>}
        </div>
        {headerActions && (
          <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-2">
            {headerActions}
          </div>
        )}
      </button>

      <div
        className={cn(
          'overflow-hidden transition-all duration-200',
          expanded ? 'max-h-[2000px]' : 'max-h-0'
        )}
      >
        <div className="p-4 pt-0 border-t border-border">{children}</div>
      </div>
    </div>
  )
}
