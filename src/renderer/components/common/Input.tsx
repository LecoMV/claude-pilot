/**
 * Input Component
 *
 * A reusable input component with support for labels, errors, and icons.
 * Designed for accessibility with proper ARIA attributes.
 *
 * @module Input
 */

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type InputSize = 'sm' | 'md' | 'lg'

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Input label */
  label?: string
  /** Helper text shown below the input */
  helperText?: string
  /** Error message - shows in error state */
  error?: string
  /** Input size */
  size?: InputSize
  /** Icon to show on the left */
  leftIcon?: ReactNode
  /** Icon to show on the right */
  rightIcon?: ReactNode
  /** Full width input */
  fullWidth?: boolean
}

const sizeStyles: Record<InputSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-4 py-3 text-base',
}

const iconPadding: Record<InputSize, { left: string; right: string }> = {
  sm: { left: 'pl-8', right: 'pr-8' },
  md: { left: 'pl-10', right: 'pr-10' },
  lg: { left: 'pl-12', right: 'pr-12' },
}

const iconSizes: Record<InputSize, string> = {
  sm: 'w-3.5 h-3.5',
  md: 'w-4 h-4',
  lg: 'w-5 h-5',
}

const iconPositions: Record<InputSize, { left: string; right: string }> = {
  sm: { left: 'left-2.5', right: 'right-2.5' },
  md: { left: 'left-3', right: 'right-3' },
  lg: { left: 'left-4', right: 'right-4' },
}

/**
 * Input component with support for labels, errors, and icons.
 *
 * @example
 * ```tsx
 * <Input
 *   label="Email"
 *   type="email"
 *   placeholder="you@example.com"
 *   error={errors.email}
 * />
 *
 * <Input
 *   label="Search"
 *   leftIcon={<Search />}
 *   placeholder="Search..."
 * />
 * ```
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      helperText,
      error,
      size = 'md',
      leftIcon,
      rightIcon,
      fullWidth = false,
      disabled,
      className,
      id: providedId,
      ...props
    },
    ref
  ) => {
    const generatedId = useId()
    const id = providedId || generatedId
    const errorId = `${id}-error`
    const helperId = `${id}-helper`

    const hasError = Boolean(error)

    return (
      <div className={cn('flex flex-col gap-1.5', fullWidth && 'w-full')}>
        {/* Label */}
        {label && (
          <label
            htmlFor={id}
            className={cn(
              'text-sm font-medium',
              hasError ? 'text-accent-red' : 'text-text-primary'
            )}
          >
            {label}
          </label>
        )}

        {/* Input wrapper */}
        <div className="relative">
          {/* Left icon */}
          {leftIcon && (
            <span
              className={cn(
                'absolute top-1/2 -translate-y-1/2 text-text-muted',
                iconSizes[size],
                iconPositions[size].left
              )}
              aria-hidden="true"
            >
              {leftIcon}
            </span>
          )}

          {/* Input field */}
          <input
            ref={ref}
            id={id}
            disabled={disabled}
            aria-invalid={hasError}
            aria-describedby={
              [hasError && errorId, helperText && helperId].filter(Boolean).join(' ') || undefined
            }
            className={cn(
              // Base styles
              'w-full rounded-lg border bg-surface text-text-primary',
              'placeholder:text-text-muted',
              'transition-colors duration-150',
              'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-background',
              // Size styles
              sizeStyles[size],
              // Icon padding
              leftIcon && iconPadding[size].left,
              rightIcon && iconPadding[size].right,
              // State styles
              hasError
                ? 'border-accent-red focus:ring-accent-red/50'
                : 'border-border focus:border-accent-purple focus:ring-accent-purple/50',
              disabled && 'opacity-50 cursor-not-allowed bg-surface-hover',
              className
            )}
            {...props}
          />

          {/* Right icon */}
          {rightIcon && (
            <span
              className={cn(
                'absolute top-1/2 -translate-y-1/2 text-text-muted',
                iconSizes[size],
                iconPositions[size].right
              )}
              aria-hidden="true"
            >
              {rightIcon}
            </span>
          )}
        </div>

        {/* Error message */}
        {hasError && (
          <p id={errorId} className="text-xs text-accent-red" role="alert">
            {error}
          </p>
        )}

        {/* Helper text */}
        {!hasError && helperText && (
          <p id={helperId} className="text-xs text-text-muted">
            {helperText}
          </p>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'

export default Input
