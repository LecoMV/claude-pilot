import { cn } from '@/lib/utils'

interface SkeletonProps {
  /** Skeleton variant */
  variant?: 'text' | 'circular' | 'rectangular' | 'card'
  /** Width (CSS value) */
  width?: string | number
  /** Height (CSS value) */
  height?: string | number
  /** Number of lines for text variant */
  lines?: number
  /** Animation style */
  animation?: 'pulse' | 'wave' | 'none'
  /** Additional class names */
  className?: string
}

/**
 * Loading skeleton placeholder component.
 * Displays a placeholder while content is loading.
 *
 * @example
 * <Skeleton variant="text" lines={3} />
 * <Skeleton variant="card" height={200} />
 */
export function Skeleton({
  variant = 'text',
  width,
  height,
  lines = 1,
  animation = 'pulse',
  className,
}: SkeletonProps) {
  const baseClasses = cn(
    'bg-surface-hover rounded',
    animation === 'pulse' && 'animate-pulse',
    animation === 'wave' && 'skeleton-wave',
    className
  )

  const style = {
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
  }

  if (variant === 'circular') {
    return (
      <div
        className={cn(baseClasses, 'rounded-full')}
        style={{ ...style, width: width || height || 40, height: height || width || 40 }}
      />
    )
  }

  if (variant === 'rectangular') {
    return <div className={baseClasses} style={{ ...style, height: height || 100 }} />
  }

  if (variant === 'card') {
    return (
      <div className={cn(baseClasses, 'p-4')} style={style}>
        <div className="flex items-center gap-4 mb-4">
          <Skeleton variant="circular" width={40} height={40} animation="none" />
          <div className="flex-1 space-y-2">
            <Skeleton variant="text" width="60%" animation="none" />
            <Skeleton variant="text" width="40%" animation="none" />
          </div>
        </div>
        <Skeleton variant="text" lines={3} animation="none" />
      </div>
    )
  }

  // Text variant
  if (lines === 1) {
    return <div className={cn(baseClasses, 'h-4')} style={style} />
  }

  return (
    <div className="space-y-2" style={style}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className={cn(baseClasses, 'h-4')}
          style={{ width: i === lines - 1 ? '80%' : '100%' }}
        />
      ))}
    </div>
  )
}

/**
 * Skeleton loader for lists
 */
interface SkeletonListProps {
  /** Number of items */
  count?: number
  /** Item height */
  itemHeight?: number
  /** Show avatar placeholder */
  showAvatar?: boolean
  /** Additional class names */
  className?: string
}

export function SkeletonList({
  count = 5,
  itemHeight = 60,
  showAvatar = true,
  className,
}: SkeletonListProps) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 p-3 bg-surface rounded-lg animate-pulse"
          style={{ height: itemHeight }}
        >
          {showAvatar && <Skeleton variant="circular" width={36} height={36} animation="none" />}
          <div className="flex-1 space-y-2">
            <Skeleton variant="text" width="70%" animation="none" />
            <Skeleton variant="text" width="50%" animation="none" />
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * Skeleton loader for dashboards/grids
 */
interface SkeletonGridProps {
  /** Number of items */
  count?: number
  /** Number of columns */
  columns?: number
  /** Card height */
  cardHeight?: number
  /** Additional class names */
  className?: string
}

export function SkeletonGrid({
  count = 6,
  columns = 3,
  cardHeight = 150,
  className,
}: SkeletonGridProps) {
  return (
    <div
      className={cn('grid gap-4', className)}
      style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="bg-surface rounded-lg p-4 animate-pulse"
          style={{ height: cardHeight }}
        >
          <Skeleton variant="text" width="40%" className="mb-4" animation="none" />
          <Skeleton variant="text" lines={2} animation="none" />
        </div>
      ))}
    </div>
  )
}

/**
 * Skeleton loader for tables
 */
interface SkeletonTableProps {
  /** Number of rows */
  rows?: number
  /** Number of columns */
  columns?: number
  /** Show header */
  showHeader?: boolean
  /** Additional class names */
  className?: string
}

export function SkeletonTable({
  rows = 5,
  columns = 4,
  showHeader = true,
  className,
}: SkeletonTableProps) {
  return (
    <div className={cn('space-y-2', className)}>
      {showHeader && (
        <div className="flex gap-4 p-3 bg-surface-hover rounded-lg">
          {Array.from({ length: columns }).map((_, i) => (
            <Skeleton key={i} variant="text" width={`${100 / columns}%`} animation="none" />
          ))}
        </div>
      )}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex gap-4 p-3 bg-surface rounded-lg animate-pulse">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton key={colIndex} variant="text" width={`${100 / columns}%`} animation="none" />
          ))}
        </div>
      ))}
    </div>
  )
}

/**
 * Full-page loading skeleton
 */
export function PageSkeleton() {
  return (
    <div className="p-6 space-y-6 animate-in fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton variant="text" width={200} className="h-6" />
          <Skeleton variant="text" width={300} />
        </div>
        <Skeleton variant="rectangular" width={100} height={36} />
      </div>

      {/* Stats cards */}
      <SkeletonGrid count={4} columns={4} cardHeight={100} />

      {/* Main content */}
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2">
          <SkeletonList count={5} />
        </div>
        <div>
          <Skeleton variant="card" height={300} />
        </div>
      </div>
    </div>
  )
}
