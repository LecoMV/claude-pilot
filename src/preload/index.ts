import { contextBridge, ipcRenderer } from 'electron'
import type { ElectronAPI, IPCChannels } from '../shared/types'

/**
 * SECURITY: Explicit whitelist of allowed IPC channels
 * This prevents the renderer from invoking arbitrary channels
 * even if they somehow bypass TypeScript checking at runtime
 */
const ALLOWED_CHANNELS = new Set<string>([
  // System
  'system:status',
  'system:resources',
  'system:getHomePath',

  // Claude
  'claude:version',
  'claude:projects',
  'claude:sessions',

  // MCP
  'mcp:list',
  'mcp:toggle',
  'mcp:reload',
  'mcp:getServer',
  'mcp:getConfig',
  'mcp:saveConfig',

  // Memory
  'memory:learnings',
  'memory:stats',
  'memory:graph',
  'memory:vectors',
  'memory:qdrant:browse',
  'memory:qdrant:search',
  'memory:memgraph:search',
  'memory:raw',
  'memory:unified-search',

  // Terminal
  'terminal:create',
  'terminal:write',
  'terminal:resize',
  'terminal:close',

  // Profile
  'profile:settings',
  'profile:saveSettings',
  'profile:claudemd',
  'profile:saveClaudemd',
  'profile:rules',
  'profile:toggleRule',
  'profile:saveRule',

  // Custom Profiles
  'profiles:list',
  'profiles:get',
  'profiles:create',
  'profiles:update',
  'profiles:delete',
  'profiles:activate',
  'profiles:getActive',
  'profiles:launch',

  // Context
  'context:tokenUsage',
  'context:compactionSettings',
  'context:sessions',
  'context:compact',
  'context:setAutoCompact',

  // Services
  'services:systemd',
  'services:podman',
  'services:systemdAction',
  'services:podmanAction',

  // Logs
  'logs:recent',
  'logs:stream',
  'logs:stopStream',

  // Ollama
  'ollama:status',
  'ollama:list',
  'ollama:running',
  'ollama:pull',
  'ollama:delete',
  'ollama:run',
  'ollama:stop',

  // Agents
  'agents:list',
  'agents:spawn',
  'agents:terminate',
  'agents:swarmStatus',
  'agents:hiveMindStatus',
  'agents:initSwarm',
  'agents:shutdownSwarm',

  // Chat
  'chat:send',

  // Settings
  'settings:get',
  'settings:save',

  // External Sessions
  'sessions:discover',
  'sessions:get',
  'sessions:getMessages',
  'sessions:watch',
  'sessions:getActive',

  // Credentials (secure storage)
  'credentials:store',
  'credentials:retrieve',
  'credentials:delete',
  'credentials:has',
  'credentials:list',
  'credentials:isEncryptionAvailable',

  // Audit (OCSF)
  'audit:query',
  'audit:stats',
  'audit:export',

  // Watchdog (auto-recovery)
  'watchdog:start',
  'watchdog:stop',
  'watchdog:isEnabled',
  'watchdog:getHealth',
  'watchdog:getServiceHealth',
  'watchdog:getRecoveryHistory',
  'watchdog:forceCheck',
  'watchdog:forceRestart',

  // Shell operations
  'shell:openPath',
  'shell:openExternal',

  // Dialog
  'dialog:openDirectory',

  // Terminal external
  'terminal:openAt',

  // Beads (work tracking)
  'beads:list',
  'beads:get',
  'beads:stats',
  'beads:create',
  'beads:update',
  'beads:close',
  'beads:ready',
  'beads:blocked',
  'beads:hasBeads',
])

/**
 * SECURITY: Whitelist of channels allowed for 'on' subscriptions
 * More restricted than invoke channels
 */
const ALLOWED_EVENT_CHANNELS = new Set<string>([
  // Terminal data streams
  'terminal:data',
  'terminal:exit',

  // Session events
  'sessions:event',
  'sessions:message',

  // Log streams
  'logs:entry',

  // Chat streams
  'chat:stream',
  'chat:complete',
  'chat:error',
])

/**
 * Validates that a channel is allowed before invoking
 * @throws Error if channel is not whitelisted
 */
