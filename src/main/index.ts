// Load environment variables from .env file (must be first)
import 'dotenv/config'

import { app, BrowserWindow, shell, ipcMain, session } from 'electron'
import { join } from 'path'
import { hostname } from 'os'
import { createHash } from 'crypto'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import electronUpdater from 'electron-updater'
const { autoUpdater } = electronUpdater
import * as Sentry from '@sentry/electron/main'
import { logStreamManager } from './services/log-stream'
import { terminalManager, registerTerminalHandlers } from './services/terminal'
import { initializeTRPC, cleanupTRPC } from './trpc'
import { credentialService } from './services/credentials'
import { auditService } from './services/audit'
import { workerPool } from './services/workers'
import { setupGlobalErrorHandlers, configureErrorHandler, handleError } from './utils/error-handler'
import { postgresService } from './services/postgresql'
import { memgraphService } from './services/memgraph'
import QdrantService from './services/memory/qdrant.service'

// Initialize Sentry for crash reporting and performance monitoring
// DSN should be set via environment variable SENTRY_DSN
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    // Release tracking - enables "Number of Releases" metric
    release: `claude-pilot@${app.getVersion()}`,
    environment: is.dev ? 'development' : 'production',

    // Session tracking - enables "Crash Free Sessions/Users" metrics
    autoSessionTracking: true,

    // Performance monitoring - enables "Apdex" metric
    // Sample 10% of transactions in production, 100% in dev
    tracesSampleRate: is.dev ? 1.0 : 0.1,
    // Profile 10% of sampled transactions for performance insights
    profilesSampleRate: is.dev ? 1.0 : 0.1,

    // Don't send PII
    sendDefaultPii: false,

    // Scrub sensitive data from error reports
    beforeSend(event) {
      if (event.request?.headers) {
        delete event.request.headers['authorization']
        delete event.request.headers['cookie']
      }
      return event
    },
  })

  // Set user context for "Crash Free Users" metric
  // Using machine ID (hashed) as anonymous user identifier
  const machineId = hostname()
  const anonymousUserId = createHash('sha256').update(machineId).digest('hex').slice(0, 16)
  Sentry.setUser({ id: anonymousUserId })

  console.info('[Sentry] Initialized with release:', `claude-pilot@${app.getVersion()}`)
}

// Configure auto-updater (deploy-9xfr)
autoUpdater.autoDownload = false // Let user decide when to download
autoUpdater.autoInstallOnAppQuit = true

autoUpdater.on('update-available', (info) => {
  // Notify renderer about available update
  mainWindow?.webContents.send('update:available', {
    version: info.version,
    releaseDate: info.releaseDate,
    releaseNotes: info.releaseNotes,
  })
})

autoUpdater.on('update-downloaded', (info) => {
  mainWindow?.webContents.send('update:downloaded', {
    version: info.version,
  })
})

autoUpdater.on('error', (error) => {
  console.error('[AutoUpdater] Error:', error.message)
  Sentry.captureException(error, { tags: { component: 'auto-updater' } })
})

/**
 * Security configuration for the application
 */
const SECURITY_CONFIG = {
  // Content Security Policy
  // - 'self' allows loading from the same origin
  // - 'unsafe-inline' needed for React development (should be removed in production)
  // - blob: needed for certain features like Monaco editor
  // - data: needed for inline SVGs and images
  csp: {
    development: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data: https://fonts.gstatic.com",
      "connect-src 'self' ws://localhost:* http://localhost:*",
      "worker-src 'self' blob:",
      "child-src 'self' blob:",
      "frame-src 'none'",
    ].join('; '),
    production: [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob:",
      "font-src 'self' data: https://fonts.gstatic.com",
      "connect-src 'self'",
      "worker-src 'self' blob:",
      "child-src 'self' blob:",
      "frame-src 'none'",
    ].join('; '),
  },
  // Permissions to deny by default
  deniedPermissions: [
    'geolocation',
    'camera',
    'microphone',
    'notifications',
    'midi',
    'pointerLock',
    'fullscreen',
    'openExternal', // Handled separately
  ] as const,
}

/**
 * Configure session security headers and permissions
 */
function configureSessionSecurity(): void {
  const defaultSession = session.defaultSession

  // Set Content Security Policy
  const cspValue = is.dev ? SECURITY_CONFIG.csp.development : SECURITY_CONFIG.csp.production

  defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [cspValue],
        'X-Content-Type-Options': ['nosniff'],
        'X-Frame-Options': ['DENY'],
        'X-XSS-Protection': ['1; mode=block'],
        'Referrer-Policy': ['strict-origin-when-cross-origin'],
        'Permissions-Policy': ['geolocation=(), camera=(), microphone=()'],
        // P0: Enable SharedArrayBuffer for worker thread optimization (deploy-scb9)
        // COOP/COEP headers required for cross-origin isolation
        // Using 'credentialless' for COEP to allow credentialed subresources
        'Cross-Origin-Opener-Policy': ['same-origin'],
        'Cross-Origin-Embedder-Policy': ['credentialless'],
      },
    })
  })

  // Handle permission requests
  defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    // Deny all permissions by default for security
    const denied = SECURITY_CONFIG.deniedPermissions as readonly string[]
    if (denied.includes(permission)) {
      console.warn(`[Security] Denied permission request: ${permission}`)
      callback(false)
      return
    }

    // Allow clipboard access for copy/paste functionality
    if (permission === 'clipboard-read' || permission === 'clipboard-sanitized-write') {
      callback(true)
      return
    }

    // Default to deny unknown permissions
    console.warn(`[Security] Denied unknown permission: ${permission}`)
    callback(false)
  })

  // Handle permission check (for sync operations)
  defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    const denied = SECURITY_CONFIG.deniedPermissions as readonly string[]
    return !denied.includes(permission)
  })
}

