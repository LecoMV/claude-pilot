import { create } from 'zustand'

export type LogSource = 'claude' | 'mcp' | 'system' | 'agent' | 'workflow' | 'all'
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogEntry {
  id: string
  timestamp: number
  source: LogSource
  level: LogLevel
  message: string
  metadata?: Record<string, unknown>
}

interface LogsState {
  logs: LogEntry[]
  filter: LogSource
  levelFilter: LogLevel | 'all'
  searchQuery: string
  paused: boolean
  maxLogs: number
  autoScroll: boolean

  addLog: (log: LogEntry) => void
  addLogs: (logs: LogEntry[]) => void
  clearLogs: () => void
  setFilter: (filter: LogSource) => void
  setLevelFilter: (level: LogLevel | 'all') => void
  setSearchQuery: (query: string) => void
  setPaused: (paused: boolean) => void
  setAutoScroll: (enabled: boolean) => void
}

export const useLogsStore = create<LogsState>((set) => ({
  logs: [],
  filter: 'all',
  levelFilter: 'all',
  searchQuery: '',
  paused: false,
  maxLogs: 1000,
  autoScroll: true,

  addLog: (log) =>
    set((state) => ({
      logs: state.paused
        ? state.logs
        : [...state.logs.slice(-(state.maxLogs - 1)), log],
    })),

  addLogs: (newLogs) =>
    set((state) => ({
      logs: state.paused
        ? state.logs
        : [...state.logs, ...newLogs].slice(-state.maxLogs),
    })),

  clearLogs: () => set({ logs: [] }),
  setFilter: (filter) => set({ filter }),
  setLevelFilter: (levelFilter) => set({ levelFilter }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setPaused: (paused) => set({ paused }),
  setAutoScroll: (autoScroll) => set({ autoScroll }),
}))
