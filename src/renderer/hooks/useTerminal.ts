/**
 * Terminal Hook - Hybrid tRPC/IPC Implementation
 *
 * HYBRID APPROACH (from research):
 * - Control operations (create, resize, close): tRPC (type-safe)
 * - Data streaming (write, output): Legacy IPC (low-latency)
 *
 * @see docs/Research/Electron-tRPC Production Patterns Research.md
 */

import { useCallback, useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { trpc } from '@/lib/trpc/client'
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
  const sessionIdRef = useRef<string | null>(null)
  const initializingRef = useRef(false) // Prevent double-init in StrictMode
  const mountedRef = useRef(true)

  const tab = tabs.find((t) => t.id === tabId)

  const initTerminal = useCallback(async () => {
    // Prevent double initialization in StrictMode
    if (!containerRef.current || terminalRef.current || initializingRef.current) return
    initializingRef.current = true

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

    // Create PTY session via tRPC (control operation)
    try {
      const sessionId = await trpc.terminal.create.mutate({})

      // Check if component unmounted during async operation
      if (!mountedRef.current) {
        // Clean up the session we just created
        trpc.terminal.close.mutate({ sessionId }).catch(() => {})
        return
      }

      sessionIdRef.current = sessionId

      // Update tab with terminal and session
      updateTab(tabId, {
        terminal,
        sessionId,
        isConnected: true,
      })

      // Handle terminal input -> PTY (data streaming via legacy IPC)
      terminal.onData((data) => {
        window.electron.send('terminal:write', sessionId, data)
      })

      // Handle resize via tRPC (control operation)
      terminal.onResize(({ cols, rows }) => {
        trpc.terminal.resize.mutate({ sessionId, cols, rows }).catch(() => {
          // Ignore resize errors (session might be closed)
        })
      })

      // Handle PTY output -> terminal (data streaming via legacy IPC)
      unsubscribeRef.current = window.electron.on(`terminal:data:${sessionId}`, (data) => {
        terminal.write(data as string)
      })

      // Handle PTY exit (event via legacy IPC)
      window.electron.on(`terminal:exit:${sessionId}`, () => {
        terminal.writeln('\r\n\x1b[90m[Process exited]\x1b[0m')
        updateTab(tabId, { isConnected: false })
      })

      // Initial resize via tRPC
      await trpc.terminal.resize.mutate({
        sessionId,
        cols: terminal.cols,
        rows: terminal.rows,
      })
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
    mountedRef.current = true
    initTerminal()

    return () => {
      // Mark as unmounted to prevent async operations
      mountedRef.current = false

      // Cleanup on unmount
      unsubscribeRef.current?.()

      // Close the PTY session on backend
      if (sessionIdRef.current) {
        trpc.terminal.close.mutate({ sessionId: sessionIdRef.current }).catch(() => {})
        sessionIdRef.current = null
      }

      terminalRef.current?.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
      initializingRef.current = false
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
