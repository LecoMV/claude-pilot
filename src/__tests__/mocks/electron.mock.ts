/**
 * Comprehensive Electron Mock Factory
 *
 * Provides enhanced mock factories for Electron APIs used in Claude Pilot.
 * Use these factories in tests that need custom mock behavior beyond
 * the default mocks in setup.ts.
 *
 * @module electron.mock
 */

import { vi } from 'vitest'

// Type-only imports for documentation - actual types are mock interfaces below

// ===========================================================================
// BROWSER WINDOW MOCK
// ===========================================================================

export interface MockBrowserWindowOptions {
  title?: string
  width?: number
  height?: number
  isDestroyed?: boolean
  isFocused?: boolean
  isVisible?: boolean
  isMinimized?: boolean
  isMaximized?: boolean
  isFullScreen?: boolean
}

export interface MockWebContents {
  send: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
  once: ReturnType<typeof vi.fn>
  removeListener: ReturnType<typeof vi.fn>
  openDevTools: ReturnType<typeof vi.fn>
  closeDevTools: ReturnType<typeof vi.fn>
  isDevToolsOpened: ReturnType<typeof vi.fn>
  reload: ReturnType<typeof vi.fn>
  setZoomLevel: ReturnType<typeof vi.fn>
  getZoomLevel: ReturnType<typeof vi.fn>
  session: {
    setPermissionRequestHandler: ReturnType<typeof vi.fn>
    setPermissionCheckHandler: ReturnType<typeof vi.fn>
    webRequest: {
      onHeadersReceived: ReturnType<typeof vi.fn>
    }
  }
  postMessage: ReturnType<typeof vi.fn>
}

export interface MockBrowserWindow {
  loadFile: ReturnType<typeof vi.fn>
  loadURL: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
  once: ReturnType<typeof vi.fn>
  removeListener: ReturnType<typeof vi.fn>
  show: ReturnType<typeof vi.fn>
  hide: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
  destroy: ReturnType<typeof vi.fn>
  focus: ReturnType<typeof vi.fn>
  blur: ReturnType<typeof vi.fn>
  minimize: ReturnType<typeof vi.fn>
  maximize: ReturnType<typeof vi.fn>
  unmaximize: ReturnType<typeof vi.fn>
  setFullScreen: ReturnType<typeof vi.fn>
  isDestroyed: ReturnType<typeof vi.fn>
  isFocused: ReturnType<typeof vi.fn>
  isVisible: ReturnType<typeof vi.fn>
  isMinimized: ReturnType<typeof vi.fn>
  isMaximized: ReturnType<typeof vi.fn>
  isFullScreen: ReturnType<typeof vi.fn>
  setTitle: ReturnType<typeof vi.fn>
  getTitle: ReturnType<typeof vi.fn>
  getBounds: ReturnType<typeof vi.fn>
  setBounds: ReturnType<typeof vi.fn>
  webContents: MockWebContents
}

export const createMockWebContents = (): MockWebContents => ({
  send: vi.fn(),
  on: vi.fn(),
  once: vi.fn(),
  removeListener: vi.fn(),
  openDevTools: vi.fn(),
  closeDevTools: vi.fn(),
  isDevToolsOpened: vi.fn().mockReturnValue(false),
  reload: vi.fn(),
  setZoomLevel: vi.fn(),
  getZoomLevel: vi.fn().mockReturnValue(0),
  session: {
    setPermissionRequestHandler: vi.fn(),
    setPermissionCheckHandler: vi.fn(),
    webRequest: {
      onHeadersReceived: vi.fn(),
    },
  },
  postMessage: vi.fn(),
})

export const createMockBrowserWindow = (
  options: MockBrowserWindowOptions = {}
): MockBrowserWindow => {
  const {
    title = 'Test Window',
    width = 1024,
    height = 768,
    isDestroyed = false,
    isFocused = true,
    isVisible = true,
    isMinimized = false,
    isMaximized = false,
    isFullScreen = false,
  } = options

  return {
    loadFile: vi.fn().mockResolvedValue(undefined),
    loadURL: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    once: vi.fn(),
    removeListener: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    close: vi.fn(),
    destroy: vi.fn(),
    focus: vi.fn(),
    blur: vi.fn(),
    minimize: vi.fn(),
    maximize: vi.fn(),
    unmaximize: vi.fn(),
    setFullScreen: vi.fn(),
    isDestroyed: vi.fn().mockReturnValue(isDestroyed),
    isFocused: vi.fn().mockReturnValue(isFocused),
    isVisible: vi.fn().mockReturnValue(isVisible),
    isMinimized: vi.fn().mockReturnValue(isMinimized),
    isMaximized: vi.fn().mockReturnValue(isMaximized),
    isFullScreen: vi.fn().mockReturnValue(isFullScreen),
    setTitle: vi.fn(),
    getTitle: vi.fn().mockReturnValue(title),
    getBounds: vi.fn().mockReturnValue({ x: 0, y: 0, width, height }),
    setBounds: vi.fn(),
    webContents: createMockWebContents(),
  }
}

