import { app, BrowserWindow, shell, ipcMain, session } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerIpcHandlers, logStreamManager } from './ipc/handlers'
import { terminalManager, registerTerminalHandlers } from './services/terminal'
import { credentialService } from './services/credentials'
import { auditService } from './services/audit'
import { setupGlobalErrorHandlers, configureErrorHandler, handleError } from './utils/error-handler'

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
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' ws://localhost:* http://localhost:*",
      "worker-src 'self' blob:",
      "child-src 'self' blob:",
      "frame-src 'none'",
    ].join('; '),
    production: [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'", // unsafe-inline needed for Tailwind
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
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
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    }
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
    'CLAUDE_PG_PASSWORD': 'postgresql.password',
    'MEMGRAPH_PASSWORD': 'memgraph.password',
    'ANTHROPIC_API_KEY': 'anthropic.apiKey',
  })

  // Initialize OCSF audit logging service
  auditService.initialize()

  // Default open or close DevTools by F12 in development
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Register IPC handlers
  registerIpcHandlers()
  registerTerminalHandlers()

  createWindow()

  // Set main window for terminal manager and log stream manager after creation
  if (mainWindow) {
    terminalManager.setMainWindow(mainWindow)
    logStreamManager.setMainWindow(mainWindow)
  }

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  // Clean up terminal sessions and log streaming
  terminalManager.closeAll()
  logStreamManager.stop()

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
ipcMain.on('error:ui', (_event, data: { message: string; stack?: string; componentStack?: string }) => {
  handleError(new Error(data.message), { component: 'renderer', operation: 'ui:render' })
})