// GPU and rendering configuration for Linux compatibility
// Based on official Electron documentation and issue research:
// - https://github.com/electron/electron/issues/17180 (disableHardwareAcceleration doesn't prevent GPU process)
// - https://github.com/electron/electron/issues/32074 (GPU process launch failed)
// NOTE: --in-process-gpu is required to prevent GPU process spawning entirely
// NOTE: Do NOT add --no-zygote or --single-process (causes SIGTRAP crashes)
app.disableHardwareAcceleration()
app.commandLine.appendSwitch('disable-gpu')
app.commandLine.appendSwitch('disable-gpu-compositing')
app.commandLine.appendSwitch('disable-dev-shm-usage')
app.commandLine.appendSwitch('in-process-gpu')
app.commandLine.appendSwitch('disable-gpu-sandbox')

let mainWindow: BrowserWindow | null = null

/**
 * Initialize database connections on app startup (non-blocking)
 * Connects to PostgreSQL, Memgraph, and Qdrant in parallel
 */
async function initializeDatabaseConnections(): Promise<void> {
  console.info('[Main] Initializing database connections...')

  const results = await Promise.allSettled([
    postgresService.connect().then((ok) => ({ service: 'PostgreSQL', ok })),
    memgraphService.connect().then((ok) => ({ service: 'Memgraph', ok })),
    QdrantService.getInstance()
      .healthCheck()
      .then((ok) => ({ service: 'Qdrant', ok })),
  ])

  for (const result of results) {
    if (result.status === 'fulfilled') {
      const { service, ok } = result.value
      if (ok) {
        console.info(`[Main] ${service}: connected`)
      } else {
        console.warn(`[Main] ${service}: connection failed`)
      }
    } else {
      console.error('[Main] Database connection error:', result.reason)
    }
  }

  // Start Qdrant health monitoring
  QdrantService.getInstance().startHealthMonitoring(60000) // Every 60s
  console.info('[Main] Database connections initialized')
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    show: false,
    backgroundColor: '#1e1e2e',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true, // SECURITY: Enabled per Gemini audit deploy-g1kj
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Load the renderer
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    // Open DevTools in development for debugging
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// App lifecycle
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.claude.pilot')

  // Configure security settings (CSP, permissions, headers)
  configureSessionSecurity()

  // Initialize credential service for secure storage
  // Must be done after app.whenReady() for safeStorage to work
  credentialService.initialize()

  // Migrate legacy credentials from environment variables
  credentialService.migrateFromEnv({
    CLAUDE_PG_PASSWORD: 'postgresql.password',
    MEMGRAPH_PASSWORD: 'memgraph.password',
    ANTHROPIC_API_KEY: 'anthropic.apiKey',
  })

  // Initialize OCSF audit logging service
  auditService.initialize()

  // Initialize Piscina worker pools for CPU-intensive operations (deploy-scb9)
  // This enables SharedArrayBuffer-based zero-copy transfers
  try {
    workerPool.initialize()
  } catch (error) {
    console.error('[Main] Failed to initialize worker pools:', error)
  }

  // Default open or close DevTools by F12 in development
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Register terminal IPC handlers (streaming data via legacy IPC for performance)
  // Note: All request/response handlers are now in tRPC controllers
  registerTerminalHandlers()

  createWindow()

  // Set main window for terminal manager and log stream manager after creation
  if (mainWindow) {
    terminalManager.setMainWindow(mainWindow)
    logStreamManager.setMainWindow(mainWindow)

    // Initialize tRPC for type-safe IPC (coexists with legacy handlers)
    initializeTRPC(mainWindow)

    // Initialize database connections in background (non-blocking)
    initializeDatabaseConnections()
  }

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  // Clean up terminal sessions and log streaming
  terminalManager.closeAll()
  logStreamManager.stop()
  cleanupTRPC()

  // Clean up database connections
  QdrantService.getInstance().shutdown()
  postgresService.disconnect().catch(() => {})
  memgraphService.disconnect().catch(() => {})

  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Configure and setup enterprise-grade error handling
configureErrorHandler({
  logToFile: true,
  showDialogForCritical: true,
})
setupGlobalErrorHandlers()

// Listen for UI errors from renderer
ipcMain.on(
  'error:ui',
  (_event, data: { message: string; stack?: string; componentStack?: string }) => {
    handleError(new Error(data.message), { component: 'renderer', operation: 'ui:render' })
  }
)
