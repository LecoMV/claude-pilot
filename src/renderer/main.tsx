import React from 'react'
import ReactDOM from 'react-dom/client'
import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import * as Sentry from '@sentry/electron/renderer'
import { TRPCProvider } from './lib/trpc/react'
import App from './App'
import './styles/globals.css'

// Import Monaco workers for language features (prevents CDN loading)
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'

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

// Initialize Sentry for renderer process error tracking
// DSN is configured via VITE_SENTRY_DSN environment variable
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.DEV ? 'development' : 'production',

    // Performance monitoring for Apdex
    tracesSampleRate: import.meta.env.DEV ? 1.0 : 0.1,

    // Don't send PII
    sendDefaultPii: false,

    // Filter out non-essential errors
    beforeSend(event) {
      // Don't report network errors from optional features
      if (event.exception?.values?.[0]?.value?.includes('fetch')) {
        return null
      }
      return event
    },
  })
}

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Root element not found')

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <TRPCProvider>
      <App />
    </TRPCProvider>
  </React.StrictMode>
)
