/**
 * Hooks Index
 *
 * Re-exports all custom hooks for convenient imports.
 *
 * @example
 * import { useSystemStatus, useMCPServers, useClaudeStatus } from '@/hooks'
 */

// System & Status
export { useSystemStatus } from './useSystemStatus'
export { useClaudeVersion, useClaudeProjects, useClaudeStatus } from './useClaudeStatus'

// MCP
export { useMCPServers, useMCPConnect, useMCPDisconnect } from './useMCPServers'

// Memory & Search
export { useMemorySearch, useEmbeddingStatus, useStoreEmbedding } from './useMemorySearch'

// Terminal (legacy hybrid approach)
export * from './useTerminal'

// Responsive Design
export {
  useBreakpoint,
  useMediaQuery,
  useAutoCollapseSidebar,
  useResponsiveColumns,
  useWindowSize,
  useCompactMode,
  type Breakpoint,
} from './useResponsive'
