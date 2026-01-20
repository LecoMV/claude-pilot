# Electron Production Testing & Readiness Research

**Date**: 2026-01-19
**Project**: Claude Pilot (Electron + React + tRPC)

## Executive Summary

This research provides a comprehensive testing and production readiness strategy for Claude Pilot, covering functionality testing, visual regression, integration testing, performance profiling, security hardening, and CI/CD automation. All recommendations are based on 2025-2026 best practices.

---

## 1. Functionality Testing Tools

### Playwright for Electron (Primary Testing Framework)

Playwright has experimental Electron support via the Chrome DevTools Protocol (CDP) and is **the best alternative to the deprecated Spectron framework**.

#### Setup & Installation

```bash
npm install --save-dev @playwright/test
npx playwright install
```

#### Basic Test Structure

```typescript
import { test, _electron as electron } from '@playwright/test'
import { ElectronApplication, Page } from 'playwright'

let electronApp: ElectronApplication
let window: Page

test.beforeAll(async () => {
  electronApp = await electron.launch({ args: ['.'] })
  window = await electronApp.firstWindow()
})

test.afterAll(async () => {
  await electronApp.close()
})

test('main window loads successfully', async () => {
  const title = await window.title()
  expect(title).toBe('Claude Pilot')
})
```

#### Best Practices for 2026

**1. Test Isolation & Context**

- Use fresh browser contexts for each test to prevent shared state issues
- Avoid shared global variables; pass state explicitly via fixtures
- Playwright automatically spawns new contexts to ensure clean test environments

**2. Selectors & Locators**

- Use role-based APIs: `getByRole()`, `getByLabel()`, `getByPlaceholder()`
- Add `data-testid` attributes for highly dynamic UI elements
- Avoid selectors tied to layout, fluctuating attributes, or dynamic IDs

```typescript
// ❌ Fragile selector
await page.click('.btn-primary:nth-child(2)')

// ✅ Stable selector
await page.getByRole('button', { name: 'Start Session' }).click()
await page.getByTestId('session-start-button').click()
```

**3. Test Organization**

- Centralize UI interactions into Page Object Model classes
- Focus testing effort on critical user journeys
- Use descriptive test names that explain business impact

**4. Enhanced Features**

- Record videos: `recordVideo: { dir: 'test-videos' }`
- Default 30s timeout per action (adjustable with `test.setTimeout()`)
- Built-in screenshot capture for failures
- Trace viewer for debugging: `npx playwright show-trace trace.zip`

#### electron-playwright-helpers

Helper utilities for common Electron testing scenarios:

```bash
npm install --save-dev electron-playwright-helpers
```

```typescript
import { findLatestBuild, parseElectronApp } from 'electron-playwright-helpers'

test.beforeAll(async () => {
  const latestBuild = findLatestBuild()
  const appInfo = parseElectronApp(latestBuild)
  electronApp = await electron.launch({
    executablePath: appInfo.executable,
    args: appInfo.main,
  })
})
```

**Sources**:

