import { useCallback, useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { useTerminalStore } from '@/stores/terminal'

interface UseTerminalOptions {
  tabId: string
  containerRef: React.RefObject<HTMLDivElement>
}

export function useTerminal({ tabId, containerRef }: UseTerminalOptions) {
  const { updateTab, tabs } = useTerminalStore()
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const unsubscribeRef = useRef<(() => void) | null>(null)

  const tab = tabs.find((t) => t.id === tabId)

  const initTerminal = useCallback(async () => {
    if (!containerRef.current || terminalRef.current) return

    // Create terminal instance
    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: 14,
      fontFamily: '"JetBrains Mono", "Fira Code", Consolas, monospace',
      lineHeight: 1.2,
      theme: {
        background: '#1e1e2e',
        foreground: '#cdd6f4',
        cursor: '#f5e0dc',
        cursorAccent: '#1e1e2e',
        selectionBackground: 'rgba(137, 180, 250, 0.3)',
        black: '#45475a',
        red: '#f38ba8',
        green: '#a6e3a1',
        yellow: '#f9e2af',
        blue: '#89b4fa',
        magenta: '#cba6f7',
        cyan: '#94e2d5',
        white: '#bac2de',
        brightBlack: '#585b70',
        brightRed: '#f38ba8',
        brightGreen: '#a6e3a1',
        brightYellow: '#f9e2af',
        brightBlue: '#89b4fa',
        brightMagenta: '#cba6f7',
        brightCyan: '#94e2d5',
        brightWhite: '#a6adc8',
      },
      allowProposedApi: true,
    })

    // Load addons
    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)

    // Try WebGL addon for performance
    try {
      const webglAddon = new WebglAddon()
      terminal.loadAddon(webglAddon)
      webglAddon.onContextLoss(() => {
        webglAddon.dispose()
      })
    } catch {
      // WebGL not available, use canvas renderer
    }

    // Open terminal in container
    terminal.open(containerRef.current)
    fitAddon.fit()

    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    // Create PTY session
    try {
      const sessionId = await window.electron.invoke('terminal:create')

      // Update tab with terminal and session
      updateTab(tabId, {
        terminal,
        sessionId,
        isConnected: true,
      })

      // Handle terminal input -> PTY
      terminal.onData((data) => {
        window.electron.send('terminal:write', sessionId, data)
      })

      // Handle resize
      terminal.onResize(({ cols, rows }) => {
        window.electron.send('terminal:resize', sessionId, cols, rows)
      })

      // Handle PTY output -> terminal
      unsubscribeRef.current = window.electron.on(`terminal:data:${sessionId}`, (data) => {
        terminal.write(data as string)
      })

      // Handle PTY exit
      window.electron.on(`terminal:exit:${sessionId}`, () => {
        terminal.writeln('\r\n\x1b[90m[Process exited]\x1b[0m')
        updateTab(tabId, { isConnected: false })
      })

      // Initial resize
      window.electron.send('terminal:resize', sessionId, terminal.cols, terminal.rows)
    } catch (error) {
      terminal.writeln(`\x1b[31mFailed to create terminal session: ${error}\x1b[0m`)
    }
  }, [tabId, containerRef, updateTab])

  const fit = useCallback(() => {
    if (fitAddonRef.current && terminalRef.current) {
      fitAddonRef.current.fit()
    }
  }, [])

  const focus = useCallback(() => {
    terminalRef.current?.focus()
  }, [])

  // Initialize terminal on mount
  useEffect(() => {
    initTerminal()

    return () => {
      // Cleanup on unmount
      unsubscribeRef.current?.()
      terminalRef.current?.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
    }
  }, [initTerminal])

  // Handle window resize
  useEffect(() => {
    const handleResize = () => fit()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [fit])

  return {
    terminal: terminalRef.current,
    fit,
    focus,
    isConnected: tab?.isConnected ?? false,
  }
}
