import { vi, beforeEach, afterEach } from 'vitest'

// Mock Electron modules
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name: string) => {
      const paths: Record<string, string> = {
        home: '/tmp/test-home',
        appData: '/tmp/test-appdata',
        userData: '/tmp/test-userdata',
        logs: '/tmp/test-logs',
      }
      return paths[name] || `/tmp/test-${name}`
    }),
    getVersion: vi.fn().mockReturnValue('0.1.0-test'),
    whenReady: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    quit: vi.fn(),
    isPackaged: false,
  },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
    removeHandler: vi.fn(),
    removeAllListeners: vi.fn(),
  },
  BrowserWindow: vi.fn().mockImplementation(() => ({
    loadFile: vi.fn().mockResolvedValue(undefined),
    loadURL: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    once: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    close: vi.fn(),
    destroy: vi.fn(),
    isDestroyed: vi.fn().mockReturnValue(false),
    webContents: {
      send: vi.fn(),
      on: vi.fn(),
      once: vi.fn(),
      openDevTools: vi.fn(),
      session: {
        setPermissionRequestHandler: vi.fn(),
      },
    },
  })),
  shell: {
    openPath: vi.fn().mockResolvedValue(''),
    openExternal: vi.fn().mockResolvedValue(undefined),
  },
  dialog: {
    showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: ['/tmp/test'] }),
    showSaveDialog: vi.fn().mockResolvedValue({ canceled: false, filePath: '/tmp/test' }),
    showMessageBox: vi.fn().mockResolvedValue({ response: 0 }),
  },
  safeStorage: {
    isEncryptionAvailable: vi.fn().mockReturnValue(true),
    encryptString: vi.fn((str: string) => Buffer.from(`encrypted:${str}`)),
    decryptString: vi.fn((buf: Buffer) => buf.toString().replace('encrypted:', '')),
  },
  nativeTheme: {
    themeSource: 'system',
    shouldUseDarkColors: true,
    on: vi.fn(),
  },
}))

// Mock Node.js modules commonly used in main process
vi.mock('child_process', () => ({
  execSync: vi.fn().mockReturnValue(Buffer.from('')),
  exec: vi.fn((_cmd, _opts, callback) => {
    if (callback) callback(null, '', '')
    return { kill: vi.fn(), on: vi.fn() }
  }),
  spawn: vi.fn().mockReturnValue({
    stdout: { on: vi.fn(), pipe: vi.fn() },
    stderr: { on: vi.fn(), pipe: vi.fn() },
    stdin: { write: vi.fn(), end: vi.fn() },
    on: vi.fn(),
    kill: vi.fn(),
    pid: 12345,
  }),
}))

// Mock fs/promises for async file operations
vi.mock('fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue('{}'),
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  readdir: vi.fn().mockResolvedValue([]),
  stat: vi.fn().mockResolvedValue({ isFile: () => true, isDirectory: () => false, size: 1024 }),
  unlink: vi.fn().mockResolvedValue(undefined),
  access: vi.fn().mockResolvedValue(undefined),
}))

// Mock fs for sync operations
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(true),
    readFileSync: vi.fn().mockReturnValue('{}'),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    watch: vi.fn().mockReturnValue({ close: vi.fn(), on: vi.fn() }),
    readdirSync: vi.fn().mockReturnValue([]),
    statSync: vi.fn().mockReturnValue({ isFile: () => true, isDirectory: () => false, size: 1024 }),
    createReadStream: vi.fn().mockReturnValue({
      pipe: vi.fn().mockReturnThis(),
      on: vi.fn().mockReturnThis(),
    }),
    createWriteStream: vi.fn().mockReturnValue({
      write: vi.fn(),
      end: vi.fn(),
      on: vi.fn().mockReturnThis(),
    }),
  }
})

// Reset mocks between tests
beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// Export mock factories for test customization
export const createMockPool = () => ({
  query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  connect: vi.fn().mockResolvedValue({
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    release: vi.fn(),
  }),
  end: vi.fn().mockResolvedValue(undefined),
  on: vi.fn(),
  totalCount: 5,
  idleCount: 3,
  waitingCount: 0,
})

export const createMockDriver = () => ({
  session: vi.fn().mockReturnValue({
    run: vi.fn().mockResolvedValue({ records: [] }),
    close: vi.fn().mockResolvedValue(undefined),
  }),
  close: vi.fn().mockResolvedValue(undefined),
})
