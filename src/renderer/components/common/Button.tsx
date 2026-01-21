/**
 * Button Component
 *
 * A reusable button component with variants for different use cases.
 * Supports multiple sizes, variants, and loading states.
 *
 * @module Button
 */

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Button style variant */
  variant?: ButtonVariant
  /** Button size */
  size?: ButtonSize
  /** Show loading spinner */
  loading?: boolean
  /** Icon to show before the label */
  leftIcon?: ReactNode
  /** Icon to show after the label */
  rightIcon?: ReactNode
  /** Full width button */
  fullWidth?: boolean
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: 'bg-accent-purple text-white hover:bg-accent-purple/90 focus:ring-accent-purple/50',
  secondary:
    'bg-surface text-text-primary border border-border hover:bg-surface-hover focus:ring-border',
  ghost: 'bg-transparent text-text-primary hover:bg-surface-hover focus:ring-border',
  danger: 'bg-accent-red text-white hover:bg-accent-red/90 focus:ring-accent-red/50',
  success: 'bg-accent-green text-background hover:bg-accent-green/90 focus:ring-accent-green/50',
}

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs gap-1.5',
  md: 'px-4 py-2 text-sm gap-2',
  lg: 'px-6 py-3 text-base gap-2.5',
}

const iconSizes: Record<ButtonSize, string> = {
  sm: 'w-3.5 h-3.5',
  md: 'w-4 h-4',
  lg: 'w-5 h-5',
}

/**
 * Button component with support for variants, sizes, and icons.
 *
 * @example
 * ```tsx
 * <Button variant="primary" onClick={handleClick}>
 *   Save Changes
 * </Button>
 *
 * <Button variant="danger" leftIcon={<Trash />} loading={isDeleting}>
 *   Delete
 * </Button>
 * ```
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'secondary',
      size = 'md',
      loading = false,
      leftIcon,
      rightIcon,
      fullWidth = false,
      disabled,
      className,
      children,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={cn(
          // Base styles
          'inline-flex items-center justify-center font-medium rounded-lg',
          'transition-colors duration-150',
          'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-background',
          // Variant styles
          variantStyles[variant],
          // Size styles
          sizeStyles[size],
          // State styles
          isDisabled && 'opacity-50 cursor-not-allowed',
          fullWidth && 'w-full',
          className
        )}
        aria-disabled={isDisabled}
        aria-busy={loading}
        {...props}
      >
        {/* Loading spinner */}
        {loading && (
          <svg
            className={cn('animate-spin', iconSizes[size])}
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}

        {/* Left icon */}
        {!loading && leftIcon && (
          <span className={cn('flex-shrink-0', iconSizes[size])} aria-hidden="true">
            {leftIcon}
          </span>
        )}

        {/* Label */}
        {children && <span>{children}</span>}

        {/* Right icon */}
        {rightIcon && (
          <span className={cn('flex-shrink-0', iconSizes[size])} aria-hidden="true">
            {rightIcon}
          </span>
        )}
      </button>
    )
  }
)

Button.displayName = 'Button'

export default Button