// ===========================================================================
// IPC MOCK
// ===========================================================================

export interface MockIpcMain {
  handle: ReturnType<typeof vi.fn>
  handleOnce: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
  once: ReturnType<typeof vi.fn>
  removeHandler: ReturnType<typeof vi.fn>
  removeListener: ReturnType<typeof vi.fn>
  removeAllListeners: ReturnType<typeof vi.fn>
  eventNames: ReturnType<typeof vi.fn>
  listenerCount: ReturnType<typeof vi.fn>
}

export interface MockIpcRenderer {
  invoke: ReturnType<typeof vi.fn>
  send: ReturnType<typeof vi.fn>
  sendSync: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
  once: ReturnType<typeof vi.fn>
  removeListener: ReturnType<typeof vi.fn>
  removeAllListeners: ReturnType<typeof vi.fn>
  postMessage: ReturnType<typeof vi.fn>
}

export const createMockIpcMain = (): MockIpcMain => ({
  handle: vi.fn(),
  handleOnce: vi.fn(),
  on: vi.fn(),
  once: vi.fn(),
  removeHandler: vi.fn(),
  removeListener: vi.fn(),
  removeAllListeners: vi.fn(),
  eventNames: vi.fn().mockReturnValue([]),
  listenerCount: vi.fn().mockReturnValue(0),
})

export const createMockIpcRenderer = (): MockIpcRenderer => ({
  invoke: vi.fn().mockResolvedValue(null),
  send: vi.fn(),
  sendSync: vi.fn().mockReturnValue(null),
  on: vi.fn().mockReturnValue(() => {}),
  once: vi.fn().mockReturnValue(() => {}),
  removeListener: vi.fn(),
  removeAllListeners: vi.fn(),
  postMessage: vi.fn(),
})

// ===========================================================================
// APP MOCK
// ===========================================================================

export interface MockAppPaths {
  home: string
  appData: string
  userData: string
  logs: string
  temp: string
  desktop: string
  documents: string
  downloads: string
}

export interface MockApp {
  getPath: ReturnType<typeof vi.fn>
  getVersion: ReturnType<typeof vi.fn>
  getName: ReturnType<typeof vi.fn>
  setName: ReturnType<typeof vi.fn>
  whenReady: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
  once: ReturnType<typeof vi.fn>
  quit: ReturnType<typeof vi.fn>
  exit: ReturnType<typeof vi.fn>
  relaunch: ReturnType<typeof vi.fn>
  isReady: ReturnType<typeof vi.fn>
  isPackaged: boolean
  commandLine: {
    appendSwitch: ReturnType<typeof vi.fn>
    hasSwitch: ReturnType<typeof vi.fn>
    getSwitchValue: ReturnType<typeof vi.fn>
  }
  disableHardwareAcceleration: ReturnType<typeof vi.fn>
}

export const createMockApp = (
  pathOverrides: Partial<MockAppPaths> = {},
  version = '0.1.0-test'
): MockApp => {
  const defaultPaths: MockAppPaths = {
    home: '/tmp/test-home',
    appData: '/tmp/test-appdata',
    userData: '/tmp/test-userdata',
    logs: '/tmp/test-logs',
    temp: '/tmp/test-temp',
    desktop: '/tmp/test-desktop',
    documents: '/tmp/test-documents',
    downloads: '/tmp/test-downloads',
  }

  const paths = { ...defaultPaths, ...pathOverrides }

  return {
    getPath: vi.fn((name: keyof MockAppPaths) => paths[name] || `/tmp/test-${name}`),
    getVersion: vi.fn().mockReturnValue(version),
    getName: vi.fn().mockReturnValue('Claude Pilot Test'),
    setName: vi.fn(),
    whenReady: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    once: vi.fn(),
    quit: vi.fn(),
    exit: vi.fn(),
    relaunch: vi.fn(),
    isReady: vi.fn().mockReturnValue(true),
    isPackaged: false,
    commandLine: {
      appendSwitch: vi.fn(),
      hasSwitch: vi.fn().mockReturnValue(false),
      getSwitchValue: vi.fn().mockReturnValue(''),
    },
    disableHardwareAcceleration: vi.fn(),
  }
}

// ===========================================================================
// SAFE STORAGE MOCK
// ===========================================================================

export interface MockSafeStorage {
  isEncryptionAvailable: ReturnType<typeof vi.fn>
  encryptString: ReturnType<typeof vi.fn>
  decryptString: ReturnType<typeof vi.fn>
}

