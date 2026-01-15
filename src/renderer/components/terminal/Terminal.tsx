import { useEffect, useRef, useState } from 'react'
import { Terminal as TerminalIcon, Plus, X, Maximize2, Minimize2 } from 'lucide-react'
import { cn } from '@/lib/utils'

// Note: xterm.js will be initialized once dependencies are installed
// This is a placeholder implementation

export function Terminal() {
  const [tabs, setTabs] = useState<{ id: string; title: string }[]>([
    { id: '1', title: 'Terminal 1' },
  ])
  const [activeTab, setActiveTab] = useState('1')
  const [fullscreen, setFullscreen] = useState(false)
  const terminalRef = useRef<HTMLDivElement>(null)

  const addTab = () => {
    const id = Date.now().toString()
    setTabs([...tabs, { id, title: `Terminal ${tabs.length + 1}` }])
    setActiveTab(id)
  }

  const closeTab = (id: string) => {
    if (tabs.length === 1) return
    const newTabs = tabs.filter((t) => t.id !== id)
    setTabs(newTabs)
    if (activeTab === id) {
      setActiveTab(newTabs[newTabs.length - 1].id)
    }
  }

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
                'flex items-center gap-2 px-4 py-2 border-r border-border cursor-pointer',
                activeTab === tab.id
                  ? 'bg-background text-text-primary'
                  : 'text-text-muted hover:text-text-secondary'
              )}
              onClick={() => setActiveTab(tab.id)}
            >
              <TerminalIcon className="w-4 h-4" />
              <span className="text-sm">{tab.title}</span>
              {tabs.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    closeTab(tab.id)
                  }}
                  className="ml-2 p-0.5 rounded hover:bg-surface-hover"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
          <button
            onClick={addTab}
            className="p-2 text-text-muted hover:text-text-primary hover:bg-surface-hover"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        <button
          onClick={() => setFullscreen(!fullscreen)}
          className="p-2 text-text-muted hover:text-text-primary hover:bg-surface-hover"
        >
          {fullscreen ? (
            <Minimize2 className="w-4 h-4" />
          ) : (
            <Maximize2 className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Terminal area */}
      <div
        ref={terminalRef}
        className="flex-1 bg-background p-4 font-mono text-sm overflow-auto"
      >
        <div className="text-accent-green mb-2">
          Claude Command Center Terminal
        </div>
        <div className="text-text-muted mb-4">
          xterm.js will be initialized after npm install
        </div>
        <div className="flex items-center gap-2 text-text-primary">
          <span className="text-accent-purple">deploy@kali</span>
          <span className="text-text-muted">:</span>
          <span className="text-accent-blue">~</span>
          <span className="text-text-muted">$</span>
          <span className="animate-pulse">▌</span>
        </div>
      </div>
    </div>
  )
}
