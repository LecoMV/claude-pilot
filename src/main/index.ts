import { app, BrowserWindow, shell, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerIpcHandlers } from './ipc/handlers'
import { terminalManager, registerTerminalHandlers } from './services/terminal'
import { setupGlobalErrorHandlers, configureErrorHandler, handleError } from './utils/error-handler'

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
      preload: join(__dirname, '../preload/index.js'),
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
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// App lifecycle
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.claude.command-center')

  // Default open or close DevTools by F12 in development
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Register IPC handlers
  registerIpcHandlers()
  registerTerminalHandlers()

  createWindow()

  // Set main window for terminal manager after creation
  if (mainWindow) {
    terminalManager.setMainWindow(mainWindow)
  }

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  // Clean up terminal sessions
  terminalManager.closeAll()

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
