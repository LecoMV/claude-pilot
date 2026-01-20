import { useEffect, useRef } from 'react'
import { Terminal as TerminalIcon, Plus, X, Maximize2, Minimize2, Circle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTerminalStore } from '@/stores/terminal'
import { useTerminal } from '@/hooks/useTerminal'
import '@xterm/xterm/css/xterm.css'

export function Terminal() {
  const { tabs, activeTabId, fullscreen, addTab, removeTab, setActiveTab, setFullscreen } =
    useTerminalStore()
  const initializedRef = useRef(false)

  // Initialize with first tab if empty (prevent double-add in StrictMode)
  useEffect(() => {
    if (tabs.length === 0 && !initializedRef.current) {
      initializedRef.current = true
      addTab()
    }
  }, [tabs.length, addTab])

  return (
    <div
      className={cn(
        'flex flex-col animate-in',
        fullscreen ? 'fixed inset-0 z-50 bg-background' : 'h-[calc(100vh-12rem)]'
      )}
    >
      {/* Tab bar */}
      <div className="flex items-center justify-between bg-surface border-b border-border">
        <div className="flex items-center overflow-x-auto">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={cn(
                'flex items-center gap-2 px-4 py-2 border-r border-border cursor-pointer transition-colors',
                activeTabId === tab.id
                  ? 'bg-background text-text-primary'
                  : 'text-text-muted hover:text-text-secondary hover:bg-surface-hover'
              )}
              onClick={() => setActiveTab(tab.id)}
            >
              <TerminalIcon className="w-4 h-4" />
              <span className="text-sm whitespace-nowrap">{tab.title}</span>
              <Circle
                className={cn(
                  'w-2 h-2',
                  tab.isConnected
                    ? 'fill-accent-green text-accent-green'
                    : 'fill-text-muted text-text-muted'
                )}
              />
              {tabs.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    removeTab(tab.id)
                  }}
                  className="ml-1 p-0.5 rounded hover:bg-surface-hover"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
          <button
            onClick={() => addTab()}
            className="p-2 text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
            title="New terminal"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        <button
          onClick={() => setFullscreen(!fullscreen)}
          className="p-2 text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
          title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        >
          {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </div>

      {/* Terminal panels */}
      <div className="flex-1 relative bg-background overflow-hidden">
        {tabs.map((tab) => (
          <TerminalPanel key={tab.id} tabId={tab.id} visible={tab.id === activeTabId} />
        ))}
      </div>
    </div>
  )
}

interface TerminalPanelProps {
  tabId: string
  visible: boolean
}

function TerminalPanel({ tabId, visible }: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { fit, focus } = useTerminal({ tabId, containerRef })

  // Fit and focus when becoming visible
  useEffect(() => {
    if (visible) {
      // Small delay to ensure container is rendered
      const timer = setTimeout(() => {
        fit()
        focus()
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [visible, fit, focus])

  return (
    <div className={cn('absolute inset-0 p-1', visible ? 'block' : 'hidden')}>
      <div ref={containerRef} className="w-full h-full" onClick={() => focus()} />
    </div>
  )
}

export default Terminal
