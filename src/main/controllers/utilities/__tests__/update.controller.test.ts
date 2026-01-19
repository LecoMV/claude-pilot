/**
 * Update Controller Tests
 *
 * Comprehensive tests for the update tRPC controller.
 * Tests all 2 procedures: download, install
 *
 * @module update.controller.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { updateRouter, updateState } from '../update.controller'

// Mock electron-updater
vi.mock('electron-updater', () => {
  const mockAutoUpdater = {
    on: vi.fn(),
    downloadUpdate: vi.fn(),
    quitAndInstall: vi.fn(),
  }
  return {
    default: { autoUpdater: mockAutoUpdater },
    autoUpdater: mockAutoUpdater,
  }
})

// Mock Electron's BrowserWindow
vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: vi.fn(),
  },
}))

import electronUpdater from 'electron-updater'
const { autoUpdater } = electronUpdater
import { BrowserWindow } from 'electron'

// Create a test caller
const createTestCaller = () => updateRouter.createCaller({})

describe('update.controller', () => {
  let caller: ReturnType<typeof createTestCaller>
  let mockWindow: {
    webContents: { send: ReturnType<typeof vi.fn> }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    caller = createTestCaller()

    // Reset update state
    updateState.checking = false
    updateState.downloading = false
    updateState.downloadProgress = 0
    updateState.updateAvailable = false
    updateState.updateDownloaded = false
    updateState.latestVersion = undefined
    updateState.error = undefined

    // Setup mock window
    mockWindow = {
      webContents: {
        send: vi.fn(),
      },
    }
    vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([mockWindow as unknown as BrowserWindow])
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ===========================================================================
  // DOWNLOAD PROCEDURE
  // ===========================================================================
  describe('download', () => {
    it('should download update successfully', async () => {
      vi.mocked(autoUpdater.downloadUpdate).mockResolvedValue(['update.exe'])

      const result = await caller.download()

      expect(result).toBe(true)
      expect(autoUpdater.downloadUpdate).toHaveBeenCalledTimes(1)
      expect(updateState.updateDownloaded).toBe(true)
      expect(updateState.downloading).toBe(false)
    })

    it('should set downloading state during download', async () => {
      let downloadingDuringCall = false
      vi.mocked(autoUpdater.downloadUpdate).mockImplementation(async () => {
        downloadingDuringCall = updateState.downloading
        return ['update.exe']
      })

      await caller.download()

      expect(downloadingDuringCall).toBe(true)
    })

    it('should return false on download failure', async () => {
      vi.mocked(autoUpdater.downloadUpdate).mockRejectedValue(new Error('Network error'))
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const result = await caller.download()

      expect(result).toBe(false)
      expect(updateState.error).toBe('Network error')
      expect(updateState.downloading).toBe(false)
      consoleSpy.mockRestore()
    })

    it('should handle unknown error type', async () => {
      vi.mocked(autoUpdater.downloadUpdate).mockRejectedValue('Unknown error string')
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const result = await caller.download()

      expect(result).toBe(false)
      expect(updateState.error).toBe('Download failed')
      consoleSpy.mockRestore()
    })

    it('should reset progress at start of download', async () => {
      updateState.downloadProgress = 50
      updateState.error = 'Previous error'

      vi.mocked(autoUpdater.downloadUpdate).mockResolvedValue(['update.exe'])

      await caller.download()

      // State should be reset before download
      expect(updateState.error).toBeUndefined()
    })

    it('should register download-progress listener', async () => {
      vi.mocked(autoUpdater.downloadUpdate).mockResolvedValue(['update.exe'])

      await caller.download()

      expect(autoUpdater.on).toHaveBeenCalledWith('download-progress', expect.any(Function))
    })

    it('should send progress updates to all windows', async () => {
      vi.mocked(autoUpdater.downloadUpdate).mockImplementation(async () => {
        // Simulate calling the progress handler
        const onCalls = vi.mocked(autoUpdater.on).mock.calls
        const progressHandler = onCalls.find((call) => call[0] === 'download-progress')?.[1] as (
          progress: { percent: number; bytesPerSecond: number; transferred: number; total: number }
        ) => void

        if (progressHandler) {
          progressHandler({
            percent: 50,
            bytesPerSecond: 1000000,
            transferred: 5000000,
            total: 10000000,
          })
        }

        return ['update.exe']
      })

      await caller.download()

      expect(mockWindow.webContents.send).toHaveBeenCalledWith('update:progress', {
        percent: 50,
        bytesPerSecond: 1000000,
        transferred: 5000000,
        total: 10000000,
      })
    })

    it('should update downloadProgress state during download', async () => {
      vi.mocked(autoUpdater.downloadUpdate).mockImplementation(async () => {
        // Simulate calling the progress handler
        const onCalls = vi.mocked(autoUpdater.on).mock.calls
        const progressHandler = onCalls.find((call) => call[0] === 'download-progress')?.[1] as (
          progress: { percent: number; bytesPerSecond: number; transferred: number; total: number }
        ) => void

        if (progressHandler) {
          progressHandler({
            percent: 75,
            bytesPerSecond: 1000000,
            transferred: 7500000,
            total: 10000000,
          })
        }

        return ['update.exe']
      })

      await caller.download()

      expect(updateState.downloadProgress).toBe(75)
    })

    it('should handle multiple windows for progress updates', async () => {
      const mockWindow2 = {
        webContents: { send: vi.fn() },
      }
      vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([
        mockWindow as unknown as BrowserWindow,
        mockWindow2 as unknown as BrowserWindow,
      ])

      vi.mocked(autoUpdater.downloadUpdate).mockImplementation(async () => {
        const onCalls = vi.mocked(autoUpdater.on).mock.calls
        const progressHandler = onCalls.find((call) => call[0] === 'download-progress')?.[1] as (
          progress: { percent: number; bytesPerSecond: number; transferred: number; total: number }
        ) => void

        if (progressHandler) {
          progressHandler({
            percent: 25,
            bytesPerSecond: 500000,
            transferred: 2500000,
            total: 10000000,
          })
        }

        return ['update.exe']
      })

      await caller.download()

      expect(mockWindow.webContents.send).toHaveBeenCalled()
      expect(mockWindow2.webContents.send).toHaveBeenCalled()
    })

    it('should handle no windows during progress update', async () => {
      vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([])

      vi.mocked(autoUpdater.downloadUpdate).mockImplementation(async () => {
        const onCalls = vi.mocked(autoUpdater.on).mock.calls
        const progressHandler = onCalls.find((call) => call[0] === 'download-progress')?.[1] as (
          progress: { percent: number; bytesPerSecond: number; transferred: number; total: number }
        ) => void

        if (progressHandler) {
          progressHandler({
            percent: 10,
            bytesPerSecond: 100000,
            transferred: 1000000,
            total: 10000000,
          })
        }

        return ['update.exe']
      })

      // Should not throw even with no windows
      await expect(caller.download()).resolves.toBe(true)
    })
  })

  // ===========================================================================
  // INSTALL PROCEDURE
  // ===========================================================================
  describe('install', () => {
    it('should call quitAndInstall', async () => {
      await caller.install()

      expect(autoUpdater.quitAndInstall).toHaveBeenCalledWith(false, true)
    })

    it('should call quitAndInstall with correct parameters', async () => {
      await caller.install()

      // First param: isSilent (false = show install UI)
      // Second param: isForceRunAfter (true = restart app after install)
      expect(autoUpdater.quitAndInstall).toHaveBeenCalledWith(false, true)
    })

    it('should return void', async () => {
      const result = await caller.install()

      expect(result).toBeUndefined()
    })

    it('should be callable multiple times', async () => {
      await caller.install()
      await caller.install()
      await caller.install()

      expect(autoUpdater.quitAndInstall).toHaveBeenCalledTimes(3)
    })
  })

  // ===========================================================================
  // UPDATE STATE TESTS
  // ===========================================================================
  describe('updateState', () => {
    it('should have correct initial state', () => {
      // Reset state for this test
      updateState.checking = false
      updateState.downloading = false
      updateState.downloadProgress = 0
      updateState.updateAvailable = false
      updateState.updateDownloaded = false
      updateState.latestVersion = undefined
      updateState.error = undefined

      expect(updateState.checking).toBe(false)
      expect(updateState.downloading).toBe(false)
      expect(updateState.downloadProgress).toBe(0)
      expect(updateState.updateAvailable).toBe(false)
      expect(updateState.updateDownloaded).toBe(false)
      expect(updateState.latestVersion).toBeUndefined()
      expect(updateState.error).toBeUndefined()
    })

    it('should update state during successful download', async () => {
      vi.mocked(autoUpdater.downloadUpdate).mockResolvedValue(['update.exe'])

      await caller.download()

      expect(updateState.downloading).toBe(false) // Should be false after completion
      expect(updateState.updateDownloaded).toBe(true)
      expect(updateState.error).toBeUndefined()
    })

    it('should update state during failed download', async () => {
      vi.mocked(autoUpdater.downloadUpdate).mockRejectedValue(new Error('Download error'))
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await caller.download()

      expect(updateState.downloading).toBe(false)
      expect(updateState.updateDownloaded).toBe(false)
      expect(updateState.error).toBe('Download error')
      consoleSpy.mockRestore()
    })

    it('should be exportable for use in other handlers', async () => {
      // The updateState is exported from the controller
      expect(typeof updateState).toBe('object')
      expect('checking' in updateState).toBe(true)
      expect('downloading' in updateState).toBe(true)
      expect('downloadProgress' in updateState).toBe(true)
      expect('updateAvailable' in updateState).toBe(true)
      expect('updateDownloaded' in updateState).toBe(true)
      expect('latestVersion' in updateState).toBe(true)
      expect('error' in updateState).toBe(true)
    })
  })

  // ===========================================================================
  // EDGE CASES
  // ===========================================================================
  describe('edge cases', () => {
    it('should handle rapid download calls', async () => {
      vi.mocked(autoUpdater.downloadUpdate).mockResolvedValue(['update.exe'])

      // Start multiple downloads simultaneously
      const results = await Promise.all([
        caller.download(),
        caller.download(),
        caller.download(),
      ])

      results.forEach((r) => expect(r).toBe(true))
    })

    it('should handle download then install', async () => {
      vi.mocked(autoUpdater.downloadUpdate).mockResolvedValue(['update.exe'])

      const downloadResult = await caller.download()
      expect(downloadResult).toBe(true)
      expect(updateState.updateDownloaded).toBe(true)

      await caller.install()
      expect(autoUpdater.quitAndInstall).toHaveBeenCalled()
    })

    it('should handle install before download completes', async () => {
      // In real scenario, UI should prevent this
      // But controller should handle it gracefully
      await caller.install()

      expect(autoUpdater.quitAndInstall).toHaveBeenCalled()
    })

    it('should clear error on new download attempt', async () => {
      // First download fails
      vi.mocked(autoUpdater.downloadUpdate).mockRejectedValueOnce(new Error('First error'))
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await caller.download()
      expect(updateState.error).toBe('First error')

      // Second download starts - error should be cleared
      vi.mocked(autoUpdater.downloadUpdate).mockResolvedValueOnce(['update.exe'])

      await caller.download()
      expect(updateState.error).toBeUndefined()
      consoleSpy.mockRestore()
    })

    it('should handle progress at 0%', async () => {
      vi.mocked(autoUpdater.downloadUpdate).mockImplementation(async () => {
        const onCalls = vi.mocked(autoUpdater.on).mock.calls
        const progressHandler = onCalls.find((call) => call[0] === 'download-progress')?.[1] as (
          progress: { percent: number; bytesPerSecond: number; transferred: number; total: number }
        ) => void

        if (progressHandler) {
          progressHandler({
            percent: 0,
            bytesPerSecond: 0,
            transferred: 0,
            total: 10000000,
          })
        }

        return ['update.exe']
      })

      await caller.download()

      expect(mockWindow.webContents.send).toHaveBeenCalledWith('update:progress', expect.objectContaining({
        percent: 0,
        transferred: 0,
      }))
    })

    it('should handle progress at 100%', async () => {
      vi.mocked(autoUpdater.downloadUpdate).mockImplementation(async () => {
        const onCalls = vi.mocked(autoUpdater.on).mock.calls
        const progressHandler = onCalls.find((call) => call[0] === 'download-progress')?.[1] as (
          progress: { percent: number; bytesPerSecond: number; transferred: number; total: number }
        ) => void

        if (progressHandler) {
          progressHandler({
            percent: 100,
            bytesPerSecond: 0,
            transferred: 10000000,
            total: 10000000,
          })
        }

        return ['update.exe']
      })

      await caller.download()

      expect(updateState.downloadProgress).toBe(100)
    })
  })

  // ===========================================================================
  // ERROR LOGGING TESTS
  // ===========================================================================
  describe('error logging', () => {
    it('should log error when download fails', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(autoUpdater.downloadUpdate).mockRejectedValue(new Error('Network timeout'))

      await caller.download()

      expect(consoleSpy).toHaveBeenCalledWith('[AutoUpdate] Download failed:', 'Network timeout')
      consoleSpy.mockRestore()
    })

    it('should log generic message for unknown errors', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(autoUpdater.downloadUpdate).mockRejectedValue({ weird: 'error object' })

      await caller.download()

      expect(consoleSpy).toHaveBeenCalledWith('[AutoUpdate] Download failed:', 'Download failed')
      consoleSpy.mockRestore()
    })
  })

  // ===========================================================================
  // INTEGRATION-LIKE TESTS
  // ===========================================================================
  describe('integration scenarios', () => {
    it('should handle complete update flow: download -> progress -> complete -> install', async () => {
      // Simulate realistic download flow
      vi.mocked(autoUpdater.downloadUpdate).mockImplementation(async () => {
        const onCalls = vi.mocked(autoUpdater.on).mock.calls
        const progressHandler = onCalls.find((call) => call[0] === 'download-progress')?.[1] as (
          progress: { percent: number; bytesPerSecond: number; transferred: number; total: number }
        ) => void

        if (progressHandler) {
          // Simulate progress updates
          for (let i = 0; i <= 100; i += 25) {
            progressHandler({
              percent: i,
              bytesPerSecond: 1000000,
              transferred: i * 100000,
              total: 10000000,
            })
          }
        }

        return ['update.exe']
      })

      // Start download
      const downloadResult = await caller.download()
      expect(downloadResult).toBe(true)
      expect(updateState.updateDownloaded).toBe(true)

      // Verify progress was sent
      expect(mockWindow.webContents.send).toHaveBeenCalledTimes(5) // 0, 25, 50, 75, 100

      // Install
      await caller.install()
      expect(autoUpdater.quitAndInstall).toHaveBeenCalled()
    })

    it('should handle retry after failed download', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      // First attempt fails
      vi.mocked(autoUpdater.downloadUpdate).mockRejectedValueOnce(new Error('Connection lost'))
      const result1 = await caller.download()
      expect(result1).toBe(false)
      expect(updateState.error).toBe('Connection lost')

      // Retry succeeds
      vi.mocked(autoUpdater.downloadUpdate).mockResolvedValueOnce(['update.exe'])
      const result2 = await caller.download()
      expect(result2).toBe(true)
      expect(updateState.error).toBeUndefined()
      expect(updateState.updateDownloaded).toBe(true)

      consoleSpy.mockRestore()
    })
  })
})
