/**
 * Common UI Components
 *
 * Reusable components following Webmin-inspired patterns:
 * - Progressive disclosure (AdvancedSection)
 * - Status visualization (StatusIndicator)
 * - Inline help (HelpTooltip)
 * - Error handling (ErrorBoundary)
 */

// Error handling
export {
  ErrorBoundary,
  withErrorBoundary,
  InlineErrorBoundary,
  AsyncBoundary,
} from './ErrorBoundary'
export { ErrorToast, useErrorToast } from './ErrorNotifications'

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

// Editor
export { default as CodeEditor } from './CodeEditor'

// Command palette
export { CommandPalette } from './CommandPalette'
