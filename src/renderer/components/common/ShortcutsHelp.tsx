import { useState, useEffect, useCallback } from 'react'
import { X, Keyboard } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Shortcut {
  keys: string[]
  description: string
}

interface ShortcutGroup {
  title: string
  shortcuts: Shortcut[]
}

const shortcutGroups: ShortcutGroup[] = [
  {
    title: 'General',
    shortcuts: [
      { keys: ['Ctrl', 'K'], description: 'Open command palette' },
      { keys: ['?'], description: 'Show keyboard shortcuts' },
      { keys: ['Esc'], description: 'Close dialog / Cancel' },
    ],
  },
  {
    title: 'Navigation',
    shortcuts: [
      { keys: ['G', 'D'], description: 'Go to Dashboard' },
      { keys: ['G', 'P'], description: 'Go to Projects' },
      { keys: ['G', 'S'], description: 'Go to Sessions' },
      { keys: ['G', 'M'], description: 'Go to MCP Servers' },
      { keys: ['G', 'T'], description: 'Go to Terminal' },
      { keys: ['G', 'L'], description: 'Go to Logs' },
    ],
  },
  {
    title: 'Actions',
    shortcuts: [
      { keys: ['Ctrl', 'R'], description: 'Refresh current view' },
      { keys: ['Ctrl', 'N'], description: 'New item (context-sensitive)' },
      { keys: ['Ctrl', 'S'], description: 'Save changes' },
      { keys: ['Ctrl', '/'], description: 'Toggle sidebar' },
    ],
  },
  {
    title: 'Terminal',
    shortcuts: [
      { keys: ['Ctrl', '`'], description: 'Focus terminal' },
      { keys: ['Ctrl', 'C'], description: 'Cancel / Interrupt' },
      { keys: ['Ctrl', 'L'], description: 'Clear terminal' },
    ],
  },
]

interface ShortcutsHelpProps {
  isOpen: boolean
  onClose: () => void
}

function KeyBadge({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[24px] h-6 px-2 bg-surface-hover border border-border rounded text-xs font-mono text-text-primary">
      {children}
    </kbd>
  )
}

export function ShortcutsHelp({ isOpen, onClose }: ShortcutsHelpProps) {
  // Close on Escape
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-title"
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal content */}
      <div
        className={cn(
          'relative w-full max-w-2xl max-h-[80vh] bg-surface border border-border rounded-xl shadow-2xl overflow-hidden',
          'animate-in fade-in zoom-in-95 duration-200'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <Keyboard className="w-5 h-5 text-accent-purple" aria-hidden="true" />
            <h2 id="shortcuts-title" className="text-lg font-semibold text-text-primary">
              Keyboard Shortcuts
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-text-muted hover:text-text-primary hover:bg-surface-hover rounded-lg transition-colors"
            aria-label="Close shortcuts help"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {shortcutGroups.map((group) => (
              <div key={group.title}>
                <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-3">
                  {group.title}
                </h3>
                <div className="space-y-2">
                  {group.shortcuts.map((shortcut, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-surface-hover transition-colors"
                    >
                      <span className="text-sm text-text-secondary">{shortcut.description}</span>
                      <div className="flex items-center gap-1">
                        {shortcut.keys.map((key, keyIndex) => (
                          <span key={keyIndex} className="flex items-center gap-1">
                            <KeyBadge>{key}</KeyBadge>
                            {keyIndex < shortcut.keys.length - 1 && (
                              <span className="text-text-muted text-xs">+</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-border bg-surface-hover/50">
          <p className="text-xs text-text-muted text-center">
            Press <KeyBadge>?</KeyBadge> anywhere to show this help
          </p>
        </div>
      </div>
    </div>
  )
}

/**
 * Hook to manage shortcuts help state
 */
export function useShortcutsHelp() {
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in an input
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return
      }

      // ? to open shortcuts help
      if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        setIsOpen((prev) => !prev)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])

  return { isOpen, open, close }
}
