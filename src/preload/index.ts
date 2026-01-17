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

  // MCP Proxy/Federation (deploy-zebp)
  'mcp:proxy:init',
  'mcp:proxy:servers',
  'mcp:proxy:connect',
  'mcp:proxy:connectAll',
  'mcp:proxy:disconnect',
  'mcp:proxy:tools',
  'mcp:proxy:resources',
  'mcp:proxy:prompts',
  'mcp:proxy:callTool',
  'mcp:proxy:stats',
  'mcp:proxy:config',
  'mcp:proxy:updateConfig',

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

  // Transcript
  'transcript:parse',
  'transcript:stats',
  'transcript:last',
  'transcript:watch',

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
  'settings:setBudget',

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
  // SIEM log shipping (deploy-e1fc)
  'audit:siem:register',
  'audit:siem:unregister',
  'audit:siem:setEnabled',
  'audit:siem:getEndpoints',
  'audit:siem:getStats',
  'audit:siem:flush',

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

  // Auto-update
  'update:check',
  'update:download',
  'update:install',
  'update:getStatus',

  // Observability - OpenTelemetry (deploy-rjvh)
  'observability:init',
  'observability:startTrace',
  'observability:startSpan',
  'observability:endSpan',
  'observability:recordException',
  'observability:addEvent',
  'observability:getMetrics',
  'observability:getStats',
  'observability:getConfig',
  'observability:updateConfig',
  'observability:recordMetric',
  'observability:getActiveSpans',
  'observability:getRecentSpans',

  // Tree-sitter - Code parsing (deploy-4u2e)
  'treesitter:init',
  'treesitter:parseFile',
  'treesitter:indexCodebase',
  'treesitter:searchSymbols',
  'treesitter:findDefinition',
  'treesitter:findReferences',
  'treesitter:getFileOutline',
  'treesitter:getCodebaseStructure',
  'treesitter:clearCache',
  'treesitter:clearIndex',
  'treesitter:getStats',
  'treesitter:getConfig',
  'treesitter:updateConfig',

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

  // pgvector (embeddings)
  'pgvector:status',
  'pgvector:search',
  'pgvector:embed',
  'pgvector:collections',
  'pgvector:createIndex',
  'pgvector:rebuildIndex',
  'pgvector:vacuum',
  'pgvector:getAutoConfig',
  'pgvector:setAutoConfig',

  // Predictive context
  'context:predict',
  'context:patterns',
  'context:stats',
  'context:recordAccess',
  'context:getConfig',
  'context:setConfig',
  'context:clearCache',

  // Plans (autonomous execution)
  'plans:list',
  'plans:get',
  'plans:create',
  'plans:update',
  'plans:delete',
  'plans:execute',
  'plans:pause',
  'plans:resume',
  'plans:cancel',
  'plans:stepComplete',
  'plans:stepFail',
  'plans:stats',

  // Branches (conversation branching)
  'branches:list',
  'branches:get',
  'branches:getTree',
  'branches:create',
  'branches:delete',
  'branches:rename',
  'branches:switch',
  'branches:addMessage',
  'branches:diff',
  'branches:merge',
  'branches:abandon',
  'branches:stats',
  'branches:getActiveBranch',
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

  // Plan events
  'plan:updated',

  // Branch events
  'branches:updated',

  // Update events
  'update:available',
  'update:downloaded',
  'update:progress',
  'update:error',
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
  invoke: <K extends keyof IPCChannels>(channel: K, ...args: Parameters<IPCChannels[K]>) => {
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

  // MCP Proxy/Federation (deploy-zebp)
  mcpProxy: {
    init: (config?: Parameters<IPCChannels['mcp:proxy:init']>[0]) =>
      electronAPI.invoke('mcp:proxy:init', config),
    getServers: () => electronAPI.invoke('mcp:proxy:servers'),
    connect: (serverId: string) => electronAPI.invoke('mcp:proxy:connect', serverId),
    connectAll: () => electronAPI.invoke('mcp:proxy:connectAll'),
    disconnect: (serverId: string) => electronAPI.invoke('mcp:proxy:disconnect', serverId),
    getTools: () => electronAPI.invoke('mcp:proxy:tools'),
    getResources: () => electronAPI.invoke('mcp:proxy:resources'),
    getPrompts: () => electronAPI.invoke('mcp:proxy:prompts'),
    callTool: (toolName: string, args: Record<string, unknown>) =>
      electronAPI.invoke('mcp:proxy:callTool', toolName, args),
    getStats: () => electronAPI.invoke('mcp:proxy:stats'),
    getConfig: () => electronAPI.invoke('mcp:proxy:config'),
    updateConfig: (config: Parameters<IPCChannels['mcp:proxy:updateConfig']>[0]) =>
      electronAPI.invoke('mcp:proxy:updateConfig', config),
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
    store: (key: string, value: string) => electronAPI.invoke('credentials:store', key, value),
    retrieve: (key: string) => electronAPI.invoke('credentials:retrieve', key),
    delete: (key: string) => electronAPI.invoke('credentials:delete', key),
    has: (key: string) => electronAPI.invoke('credentials:has', key),
    list: () => electronAPI.invoke('credentials:list'),
    isEncryptionAvailable: () => electronAPI.invoke('credentials:isEncryptionAvailable'),
  },

  // Audit
  audit: {
    query: (params?: Parameters<IPCChannels['audit:query']>[0]) =>
      electronAPI.invoke('audit:query', params),
    getStats: () => electronAPI.invoke('audit:stats'),
    export: (format: 'json' | 'csv', params?: { startTime?: number; endTime?: number }) =>
      electronAPI.invoke('audit:export', format, params),
    // SIEM log shipping (deploy-e1fc)
    siem: {
      register: (endpoint: Parameters<IPCChannels['audit:siem:register']>[0]) =>
        electronAPI.invoke('audit:siem:register', endpoint),
      unregister: (endpointId: string) => electronAPI.invoke('audit:siem:unregister', endpointId),
      setEnabled: (endpointId: string, enabled: boolean) =>
        electronAPI.invoke('audit:siem:setEnabled', endpointId, enabled),
      getEndpoints: () => electronAPI.invoke('audit:siem:getEndpoints'),
      getStats: (endpointId?: string) => electronAPI.invoke('audit:siem:getStats', endpointId),
      flush: (endpointId?: string) => electronAPI.invoke('audit:siem:flush', endpointId),
    },
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
    close: (id: string, reason?: string) => electronAPI.invoke('beads:close', id, reason),
    ready: () => electronAPI.invoke('beads:ready'),
    blocked: () => electronAPI.invoke('beads:blocked'),
  },

  // pgvector (embeddings)
  pgvector: {
    getStatus: () => electronAPI.invoke('pgvector:status'),
    search: (query: string, table?: string, limit?: number, threshold?: number) =>
      electronAPI.invoke('pgvector:search', query, table, limit, threshold),
    embed: (text: string) => electronAPI.invoke('pgvector:embed', text),
    getCollections: () => electronAPI.invoke('pgvector:collections'),
    createIndex: (table: string, config: Parameters<IPCChannels['pgvector:createIndex']>[1]) =>
      electronAPI.invoke('pgvector:createIndex', table, config),
    rebuildIndex: (table: string) => electronAPI.invoke('pgvector:rebuildIndex', table),
    vacuum: (table: string) => electronAPI.invoke('pgvector:vacuum', table),
    getAutoConfig: () => electronAPI.invoke('pgvector:getAutoConfig'),
    setAutoConfig: (config: Parameters<IPCChannels['pgvector:setAutoConfig']>[0]) =>
      electronAPI.invoke('pgvector:setAutoConfig', config),
  },

  // Predictive context
  predictiveContext: {
    predict: (prompt: string, projectPath: string) =>
      electronAPI.invoke('context:predict', prompt, projectPath),
    getPatterns: (projectPath: string) => electronAPI.invoke('context:patterns', projectPath),
    getStats: () => electronAPI.invoke('context:stats'),
    recordAccess: (path: string, keywords: string[]) =>
      electronAPI.invoke('context:recordAccess', path, keywords),
    getConfig: () => electronAPI.invoke('context:getConfig'),
    setConfig: (config: Parameters<IPCChannels['context:setConfig']>[0]) =>
      electronAPI.invoke('context:setConfig', config),
    clearCache: () => electronAPI.invoke('context:clearCache'),
  },

  // Plans (autonomous execution)
  plans: {
    list: (projectPath?: string) => electronAPI.invoke('plans:list', projectPath),
    get: (id: string) => electronAPI.invoke('plans:get', id),
    create: (params: Parameters<IPCChannels['plans:create']>[0]) =>
      electronAPI.invoke('plans:create', params),
    update: (id: string, updates: Partial<Parameters<IPCChannels['plans:get']>>) =>
      electronAPI.invoke('plans:update', id, updates),
    delete: (id: string) => electronAPI.invoke('plans:delete', id),
    execute: (id: string) => electronAPI.invoke('plans:execute', id),
    pause: (id: string) => electronAPI.invoke('plans:pause', id),
    resume: (id: string) => electronAPI.invoke('plans:resume', id),
    cancel: (id: string) => electronAPI.invoke('plans:cancel', id),
    stepComplete: (planId: string, stepId: string, output?: string) =>
      electronAPI.invoke('plans:stepComplete', planId, stepId, output),
    stepFail: (planId: string, stepId: string, error: string) =>
      electronAPI.invoke('plans:stepFail', planId, stepId, error),
    getStats: () => electronAPI.invoke('plans:stats'),
  },

  // Transcript parsing
  transcript: {
    parse: (filePath: string, options?: Parameters<IPCChannels['transcript:parse']>[1]) =>
      electronAPI.invoke('transcript:parse', filePath, options),
    stats: (filePath: string) => electronAPI.invoke('transcript:stats', filePath),
    last: (filePath: string, count: number) =>
      electronAPI.invoke('transcript:last', filePath, count),
    watch: (filePath: string, enable: boolean) =>
      electronAPI.invoke('transcript:watch', filePath, enable),
  },

  // Branches (conversation branching)
  branches: {
    list: (sessionId: string) => electronAPI.invoke('branches:list', sessionId),
    get: (branchId: string) => electronAPI.invoke('branches:get', branchId),
    getTree: (sessionId: string) => electronAPI.invoke('branches:getTree', sessionId),
    create: (params: {
      sessionId: string
      branchPointMessageId: string
      name: string
      description?: string
    }) => electronAPI.invoke('branches:create', params),
    delete: (branchId: string) => electronAPI.invoke('branches:delete', branchId),
    rename: (branchId: string, name: string) =>
      electronAPI.invoke('branches:rename', branchId, name),
    switch: (branchId: string) => electronAPI.invoke('branches:switch', branchId),
    addMessage: (
      branchId: string,
      message: {
        id: string
        role: 'user' | 'assistant' | 'tool-result'
        content: string
        timestamp: number
        toolName?: string
        toolInput?: Record<string, unknown>
        toolOutput?: string
        parentId?: string
      }
    ) => electronAPI.invoke('branches:addMessage', branchId, message),
    diff: (branchA: string, branchB: string) =>
      electronAPI.invoke('branches:diff', branchA, branchB),
    merge: (params: {
      sourceBranchId: string
      targetBranchId: string
      strategy: 'replace' | 'append' | 'cherry-pick'
      messageIds?: string[]
    }) => electronAPI.invoke('branches:merge', params),
    abandon: (branchId: string) => electronAPI.invoke('branches:abandon', branchId),
    getStats: (sessionId?: string) => electronAPI.invoke('branches:stats', sessionId),
    getActiveBranch: (sessionId: string) =>
      electronAPI.invoke('branches:getActiveBranch', sessionId),
  },

  // Auto-update
  update: {
    check: () => electronAPI.invoke('update:check'),
    download: () => electronAPI.invoke('update:download'),
    install: () => electronAPI.invoke('update:install'),
    getStatus: () => electronAPI.invoke('update:getStatus'),
  },

  // Observability - OpenTelemetry (deploy-rjvh)
  observability: {
    init: (config?: Parameters<IPCChannels['observability:init']>[0]) =>
      electronAPI.invoke('observability:init', config),
    startTrace: (name: string, attributes?: Record<string, string | number | boolean>) =>
      electronAPI.invoke('observability:startTrace', name, attributes),
    startSpan: (
      name: string,
      kind?: 'internal' | 'server' | 'client' | 'producer' | 'consumer',
      attributes?: Record<string, string | number | boolean>
    ) => electronAPI.invoke('observability:startSpan', name, kind, attributes),
    endSpan: (
      spanId: string,
      status?: { code: 'unset' | 'ok' | 'error'; message?: string },
      attributes?: Record<string, string | number | boolean>
    ) => electronAPI.invoke('observability:endSpan', spanId, status, attributes),
    recordException: (spanId: string, error: { name: string; message: string; stack?: string }) =>
      electronAPI.invoke('observability:recordException', spanId, error),
    addEvent: (spanId: string, name: string, attributes?: Record<string, string | number | boolean>) =>
      electronAPI.invoke('observability:addEvent', spanId, name, attributes),
    getMetrics: () => electronAPI.invoke('observability:getMetrics'),
    getStats: () => electronAPI.invoke('observability:getStats'),
    getConfig: () => electronAPI.invoke('observability:getConfig'),
    updateConfig: (config: Parameters<IPCChannels['observability:updateConfig']>[0]) =>
      electronAPI.invoke('observability:updateConfig', config),
    recordMetric: (
      name: string,
      value: number,
      type: 'counter' | 'gauge' | 'histogram',
      attributes?: Record<string, string>
    ) => electronAPI.invoke('observability:recordMetric', name, value, type, attributes),
    getActiveSpans: () => electronAPI.invoke('observability:getActiveSpans'),
    getRecentSpans: (limit?: number) => electronAPI.invoke('observability:getRecentSpans', limit),
  },

  // Tree-sitter - Code parsing (deploy-4u2e)
  treeSitter: {
    init: (config?: Parameters<IPCChannels['treesitter:init']>[0]) =>
      electronAPI.invoke('treesitter:init', config),
    parseFile: (filePath: string) => electronAPI.invoke('treesitter:parseFile', filePath),
    indexCodebase: (rootPath: string) => electronAPI.invoke('treesitter:indexCodebase', rootPath),
    searchSymbols: (query: string, options?: Parameters<IPCChannels['treesitter:searchSymbols']>[1]) =>
      electronAPI.invoke('treesitter:searchSymbols', query, options),
    findDefinition: (symbolName: string, rootPath?: string) =>
      electronAPI.invoke('treesitter:findDefinition', symbolName, rootPath),
    findReferences: (symbolName: string, rootPath?: string) =>
      electronAPI.invoke('treesitter:findReferences', symbolName, rootPath),
    getFileOutline: (filePath: string) => electronAPI.invoke('treesitter:getFileOutline', filePath),
    getCodebaseStructure: (rootPath: string) =>
      electronAPI.invoke('treesitter:getCodebaseStructure', rootPath),
    clearCache: (filePath?: string) => electronAPI.invoke('treesitter:clearCache', filePath),
    clearIndex: (rootPath: string) => electronAPI.invoke('treesitter:clearIndex', rootPath),
    getStats: () => electronAPI.invoke('treesitter:getStats'),
    getConfig: () => electronAPI.invoke('treesitter:getConfig'),
    updateConfig: (config: Parameters<IPCChannels['treesitter:updateConfig']>[0]) =>
      electronAPI.invoke('treesitter:updateConfig', config),
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
