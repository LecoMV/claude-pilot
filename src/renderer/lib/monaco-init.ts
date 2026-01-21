/**
 * Monaco Editor Lazy Initialization
 *
 * This module configures Monaco editor with local workers to avoid CDN loading.
 * It's designed to be lazy-loaded only when the code editor is needed.
 *
 * Why lazy loading Monaco:
 * - Monaco is ~4MB and not needed for most app functionality
 * - Users may never use the code editor in a session
 * - Loading Monaco at startup significantly impacts cold start time
 *
 * @module lib/monaco-init
 */

import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'

// Import Monaco workers for language features (prevents CDN loading)
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'

let initialized = false

/**
 * Initialize Monaco editor with local workers.
 * Call this before rendering any Monaco editor instance.
 * Safe to call multiple times - will only initialize once.
 */
export function initializeMonaco(): void {
  if (initialized) return

  // Configure Monaco environment for local workers (fixes CSP issues with CDN)
  self.MonacoEnvironment = {
    getWorker(_, label) {
      if (label === 'json') {
        return new jsonWorker()
      }
      if (label === 'typescript' || label === 'javascript') {
        return new tsWorker()
      }
      return new editorWorker()
    },
  }

  // Configure Monaco to use local bundle instead of CDN (fixes CSP blocking)
  loader.config({ monaco })

  initialized = true
  console.info('[Monaco] Initialized with local workers')
}

/**
 * Check if Monaco has been initialized
 */
export function isMonacoInitialized(): boolean {
  return initialized
}
