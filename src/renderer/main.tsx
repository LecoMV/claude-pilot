import React from 'react'
import ReactDOM from 'react-dom/client'
import { loader } from '@monaco-editor/react'
import * as Sentry from '@sentry/electron/renderer'
import { TRPCProvider } from './lib/trpc/react'
import App from './App'
import './styles/globals.css'

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
    <TRPCProvider>
      <App />
    </TRPCProvider>
  </React.StrictMode>
)
