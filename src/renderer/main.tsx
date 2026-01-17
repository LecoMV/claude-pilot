import React from 'react'
import ReactDOM from 'react-dom/client'
import { loader } from '@monaco-editor/react'
import * as Sentry from '@sentry/electron/renderer'
import App from './App'
import './styles/globals.css'

// Initialize Sentry for renderer process error tracking (deploy-b4go)
// DSN is configured in main process and shared via environment
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.DEV ? 'development' : 'production',
    // Only send errors, not performance data
    tracesSampleRate: 0,
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

// Configure Monaco loader for Electron environment
loader.config({
  paths: {
    vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs',
  },
})

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Root element not found')

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
