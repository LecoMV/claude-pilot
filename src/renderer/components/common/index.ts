/**
 * Common UI Components
 *
 * Reusable components following Webmin-inspired patterns:
 * - Progressive disclosure (AdvancedSection)
 * - Status visualization (StatusIndicator)
 * - Inline help (HelpTooltip)
 * - Error handling (ErrorBoundary)
 */

// Base UI components
export { Button, type ButtonVariant, type ButtonSize, type ButtonProps } from './Button'
export { Input, type InputSize, type InputProps } from './Input'
export { Modal, type ModalSize, type ModalProps } from './Modal'

// Error handling
export {
  ErrorBoundary,
  withErrorBoundary,
  InlineErrorBoundary,
  AsyncBoundary,
} from './ErrorBoundary'
export { ErrorToast, useErrorToast } from './ErrorNotifications'
export { ErrorState, InlineError, EmptyErrorState, type ErrorType } from './ErrorState'

// Progressive disclosure
export { AdvancedSection, CollapsibleCard } from './AdvancedSection'

// Status indicators
export {
  StatusIndicator,
  SelectableItem,
  BatchActions,
  type ServiceStatus,
} from './StatusIndicator'

// Help system
export { HelpTooltip, FormField, InfoBanner } from './HelpTooltip'

// Schema-driven forms
export {
  SchemaForm,
  validateSchemaForm,
  createSchemaFromObject,
  type SchemaField,
  type SchemaFieldType,
  type SchemaFieldOption,
  type SchemaFormProps,
} from './SchemaForm'

// Editor
export { default as CodeEditor } from './CodeEditor'

// Command palette
export { CommandPalette } from './CommandPalette'

// Shortcuts help
export { ShortcutsHelp, useShortcutsHelp } from './ShortcutsHelp'

// Loading skeletons
export { Skeleton, SkeletonList, SkeletonGrid, SkeletonTable, PageSkeleton } from './Skeleton'

// Empty states
export {
  EmptyState,
  SessionsEmptyState,
  MemoryEmptyState,
  BeadsEmptyState,
  LogsEmptyState,
  MCPEmptyState,
  AgentsEmptyState,
  SearchEmptyState,
  GraphEmptyState,
  ErrorEmptyState,
} from './EmptyState'

// Lazy-loaded components (heavy dependencies)
export {
  createLazyComponent,
  LazyCodeEditor,
  LazyAgentCanvas,
  LazyMemoryBrowser,
  LazyHybridGraphViewer,
  LazyTerminal,
  LazyBranchPanel,
  LazyPlanPanel,
  LazyChatInterface,
  LazyGlobalSettings,
  DashboardSkeleton,
  MCPManagerSkeleton,
  SessionsSkeleton,
} from './LazyComponents'