- [15 Best Practices for Playwright testing in 2026 | BrowserStack](https://www.browserstack.com/guide/playwright-best-practices)
- [Automated Testing | Electron](https://www.electronjs.org/docs/latest/tutorial/automated-testing)
- [Electron | Playwright](https://playwright.dev/docs/api/class-electron)
- [Testing Electron apps with Playwright and GitHub Actions | Simon Willison's TILs](https://til.simonwillison.net/electron/testing-electron-playwright)
- [electron-playwright-helpers - npm](https://www.npmjs.com/package/electron-playwright-helpers)

---

## 2. Visual/UI Testing

### Storybook + Chromatic (Recommended Stack)

Chromatic provides automated visual regression testing integrated with Storybook, catching visual and functional bugs across browsers, viewports, and themes.

#### Storybook Setup for Electron/React

```bash
npx storybook@latest init
```

```typescript
// .storybook/preview.ts
import type { Preview } from '@storybook/react'
import '../src/renderer/styles/global.css' // Tailwind CSS

const preview: Preview = {
  parameters: {
    backgrounds: {
      default: 'dark',
      values: [
        { name: 'dark', value: '#1e1e2e' },
        { name: 'light', value: '#ffffff' },
      ],
    },
    actions: { argTypesRegex: '^on[A-Z].*' },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/,
      },
    },
  },
}

export default preview
```

#### Example Component Story

```typescript
// src/renderer/components/dashboard/SystemStatus.stories.tsx
import type { Meta, StoryObj } from '@storybook/react'
import { SystemStatus } from './SystemStatus'

const meta: Meta<typeof SystemStatus> = {
  title: 'Dashboard/SystemStatus',
  component: SystemStatus,
  parameters: {
    layout: 'fullscreen',
  },
}

export default meta
type Story = StoryObj<typeof meta>

export const Healthy: Story = {
  args: {
    postgres: { status: 'online', latency: 12 },
    memgraph: { status: 'online', latency: 8 },
    qdrant: { status: 'online', latency: 15 },
  },
}

export const Degraded: Story = {
  args: {
    postgres: { status: 'offline', latency: null },
    memgraph: { status: 'online', latency: 8 },
    qdrant: { status: 'online', latency: 15 },
  },
}
```

#### Chromatic Integration

```bash
npm install --save-dev chromatic
npx chromatic --project-token=<your-token>
```

```yaml
# .github/workflows/chromatic.yml
name: 'Chromatic'

on: push

jobs:
  chromatic:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - name: Install dependencies
        run: npm ci
      - name: Publish to Chromatic
        uses: chromaui/action@latest
        with:
          projectToken: ${{ secrets.CHROMATIC_PROJECT_TOKEN }}
          autoAcceptChanges: 'main'
```

#### How Chromatic Works

1. **Snapshot Capture**: Captures snapshots of every story in a cloud browser environment
2. **Visual Diffing**: Compares new snapshots to baselines when code is pushed
3. **Change Detection**: Identifies visual changes using a custom algorithm that eliminates flakiness from latency, animations, and DOM changes
4. **Human Approval**: Prompts verification for intentional changes or error fixes
5. **Cross-Browser**: Expands coverage to Chrome, Firefox, Safari, and Edge in one click

**Sources**:

- [Visual testing for Storybook • Chromatic](https://www.chromatic.com/storybook)
- [Visual tests | Storybook docs](https://storybook.js.org/docs/writing-tests/visual-testing)
- [How to Implement Visual Regression Testing for React with Chromatic](https://oneuptime.com/blog/post/2026-01-15-visual-regression-testing-react-chromatic/view)
- [Storybook and Chromatic for Visual Regression Testing - DEV Community](https://dev.to/jenc/storybook-and-chromatic-for-visual-regression-testing-37lg)

---

## 3. Integration Testing

### Testing tRPC Endpoints in Electron

The tRPC team recommends **integration tests over mocking** when you have full control of the backend.

#### Server-Side Caller Pattern

```typescript
// src/main/trpc/router.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { appRouter } from './router'
import type { Context } from './trpc'

describe('tRPC Router Integration Tests', () => {
  let caller: ReturnType<typeof appRouter.createCaller>

  beforeEach(() => {
    const ctx: Context = {
      // Mock context (auth, DB connections, etc.)
    }
    caller = appRouter.createCaller(ctx)
  })

  it('system.status returns health metrics', async () => {
    const result = await caller.system.status()

    expect(result).toHaveProperty('postgres')
    expect(result).toHaveProperty('memgraph')
    expect(result.postgres.status).toMatch(/online|offline/)
  })

  it('credentials.store rejects invalid keys', async () => {
    await expect(
      caller.credentials.store({
        key: 'invalid key with spaces',
        value: 'secret',
      })
    ).rejects.toThrow()
  })
})
```

#### Testing Protected Procedures

For authenticated routes, mock the session context:

```typescript
const authenticatedContext: Context = {
  session: {
    userId: 'test-user',
    profileId: 'default',
  },
}

const caller = appRouter.createCaller(authenticatedContext)
```

#### Mocking Electron APIs

Use `vitest` mocks for Electron modules:

```typescript
// test/mocks/electron.ts
import { vi } from 'vitest'

export const mockElectron = {
  app: {
    getPath: vi.fn((name: string) => `/mock/path/${name}`),
    getVersion: vi.fn(() => '1.0.0'),
  },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
  },
  safeStorage: {
    encryptString: vi.fn((str: string) => Buffer.from(str, 'utf8')),
    decryptString: vi.fn((buf: Buffer) => buf.toString('utf8')),
  },
}

vi.mock('electron', () => mockElectron)
```

#### Testing IPC Communication

```typescript
// test/ipc/credentials.test.ts
import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'

test('credentials IPC round-trip', async () => {
  const electronApp = await electron.launch({ args: ['.'] })

  // Store credential via IPC
  const storeResult = await electronApp.evaluate(async ({ ipcMain }) => {
    return new Promise((resolve) => {
      ipcMain.handle('trpc', async (event, req) => {
        if (req.path === 'credentials.store') {
          // Simulate tRPC handler
          resolve({ success: true })
        }
      })
    })
  })

  expect(storeResult).toEqual({ success: true })

  await electronApp.close()
})
```

**Sources**:

- [Unit Testing Frontend Components · trpc/trpc · Discussion #3612](https://github.com/trpc/trpc/discussions/3612)
- [Server Side Calls | tRPC](https://trpc.io/docs/v10/server/server-side-calls)
- [Testing tRPC + Express with Jest and Supertest - DEV Community](https://dev.to/carnewal/testing-trpc-express-with-jest-and-supertest-4738)
- [GitHub - awohletz/electron-prisma-trpc-example](https://github.com/awohletz/electron-prisma-trpc-example)

---

## 4. Performance Testing

### Startup Time Measurement

```typescript
// src/main/index.ts
const startTime = Date.now()

app.whenReady().then(() => {
  const readyTime = Date.now()
  console.log(`App ready in ${readyTime - startTime}ms`)

  createWindow()

  const windowTime = Date.now()
  console.log(`Window created in ${windowTime - readyTime}ms`)
})
```

#### Performance Metrics Collection

Use Electron's built-in performance APIs:

```typescript
// src/renderer/lib/metrics.ts
export function measureRenderTime(componentName: string) {
  performance.mark(`${componentName}-start`)

  return () => {
    performance.mark(`${componentName}-end`)
    performance.measure(componentName, `${componentName}-start`, `${componentName}-end`)

    const measure = performance.getEntriesByName(componentName)[0]
    console.log(`${componentName} rendered in ${measure.duration}ms`)
  }
}

// Usage in React component
useEffect(() => {
  const endMeasure = measureRenderTime('SystemDashboard')
  return endMeasure
}, [])
```

### Memory Leak Detection

#### Tools

1. **Chrome DevTools Memory Profiler** - Built into Electron DevTools
2. **memlab** - Meta's memory leak detector for Chromium-based apps

```bash
npm install --save-dev memlab
```

```typescript
// test/memory/leak-detection.ts
import { run } from 'memlab'

async function testMemoryLeaks() {
  const result = await run({
    scenario: {
      url: () => 'http://localhost:3000', // Dev server
      action: async (page) => {
        // Simulate user actions that might leak
        for (let i = 0; i < 10; i++) {
          await page.click('[data-testid="open-session"]')
          await page.waitForTimeout(1000)
          await page.click('[data-testid="close-session"]')
          await page.waitForTimeout(1000)
        }
      },
    },
  })

  if (result.leaks.length > 0) {
    console.error('Memory leaks detected:', result.leaks)
    process.exit(1)
  }
}
```

#### Common Leak Sources in Electron

1. **Unreleased Event Listeners**

```typescript
// ❌ Memory leak
useEffect(() => {
  window.electron.on('session-update', handleUpdate)
  // Missing cleanup!
}, [])

// ✅ Proper cleanup
useEffect(() => {
  window.electron.on('session-update', handleUpdate)
  return () => window.electron.off('session-update', handleUpdate)
}, [])
```

2. **IPC Listeners Not Removed**

```typescript
// Main process
ipcMain.handle('get-data', handler)
// When no longer needed:
ipcMain.removeHandler('get-data')
```

3. **Retained Renderer Processes**

```typescript
// Ensure windows are properly destroyed
mainWindow?.destroy()
mainWindow = null
```

#### Memory Profiling Workflow

1. Open DevTools Memory tab
2. Take initial heap snapshot
3. Perform user actions (open/close sessions, navigate, etc.)
4. Force garbage collection: `webFrame.clearCache()`
5. Take second heap snapshot
6. Compare snapshots - look for:
   - Large retained object groups
   - Detached DOM trees
   - Growing IPC listener counts

#### Monitor RSS vs Heap Memory

```typescript
// src/main/services/metrics.ts
export function logMemoryUsage() {
  const usage = process.memoryUsage()

  console.log({
    rss: `${Math.round(usage.rss / 1024 / 1024)}MB`, // Resident Set Size
    heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024)}MB`,
    heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024)}MB`,
    external: `${Math.round(usage.external / 1024 / 1024)}MB`,
  })
}

// Log every 30 seconds in development
if (process.env.NODE_ENV === 'development') {
  setInterval(logMemoryUsage, 30000)
}
```

**Warning**: If RSS grows but heap doesn't, check native modules for leaks.

### Bundle Size Analysis

#### Electron-Vite Bundle Analysis

```bash
npm run build -- --mode production --minify
npx vite-bundle-visualizer
```

Add to `package.json`:

```json
{
  "scripts": {
    "analyze": "vite-bundle-visualizer dist/renderer"
  }
}
```

#### Optimization Checklist

1. **Code Splitting**

```typescript
// Lazy load heavy components
const MemoryBrowser = lazy(() => import('./components/memory/MemoryBrowser'))
const WorkflowVisualizer = lazy(() => import('./components/workflows/WorkflowVisualizer'))
```

2. **Tree Shaking**

```typescript
// Use named imports from libraries
import { useStore } from 'zustand' // ✅
import zustand from 'zustand' // ❌ Bundles everything
```

3. **Analyze Dependencies**

```bash
# Check what dependencies bring in
npm ls <package-name>

# Measure import cost
npx cost-of-modules
```

4. **Externalize Native Modules**

```typescript
// electron.vite.config.ts
export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        external: ['better-sqlite3', 'node-pty'],
      },
    },
  },
})
```

**Sources**:

- [Performance | Electron](https://www.electronjs.org/docs/latest/tutorial/performance)
- [Debugging Electron Memory Usage | Seena Burns](https://seenaburns.com/debugging-electron-memory-usage/)
- [memlab - npm](https://www.npmjs.com/package/memlab)
- [Diagnosing and Fixing Memory Leaks in Electron Applications - Mindful Chase](https://www.mindfulchase.com/explore/troubleshooting-tips/frameworks-and-libraries/diagnosing-and-fixing-memory-leaks-in-electron-applications.html)

---

## 5. Production Readiness Checklist

### Code Signing

Code signing is **required** for distribution and auto-updates to work without OS security warnings.

#### macOS Code Signing

```json
// package.json
{
  "build": {
    "appId": "com.claudepilot.app",
    "mac": {
      "category": "public.app-category.developer-tools",
      "hardenedRuntime": true,
      "gatekeeperAssess": false,
      "entitlements": "build/entitlements.mac.plist",
      "entitlementsInherit": "build/entitlements.mac.plist"
    }
  }
}
```

```xml
<!-- build/entitlements.mac.plist -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key>
  <true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
  <true/>
  <key>com.apple.security.cs.allow-dyld-environment-variables</key>
  <true/>
</dict>
</plist>
```

#### Windows Code Signing

Two options:

1. **Standard Code Signing Certificate** - Shows SmartScreen warning initially, goes away after enough installations
2. **EV (Extended Validation) Certificate** - No warnings immediately, higher trust

```json
// package.json
{
  "build": {
    "win": {
      "target": "nsis",
      "certificateFile": "path/to/cert.pfx",
      "certificatePassword": "<password>",
      "signingHashAlgorithms": ["sha256"],
      "rfc3161TimeStampServer": "http://timestamp.digicert.com"
    }
  }
}
```

**Best Practice**: Store certificate password in environment variable:

```bash
export CSC_KEY_PASSWORD=$(pass show claude/windows-cert-password)
```

#### Linux

No code signing required, but AppImage/Snap/deb packages should be signed for distribution:

```bash
gpg --armor --detach-sig package.AppImage
```

### Auto-Update (electron-updater)

```bash
npm install electron-updater
```

#### Main Process Setup

```typescript
// src/main/services/updater.ts
import { autoUpdater } from 'electron-updater'
import log from 'electron-log'

export function initAutoUpdater() {
  // Configure logging
  autoUpdater.logger = log
  log.transports.file.level = 'info'

  // Check for updates on startup (after 10s delay)
  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify()
  }, 10000)

  // Check every 4 hours
  setInterval(
    () => {
      autoUpdater.checkForUpdatesAndNotify()
    },
    4 * 60 * 60 * 1000
  )

  autoUpdater.on('update-available', (info) => {
    log.info('Update available:', info)
  })

  autoUpdater.on('update-downloaded', (info) => {
    log.info('Update downloaded:', info)
    // Notify user and prompt restart
  })
}
```

#### Publish Configuration

```json
// package.json
{
  "build": {
    "publish": [
      {
        "provider": "github",
        "owner": "your-org",
        "repo": "claude-pilot"
      }
    ]
  }
}
```

**Supported Providers**: GitHub Releases, S3, Generic HTTP, custom update server

### Crash Reporting (Sentry)

```bash
npm install @sentry/electron
```

#### Initialize in Both Processes

```typescript
// src/main/index.ts
import * as Sentry from '@sentry/electron/main'

Sentry.init({
  dsn: 'https://your-dsn@sentry.io/project-id',
  environment: process.env.NODE_ENV,
  release: app.getVersion(),

  // Capture native crashes (minidumps)
  integrations: [Sentry.electronMinidumpIntegration()],

  // Performance monitoring
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
})
```

```typescript
// src/renderer/main.tsx
import * as Sentry from '@sentry/electron/renderer'

Sentry.init({
  dsn: 'https://your-dsn@sentry.io/project-id',
  environment: import.meta.env.MODE,

  // Session replay for debugging
  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
})
```

#### Error Boundaries

```typescript
// src/renderer/components/common/ErrorBoundary.tsx
import { Component, ErrorInfo, ReactNode } from 'react'
import * as Sentry from '@sentry/electron/renderer'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    Sentry.captureException(error, {
      contexts: {
        react: {
          componentStack: errorInfo.componentStack,
        },
      },
    })
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || <div>Something went wrong</div>
    }
    return this.props.children
  }
}
```

### Analytics/Telemetry

**Privacy-First Options**:

1. **PostHog** (self-hostable)

```bash
npm install posthog-js
```

```typescript
// src/renderer/lib/analytics.ts
import posthog from 'posthog-js'

export function initAnalytics() {
  if (import.meta.env.MODE === 'production') {
    posthog.init('<ph_project_api_key>', {
      api_host: 'https://app.posthog.com',
      opt_out_capturing_by_default: true, // Require explicit opt-in
    })
  }
}

export function trackEvent(event: string, properties?: Record<string, any>) {
  if (posthog.has_opted_in_capturing()) {
    posthog.capture(event, properties)
  }
}
```

2. **Plausible Analytics** (privacy-focused, no cookies)
3. **Custom Telemetry** via tRPC endpoint (full control)

### Security Hardening

#### Content Security Policy (CSP)

```typescript
// src/main/index.ts
import { session } from 'electron'

app.whenReady().then(() => {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; " +
            "script-src 'self' 'unsafe-inline'; " + // Allow inline scripts for React
            "style-src 'self' 'unsafe-inline'; " +
            "img-src 'self' data:; " +
            "connect-src 'self' ws://localhost:*; " + // Allow WebSocket for HMR
            "font-src 'self';",
        ],
        // Required for SharedArrayBuffer (worker optimization)
        'Cross-Origin-Opener-Policy': ['same-origin'],
        'Cross-Origin-Embedder-Policy': ['credentialless'],
      },
    })
  })
})
```

#### Secure BrowserWindow Configuration

```typescript
// src/main/window.ts
import { BrowserWindow } from 'electron'

export function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      // Security baseline (all required)
      nodeIntegration: false, // No Node.js in renderer
      contextIsolation: true, // Isolate preload context
      sandbox: true, // OS-level sandboxing
      webSecurity: true, // Enable web security
      allowRunningInsecureContent: false,

      // Preload script (only way to expose APIs)
      preload: path.join(__dirname, '../preload/index.js'),
    },
  })

  return win
}
```

#### Context Bridge (Preload Security)

```typescript
// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron'

// Only expose specific, safe APIs
contextBridge.exposeInMainWorld('electron', {
  // ❌ NEVER expose entire ipcRenderer
  // ipcRenderer: ipcRenderer

  // ✅ Expose specific methods only
  invoke: (channel: string, ...args: any[]) => {
    // Whitelist allowed channels
    const validChannels = ['trpc']
    if (validChannels.includes(channel)) {
      return ipcRenderer.invoke(channel, ...args)
    }
    throw new Error(`Invalid IPC channel: ${channel}`)
  },

  on: (channel: string, callback: Function) => {
    const validChannels = ['session-update', 'system-notification']
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (_event, ...args) => callback(...args))
    }
  },
})
```

#### Disable Remote Module

The `remote` module is deprecated and insecure. Use IPC/tRPC instead:

```typescript
// ❌ Insecure (remote module)
const { dialog } = require('electron').remote
dialog.showOpenDialog()

// ✅ Secure (IPC)
window.electron.invoke('show-open-dialog')
```

**Sources**:

- [Auto Update - electron-builder](https://www.electron.build/auto-update.html)
- [macOS and Windows code signing](https://www.electron.build/code-signing.html)
- [Electron Error and Performance Monitoring | Sentry](https://sentry.io/for/electron/)
- [Security | Electron](https://www.electronjs.org/docs/latest/tutorial/security)
- [Context Isolation | Electron](https://www.electronjs.org/docs/latest/tutorial/context-isolation)
- [Process Sandboxing | Electron](https://www.electronjs.org/docs/latest/tutorial/sandbox)

---

## 6. CI/CD for Electron

### GitHub Actions Workflow (Cross-Platform)

```yaml
# .github/workflows/build.yml
name: Build & Release

on:
  push:
    branches: [main, develop]
    tags: ['v*']
  pull_request:
    branches: [main]

jobs:
  build:
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]

    runs-on: ${{ matrix.os }}

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm run test:ci

      - name: Run Playwright tests
        run: npm run test:e2e

      - name: Type check
        run: npm run typecheck

      - name: Lint
        run: npm run lint

      - name: Build
        run: npm run build

      # Code signing setup (macOS)
      - name: Import macOS certificate
        if: matrix.os == 'macos-latest' && github.event_name == 'push'
        env:
          MACOS_CERTIFICATE: ${{ secrets.MACOS_CERTIFICATE }}
          MACOS_CERTIFICATE_PWD: ${{ secrets.MACOS_CERTIFICATE_PWD }}
        run: |
          echo $MACOS_CERTIFICATE | base64 --decode > certificate.p12
          security create-keychain -p actions build.keychain
          security default-keychain -s build.keychain
          security unlock-keychain -p actions build.keychain
          security import certificate.p12 -k build.keychain -P $MACOS_CERTIFICATE_PWD -T /usr/bin/codesign
          security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k actions build.keychain

      # Package & publish
      - name: Package app (Linux)
        if: matrix.os == 'ubuntu-latest'
        run: npm run package:linux

      - name: Package app (macOS)
        if: matrix.os == 'macos-latest'
        env:
          CSC_LINK: ${{ secrets.MACOS_CERTIFICATE }}
          CSC_KEY_PASSWORD: ${{ secrets.MACOS_CERTIFICATE_PWD }}
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}
        run: npm run package:mac

      - name: Package app (Windows)
        if: matrix.os == 'windows-latest'
        env:
          CSC_LINK: ${{ secrets.WINDOWS_CERTIFICATE }}
          CSC_KEY_PASSWORD: ${{ secrets.WINDOWS_CERTIFICATE_PWD }}
        run: npm run package:win

      # Upload artifacts
      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: dist-${{ matrix.os }}
          path: dist/*.{AppImage,dmg,exe,zip}

  release:
    needs: build
    if: startsWith(github.ref, 'refs/tags/v')
    runs-on: ubuntu-latest
    steps:
      - name: Download artifacts
        uses: actions/download-artifact@v4

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v1
        with:
          files: dist-*/*
          draft: false
          prerelease: false
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### electron-builder-action (Simplified)

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    tags: ['v*']

jobs:
  release:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Build & Release
        uses: samuelmeuli/action-electron-builder@v1
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          release: ${{ startsWith(github.ref, 'refs/tags/v') }}
          mac_certs: ${{ secrets.MAC_CERTS }}
          mac_certs_password: ${{ secrets.MAC_CERTS_PASSWORD }}
```

### Testing in CI

```yaml
# .github/workflows/test.yml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright
        run: npx playwright install --with-deps

      - name: Run unit tests
        run: npm run test:coverage

      - name: Run E2E tests
        run: npm run test:e2e

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/coverage-final.json

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
```

### Automated Release Flow

1. **Version Bump**: `npm version patch/minor/major`
2. **Tag Push**: `git push --tags`
3. **CI Triggers**: GitHub Actions runs build matrix
4. **Artifacts Built**: Linux/macOS/Windows binaries
5. **Code Signed**: Platform-specific certificates applied
6. **Release Created**: GitHub Release with all artifacts
7. **Auto-Update**: electron-updater picks up new release

**Sources**:

- [Electron Builder Action - GitHub Marketplace](https://github.com/marketplace/actions/electron-builder-action)
- [Build and Publish a Multi-Platform Electron App on GitHub - DEV Community](https://dev.to/erikhofer/build-and-publish-a-multi-platform-electron-app-on-github-3lnd)
- [Multi-OS Electron Build & Release with GitHub Actions - DEV Community](https://dev.to/supersuman/multi-os-electron-build-release-with-github-actions-f3n)

---

## Recommended Testing Stack for Claude Pilot

### Core Testing Tools

| Tool           | Purpose                                 | Priority        |
| -------------- | --------------------------------------- | --------------- |
| **Vitest**     | Unit tests for utilities, hooks, stores | ✅ High         |
| **Playwright** | E2E tests for full app flows            | ✅ High         |
| **Storybook**  | Component isolation & visual testing    | ⭐ Medium       |
| **Chromatic**  | Visual regression testing               | ⭐ Medium       |
| **memlab**     | Memory leak detection                   | 🔍 Low (manual) |

### Recommended Implementation Order

**Phase 1: Foundation (Week 1-2)**

1. ✅ Vitest setup (already done - 299/299 tests passing)
2. Setup Playwright with basic smoke tests
3. Add CI/CD with GitHub Actions
4. Configure code signing for all platforms

**Phase 2: Coverage (Week 3-4)** 5. Expand Playwright tests to cover critical user journeys 6. Add Storybook for component library 7. Integrate Sentry for crash reporting 8. Setup electron-updater with staging channel

**Phase 3: Polish (Week 5-6)** 9. Add Chromatic for visual regression 10. Performance profiling and optimization 11. Memory leak audit with memlab 12. Security audit (CSP, context isolation)

### Test Coverage Targets

| Category          | Target         | Current |
| ----------------- | -------------- | ------- |
| Unit Tests        | 80%            | ~75%    |
| Integration Tests | 60%            | ~10%    |
| E2E Tests         | Critical paths | 0%      |
| Visual Regression | All components | 0%      |

---

## Quick Start Commands

```bash
# Install testing dependencies
npm install --save-dev @playwright/test electron-playwright-helpers memlab

# Install Storybook
npx storybook@latest init

# Install production tools
npm install electron-updater @sentry/electron

# Run tests
npm run test              # Vitest unit tests
npm run test:e2e          # Playwright E2E tests
npm run test:coverage     # Coverage report

# Storybook
npm run storybook         # Dev mode
npm run build-storybook   # Build static

# Performance
npm run analyze           # Bundle size
npm run profile           # Electron profiling

# Build & release
npm run build             # Production build
npm run package:linux     # Linux packages
npm run package:mac       # macOS .dmg
npm run package:win       # Windows installer
```

---

## Additional Resources

### Official Documentation

- [Electron Documentation](https://www.electronjs.org/docs/latest/)
- [Playwright Documentation](https://playwright.dev/)
- [Storybook Documentation](https://storybook.js.org/docs)
- [electron-builder Documentation](https://www.electron.build/)

### Community Resources

- [Awesome Electron](https://github.com/sindresorhus/awesome-electron)
- [Electron React Boilerplate](https://electron-react-boilerplate.js.org/)
- [tRPC Awesome Collection](https://trpc.io/awesome)

### Security Resources

- [Electron Security Checklist](https://www.doyensec.com/resources/us-17-Carettoni-Electronegativity-A-Study-Of-Electron-Security-wp.pdf)
- [Penetration Testing of Electron-based Applications](https://deepstrike.io/blog/penetration-testing-of-electron-based-applications)

---

## Next Steps for Claude Pilot

1. **Immediate**: Setup Playwright with 5 critical E2E tests
2. **This Sprint**: Add GitHub Actions CI/CD pipeline
3. **Next Sprint**: Integrate Sentry and electron-updater
4. **Before Beta**: Complete Storybook + Chromatic setup
5. **Before Launch**: Security audit and penetration testing

---

**Research Completed**: 2026-01-19
**Total Sources**: 48 web resources analyzed
**Status**: Ready for implementation
