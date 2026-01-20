/**
 * Responsive hooks for desktop Electron app
 *
 * Breakpoints:
 * - narrow: <900px (auto-collapse sidebar)
 * - medium: 900-1400px (default layout)
 * - wide: >1400px (expanded layout)
 * - ultra: >1800px (max content width)
 */

import { useState, useEffect, useCallback } from 'react'

export type Breakpoint = 'narrow' | 'medium' | 'wide' | 'ultra'

const BREAKPOINTS = {
  narrow: 900,
  wide: 1400,
  ultra: 1800,
} as const

function getBreakpoint(width: number): Breakpoint {
  if (width < BREAKPOINTS.narrow) {
    return 'narrow'
  }
  if (width >= BREAKPOINTS.ultra) {
    return 'ultra'
  }
  if (width >= BREAKPOINTS.wide) {
    return 'wide'
  }
  return 'medium'
}

/**
 * Hook to track current breakpoint
 */
export function useBreakpoint(): Breakpoint {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>(() => getBreakpoint(window.innerWidth))

  useEffect(() => {
    const handleResize = () => {
      setBreakpoint(getBreakpoint(window.innerWidth))
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return breakpoint
}

/**
 * Hook to check if window width is below a threshold
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)

  useEffect(() => {
    const mediaQuery = window.matchMedia(query)
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches)

    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }, [query])

  return matches
}

/**
 * Hook for sidebar auto-collapse behavior
 */
export function useAutoCollapseSidebar(
  collapsed: boolean,
  setCollapsed: (collapsed: boolean) => void
): void {
  const isNarrow = useMediaQuery('(max-width: 900px)')
  const [userOverride, setUserOverride] = useState(false)

  // Auto-collapse on narrow windows, but respect user override
  useEffect(() => {
    if (isNarrow && !collapsed && !userOverride) {
      setCollapsed(true)
    } else if (!isNarrow && collapsed && !userOverride) {
      setCollapsed(false)
    }
  }, [isNarrow, collapsed, setCollapsed, userOverride])

  // Track if user manually toggled
  useEffect(() => {
    const handleManualToggle = () => {
      setUserOverride(true)
      // Reset override after window resize
      setTimeout(() => setUserOverride(false), 500)
    }

    // Listen for user toggle events (optional)
    window.addEventListener('sidebar:toggle', handleManualToggle)
    return () => window.removeEventListener('sidebar:toggle', handleManualToggle)
  }, [])
}

/**
 * Hook to get responsive grid columns
 */
export function useResponsiveColumns(
  defaultCols: number = 2,
  narrowCols: number = 1,
  wideCols: number = 3,
  ultraCols: number = 4
): number {
  const breakpoint = useBreakpoint()

  switch (breakpoint) {
    case 'narrow':
      return narrowCols
    case 'wide':
      return wideCols
    case 'ultra':
      return ultraCols
    default:
      return defaultCols
  }
}

/**
 * Hook to get window dimensions
 */
export function useWindowSize(): { width: number; height: number } {
  const [size, setSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  })

  const handleResize = useCallback(() => {
    setSize({
      width: window.innerWidth,
      height: window.innerHeight,
    })
  }, [])

  useEffect(() => {
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [handleResize])

  return size
}

/**
 * Hook for height-responsive adjustments
 */
export function useCompactMode(): boolean {
  return useMediaQuery('(max-height: 700px)')
}
