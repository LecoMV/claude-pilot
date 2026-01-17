import { spawn, IPty } from 'node-pty'
import { BrowserWindow, ipcMain } from 'electron'
import { platform, homedir } from 'os'

interface TerminalSession {
  id: string
  pty: IPty
  cwd: string
}

class TerminalManager {
  private sessions: Map<string, TerminalSession> = new Map()
  private mainWindow: BrowserWindow | null = null

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window
  }

  create(cwd?: string): string {
    const id = `term-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const shell = platform() === 'win32' ? 'powershell.exe' : process.env.SHELL || '/bin/bash'
    const workingDir = cwd || homedir()

    const pty = spawn(shell, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: workingDir,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
      } as Record<string, string>,
    })

    const session: TerminalSession = { id, pty, cwd: workingDir }
    this.sessions.set(id, session)

    // Forward PTY output to renderer
    pty.onData((data) => {
      this.mainWindow?.webContents.send(`terminal:data:${id}`, data)
    })

    // Handle PTY exit
    pty.onExit(({ exitCode, signal }) => {
      this.mainWindow?.webContents.send(`terminal:exit:${id}`, { exitCode, signal })
      this.sessions.delete(id)
    })

    return id
  }

  write(id: string, data: string): void {
    const session = this.sessions.get(id)
    if (session) {
      session.pty.write(data)
    }
  }

  resize(id: string, cols: number, rows: number): void {
    const session = this.sessions.get(id)
    if (session) {
      session.pty.resize(cols, rows)
    }
  }

  close(id: string): void {
    const session = this.sessions.get(id)
    if (session) {
      session.pty.kill()
      this.sessions.delete(id)
    }
  }

  closeAll(): void {
    for (const [id] of this.sessions) {
      this.close(id)
    }
  }

  getSession(id: string): TerminalSession | undefined {
    return this.sessions.get(id)
  }

  listSessions(): string[] {
    return Array.from(this.sessions.keys())
  }
}

export const terminalManager = new TerminalManager()

export function registerTerminalHandlers(): void {
  ipcMain.handle('terminal:create', (_event, cwd?: string): string => {
    return terminalManager.create(cwd)
  })

  ipcMain.on('terminal:write', (_event, id: string, data: string): void => {
    terminalManager.write(id, data)
  })

  ipcMain.on('terminal:resize', (_event, id: string, cols: number, rows: number): void => {
    terminalManager.resize(id, cols, rows)
  })

  ipcMain.on('terminal:close', (_event, id: string): void => {
    terminalManager.close(id)
  })

  ipcMain.handle('terminal:list', (): string[] => {
    return terminalManager.listSessions()
  })
}
