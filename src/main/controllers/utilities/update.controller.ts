/**
 * Update Controller
 *
 * Type-safe tRPC controller for auto-update management.
 * Handles update downloading and installation.
 *
 * Migrated from handlers.ts (2 handlers):
 * - update:download
 * - update:install
 *
 * Note: update:check and update:getStatus are typically handled
 * separately as they involve event listeners.
 *
 * @module update.controller
 */

import { router, auditedProcedure } from '../../trpc/trpc'
// electron-updater is CommonJS - use default import for ESM compatibility
// See: https://electron-vite.org/guide/troubleshooting
import electronUpdater from 'electron-updater'
const { autoUpdater } = electronUpdater
import { BrowserWindow } from 'electron'

// ============================================================================
// Update State
// ============================================================================

interface UpdateState {
  checking: boolean
  downloading: boolean
  downloadProgress: number
  updateAvailable: boolean
  updateDownloaded: boolean
  latestVersion?: string
  error?: string
}

const updateState: UpdateState = {
  checking: false,
  downloading: false,
  downloadProgress: 0,
  updateAvailable: false,
  updateDownloaded: false,
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Download the available update
 */
async function downloadUpdate(): Promise<boolean> {
  try {
    updateState.downloading = true
    updateState.downloadProgress = 0
    updateState.error = undefined

    // Set up progress listener
    autoUpdater.on('download-progress', (progress) => {
      updateState.downloadProgress = progress.percent
      // Notify renderer of progress
      BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send('update:progress', {
          percent: progress.percent,
          bytesPerSecond: progress.bytesPerSecond,
          transferred: progress.transferred,
          total: progress.total,
        })
      })
    })

    await autoUpdater.downloadUpdate()
    updateState.updateDownloaded = true
    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Download failed'
    updateState.error = message
    console.error('[AutoUpdate] Download failed:', message)
    return false
  } finally {
    updateState.downloading = false
  }
}

/**
 * Install the downloaded update
 */
function installUpdate(): void {
  // Quit and install the update
  autoUpdater.quitAndInstall(false, true)
}

// ============================================================================
// Router
// ============================================================================

export const updateRouter = router({
  /**
   * Download the available update
   */
  download: auditedProcedure.mutation((): Promise<boolean> => {
    return downloadUpdate()
  }),

  /**
   * Install the downloaded update (quits the app)
   */
  install: auditedProcedure.mutation((): void => {
    installUpdate()
  }),
})

// Export state for use in other handlers
export { updateState }