export const createMockSafeStorage = (encryptionAvailable = true): MockSafeStorage => ({
  isEncryptionAvailable: vi.fn().mockReturnValue(encryptionAvailable),
  encryptString: vi.fn((str: string) => Buffer.from(`encrypted:${str}`)),
  decryptString: vi.fn((buf: Buffer) => buf.toString().replace('encrypted:', '')),
})

// ===========================================================================
// DIALOG MOCK
// ===========================================================================

export interface MockDialog {
  showOpenDialog: ReturnType<typeof vi.fn>
  showSaveDialog: ReturnType<typeof vi.fn>
  showMessageBox: ReturnType<typeof vi.fn>
  showErrorBox: ReturnType<typeof vi.fn>
}

export const createMockDialog = (): MockDialog => ({
  showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: ['/tmp/test-file'] }),
  showSaveDialog: vi.fn().mockResolvedValue({ canceled: false, filePath: '/tmp/test-save' }),
  showMessageBox: vi.fn().mockResolvedValue({ response: 0, checkboxChecked: false }),
  showErrorBox: vi.fn(),
})

// ===========================================================================
// SHELL MOCK
// ===========================================================================

export interface MockShell {
  openPath: ReturnType<typeof vi.fn>
  openExternal: ReturnType<typeof vi.fn>
  trashItem: ReturnType<typeof vi.fn>
  beep: ReturnType<typeof vi.fn>
  showItemInFolder: ReturnType<typeof vi.fn>
}

export const createMockShell = (): MockShell => ({
  openPath: vi.fn().mockResolvedValue(''),
  openExternal: vi.fn().mockResolvedValue(undefined),
  trashItem: vi.fn().mockResolvedValue(undefined),
  beep: vi.fn(),
  showItemInFolder: vi.fn(),
})

// ===========================================================================
// CHILD PROCESS MOCK
// ===========================================================================

export interface MockSpawnProcess {
  stdout: {
    on: ReturnType<typeof vi.fn>
    pipe: ReturnType<typeof vi.fn>
  }
  stderr: {
    on: ReturnType<typeof vi.fn>
    pipe: ReturnType<typeof vi.fn>
  }
  stdin: {
    write: ReturnType<typeof vi.fn>
    end: ReturnType<typeof vi.fn>
  }
  on: ReturnType<typeof vi.fn>
  once: ReturnType<typeof vi.fn>
  kill: ReturnType<typeof vi.fn>
  pid: number
}

export const createMockSpawnProcess = (pid = 12345): MockSpawnProcess => ({
  stdout: { on: vi.fn(), pipe: vi.fn() },
  stderr: { on: vi.fn(), pipe: vi.fn() },
  stdin: { write: vi.fn(), end: vi.fn() },
  on: vi.fn(),
  once: vi.fn(),
  kill: vi.fn().mockReturnValue(true),
  pid,
})

// ===========================================================================
// COMPLETE ELECTRON MOCK
// ===========================================================================

export interface MockElectronModules {
  app: MockApp
  BrowserWindow: ReturnType<typeof vi.fn>
  ipcMain: MockIpcMain
  ipcRenderer: MockIpcRenderer
  safeStorage: MockSafeStorage
  dialog: MockDialog
  shell: MockShell
  nativeTheme: {
    themeSource: string
    shouldUseDarkColors: boolean
    on: ReturnType<typeof vi.fn>
  }
  session: {
    defaultSession: {
      setPermissionRequestHandler: ReturnType<typeof vi.fn>
      setPermissionCheckHandler: ReturnType<typeof vi.fn>
      webRequest: {
        onHeadersReceived: ReturnType<typeof vi.fn>
      }
    }
  }
}

export const createMockElectron = (
  options: { encryptionAvailable?: boolean; appPaths?: Partial<MockAppPaths> } = {}
): MockElectronModules => {
  const mockWindow = createMockBrowserWindow()

  return {
    app: createMockApp(options.appPaths),
    BrowserWindow: vi.fn().mockImplementation(() => mockWindow),
    ipcMain: createMockIpcMain(),
    ipcRenderer: createMockIpcRenderer(),
    safeStorage: createMockSafeStorage(options.encryptionAvailable ?? true),
    dialog: createMockDialog(),
    shell: createMockShell(),
    nativeTheme: {
      themeSource: 'system',
      shouldUseDarkColors: true,
      on: vi.fn(),
    },
    session: {
      defaultSession: {
        setPermissionRequestHandler: vi.fn(),
        setPermissionCheckHandler: vi.fn(),
        webRequest: {
          onHeadersReceived: vi.fn(),
        },
      },
    },
  }
}
