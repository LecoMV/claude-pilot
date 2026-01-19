import { lazy, Suspense, type ComponentType, type ReactNode } from 'react'
import { PageSkeleton, Skeleton, SkeletonList } from './Skeleton'
import { InlineErrorBoundary } from './ErrorBoundary'

/**
 * Creates a lazy-loaded component with loading fallback and error boundary.
 *
 * @example
 * const LazyMonacoEditor = createLazyComponent(
 *   () => import('../editor/MonacoEditor'),
 *   <Skeleton variant="rectangular" height={400} />
 * )
 */
export function createLazyComponent<P extends object>(
  importFn: () => Promise<{ default: ComponentType<P> }>,
  fallback: ReactNode = <PageSkeleton />,
  errorMessage = 'Failed to load component'
): ComponentType<P> {
  const LazyComponent = lazy(importFn)

  return function LazyWrapper(props: P) {
    return (
      <InlineErrorBoundary fallbackMessage={errorMessage}>
        <Suspense fallback={fallback}>
          <LazyComponent {...props} />
        </Suspense>
      </InlineErrorBoundary>
    )
  }
}

// ============================================================================
// Lazy-loaded Heavy Components
// ============================================================================

/**
 * Monaco Editor - ~2MB
 * Used in: MCP config editor, Profile editor, CLAUDE.md editor
 */
export const LazyCodeEditor = createLazyComponent(
  () => import('./CodeEditor'),
  <Skeleton variant="rectangular" height={400} className="font-mono" />,
  'Failed to load code editor'
)

/**
 * Agent Canvas - Cytoscape + complex visualization
 * Used in: Agents view
 */
export const LazyAgentCanvas = createLazyComponent(
  () => import('../agents/AgentCanvas'),
  <div className="h-[500px] flex items-center justify-center">
    <div className="text-center space-y-4">
      <div className="w-16 h-16 mx-auto border-4 border-accent-purple border-t-transparent rounded-full animate-spin" />
      <p className="text-text-muted">Loading agent visualization...</p>
    </div>
  </div>,
  'Failed to load agent canvas'
)

/**
 * Memory Browser - Complex multi-database UI
 * Used in: Memory view
 */
export const LazyMemoryBrowser = createLazyComponent(
  () => import('../memory/MemoryBrowser'),
  <div className="space-y-4 p-4">
    <Skeleton variant="text" width={200} className="h-6" />
    <SkeletonList count={5} />
  </div>,
  'Failed to load memory browser'
)

/**
 * Hybrid Graph Viewer - Cytoscape + Sigma + FA2
 * Used in: Memory view graph tab
 */
export const LazyHybridGraphViewer = createLazyComponent(
  () => import('../memory/HybridGraphViewer'),
  <div className="h-[400px] flex items-center justify-center bg-surface rounded-lg">
    <div className="text-center space-y-4">
      <div className="w-12 h-12 mx-auto border-4 border-accent-blue border-t-transparent rounded-full animate-spin" />
      <p className="text-text-muted">Loading graph visualization...</p>
    </div>
  </div>,
  'Failed to load graph viewer'
)

/**
 * Terminal - xterm.js + PTY
 * Used in: Terminal view
 */
export const LazyTerminal = createLazyComponent(
  () => import('../terminal/Terminal'),
  <div className="h-full bg-background p-4 font-mono">
    <Skeleton variant="text" width="80%" className="mb-2" />
    <Skeleton variant="text" width="60%" className="mb-2" />
    <Skeleton variant="text" width="70%" className="mb-2" />
    <div className="flex items-center gap-2 mt-4">
      <span className="text-accent-green">$</span>
      <div className="w-2 h-4 bg-text-primary animate-pulse" />
    </div>
  </div>,
  'Failed to load terminal'
)

/**
 * Branch Panel - ReactFlow
 * Used in: Branches view
 */
export const LazyBranchPanel = createLazyComponent(
  () => import('../branches/BranchPanel'),
  <div className="h-[400px] flex items-center justify-center">
    <Skeleton variant="rectangular" width="100%" height="100%" />
  </div>,
  'Failed to load branch panel'
)

/**
 * Plan Panel - Complex visualization
 * Used in: Plans view
 */
export const LazyPlanPanel = createLazyComponent(
  () => import('../plans/PlanPanel'),
  <SkeletonList count={4} itemHeight={80} />,
  'Failed to load plan panel'
)

/**
 * Chat Interface - Claude Code integration
 * Used in: Chat view
 */
export const LazyChatInterface = createLazyComponent(
  () => import('../chat/ChatInterface'),
  <div className="h-full flex flex-col p-4">
    <div className="flex-1 space-y-4">
      <SkeletonList count={3} itemHeight={100} />
    </div>
    <Skeleton variant="rectangular" height={60} className="mt-4" />
  </div>,
  'Failed to load chat interface'
)

/**
 * Global Settings - Complex multi-tab settings
 * Used in: Global Settings view
 */
export const LazyGlobalSettings = createLazyComponent(
  () => import('../settings/GlobalSettings'),
  <div className="p-4 space-y-4">
    <div className="flex gap-2 border-b border-border pb-2">
      {[1, 2, 3, 4].map((i) => (
        <Skeleton key={i} variant="rectangular" width={100} height={32} />
      ))}
    </div>
    <SkeletonList count={5} showAvatar={false} />
  </div>,
  'Failed to load settings'
)

// ============================================================================
// View-specific Loading States
// ============================================================================

export function DashboardSkeleton() {
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Skeleton variant="text" width={150} className="h-8" />
        <Skeleton variant="rectangular" width={120} height={36} />
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="card p-4 animate-pulse">
            <Skeleton variant="text" width="60%" className="mb-2" />
            <Skeleton variant="text" width="40%" className="h-8" />
          </div>
        ))}
      </div>

      {/* Main content */}
      <div className="grid grid-cols-2 gap-6">
        <div className="card p-4">
          <Skeleton variant="text" width={120} className="mb-4 h-5" />
          <SkeletonList count={4} showAvatar={false} itemHeight={40} />
        </div>
        <div className="card p-4">
          <Skeleton variant="text" width={120} className="mb-4 h-5" />
          <Skeleton variant="rectangular" height={200} />
        </div>
      </div>
    </div>
  )
}

export function MCPManagerSkeleton() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton variant="text" width={180} className="h-8" />
        <div className="flex gap-2">
          <Skeleton variant="rectangular" width={100} height={36} />
          <Skeleton variant="rectangular" width={100} height={36} />
        </div>
      </div>
      <SkeletonList count={8} itemHeight={70} />
    </div>
  )
}

export function SessionsSkeleton() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton variant="text" width={150} className="h-8" />
        <Skeleton variant="rectangular" width={200} height={36} />
      </div>
      <SkeletonList count={6} itemHeight={80} />
    </div>
  )
}
