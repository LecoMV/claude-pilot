import { contextBridge, ipcRenderer } from 'electron'
import type { ElectronAPI, IPCChannels } from '../shared/types'

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
const electronAPI: ElectronAPI = {
  invoke: <K extends keyof IPCChannels>(
    channel: K,
    ...args: Parameters<IPCChannels[K]>
  ) => {
    return ipcRenderer.invoke(channel, ...args) as ReturnType<IPCChannels[K]>
  },

  on: (channel: string, callback: (...args: unknown[]) => void) => {
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
    ipcRenderer.send(channel, ...args)
  },
}

// Use contextBridge to expose the API
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
  } catch (error) {
    console.error('Failed to expose electron API:', error)
  }
} else {
  // @ts-ignore: fallback for non-isolated contexts
  window.electron = electronAPI
}