function validateChannel(channel: string, type: 'invoke' | 'on' | 'send'): void {
  const allowedSet = type === 'on' ? ALLOWED_EVENT_CHANNELS : ALLOWED_CHANNELS

  if (!allowedSet.has(channel)) {
    const error = `[Security] Blocked ${type} on unauthorized channel: ${channel}`
    console.error(error)
    throw new Error(error)
  }
}

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
const electronAPI: ElectronAPI = {
  invoke: <K extends keyof IPCChannels>(
    channel: K,
    ...args: Parameters<IPCChannels[K]>
  ) => {
    // Runtime security check
    validateChannel(channel as string, 'invoke')

    return ipcRenderer.invoke(channel, ...args) as ReturnType<IPCChannels[K]>
  },

  on: (channel: string, callback: (...args: unknown[]) => void) => {
    // Runtime security check for event subscriptions
    validateChannel(channel, 'on')

    const listener = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => {
      callback(...args)
    }
    ipcRenderer.on(channel, listener)

    // Return unsubscribe function
    return () => {
      ipcRenderer.removeListener(channel, listener)
    }
  },

  send: (channel: string, ...args: unknown[]) => {
    // Runtime security check
    validateChannel(channel, 'send')

    ipcRenderer.send(channel, ...args)
  },
}

/**
 * Domain-specific API helpers
 * These provide a more intuitive API while still using the validated invoke
 * Future: Can gradually migrate renderer code to use these instead of raw invoke
 */
const claudeAPI = {
  // System
  system: {
    getStatus: () => electronAPI.invoke('system:status'),
    getResources: () => electronAPI.invoke('system:resources'),
  },

  // Memory
  memory: {
    search: (query: string, limit?: number) =>
      electronAPI.invoke('memory:unified-search', query, limit),
    getLearnings: (query?: string, limit?: number) =>
      electronAPI.invoke('memory:learnings', query, limit),
    getStats: () => electronAPI.invoke('memory:stats'),
  },

  // Sessions
  sessions: {
    discover: () => electronAPI.invoke('sessions:discover'),
    get: (id: string) => electronAPI.invoke('sessions:get', id),
    getMessages: (id: string, limit?: number) =>
      electronAPI.invoke('sessions:getMessages', id, limit),
    getActive: () => electronAPI.invoke('sessions:getActive'),
  },

  // Credentials
  credentials: {
    store: (key: string, value: string) =>
      electronAPI.invoke('credentials:store', key, value),
    retrieve: (key: string) => electronAPI.invoke('credentials:retrieve', key),
    delete: (key: string) => electronAPI.invoke('credentials:delete', key),
    has: (key: string) => electronAPI.invoke('credentials:has', key),
    list: () => electronAPI.invoke('credentials:list'),
    isEncryptionAvailable: () =>
      electronAPI.invoke('credentials:isEncryptionAvailable'),
  },

  // Audit
  audit: {
    query: (params?: Parameters<IPCChannels['audit:query']>[0]) =>
      electronAPI.invoke('audit:query', params),
    getStats: () => electronAPI.invoke('audit:stats'),
    export: (format: 'json' | 'csv', params?: { startTime?: number; endTime?: number }) =>
      electronAPI.invoke('audit:export', format, params),
  },

  // Beads (work tracking)
  beads: {
    list: (filter?: Parameters<IPCChannels['beads:list']>[0]) =>
      electronAPI.invoke('beads:list', filter),
    get: (id: string) => electronAPI.invoke('beads:get', id),
    stats: () => electronAPI.invoke('beads:stats'),
    create: (params: Parameters<IPCChannels['beads:create']>[0]) =>
      electronAPI.invoke('beads:create', params),
    update: (id: string, params: Parameters<IPCChannels['beads:update']>[1]) =>
      electronAPI.invoke('beads:update', id, params),
    close: (id: string, reason?: string) =>
      electronAPI.invoke('beads:close', id, reason),
    ready: () => electronAPI.invoke('beads:ready'),
    blocked: () => electronAPI.invoke('beads:blocked'),
  },
}

// Use contextBridge to expose the API
if (process.contextIsolated) {
  try {
    // Main API (backwards compatible)
    contextBridge.exposeInMainWorld('electron', electronAPI)

    // Domain-specific API (new, recommended)
    contextBridge.exposeInMainWorld('claude', claudeAPI)
  } catch (error) {
    console.error('Failed to expose electron API:', error)
  }
} else {
  // @ts-expect-error fallback for non-isolated contexts
  window.electron = electronAPI
  // @ts-expect-error fallback
  window.claude = claudeAPI
}

// Export for type augmentation
export type ClaudeAPI = typeof claudeAPI
