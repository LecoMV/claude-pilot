# Electron Testing and CI/CD Enterprise Strategy

**Research Date:** 2026-01-18
**Target Application:** Claude Pilot (Electron + React + TypeScript + tRPC)
**Objective:** Enterprise-grade testing and CI/CD for 100% functional, production-ready Electron app

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Comprehensive Test Strategy](#comprehensive-test-strategy)
3. [Electron-Specific Testing](#electron-specific-testing)
4. [CI/CD Pipeline](#cicd-pipeline)
5. [Quality Gates](#quality-gates)
6. [Tool Configuration Examples](#tool-configuration-examples)
7. [Implementation Roadmap](#implementation-roadmap)
8. [Sources](#sources)

---

## Executive Summary

### Key Findings

- **Enterprise coverage threshold:** 80% is industry standard, 95% for critical systems
- **Test stack:** Vitest (unit) + Playwright (E2E) + React Testing Library (components)
- **CI/CD platform:** GitHub Actions with cross-platform matrix builds
- **Native module testing:** Requires `ELECTRON_RUN_AS_NODE` environment variable
- **Visual regression:** Chromatic (Storybook-focused) vs Percy (general-purpose)
- **Dependency automation:** Renovate preferred over Dependabot for complex setups

### Recommended Stack for Claude Pilot

| Layer              | Tool                              | Purpose                             |
| ------------------ | --------------------------------- | ----------------------------------- |
| Unit Tests         | Vitest                            | Fast, Vite-native, TypeScript-first |
| Component Tests    | Vitest + React Testing Library    | React components with mocking       |
| Integration Tests  | Vitest + electron-trpc mocks      | tRPC router testing                 |
| E2E Tests          | Playwright                        | Full app automation via CDP         |
| Visual Regression  | Percy or Playwright screenshots   | UI consistency                      |
| Main Process Tests | Vitest with ELECTRON_RUN_AS_NODE  | Native module compatibility         |
| Pre-commit         | Husky + lint-staged               | Lint/format staged files            |
| Dependency Updates | Renovate                          | Automated PRs, multi-platform       |
| Changelog          | release-please                    | Conventional commits → changelog    |
| Code Signing       | electron-builder + GitHub secrets | Cross-platform signing              |

---

## 1. Comprehensive Test Strategy

### 1.1 Test Coverage Thresholds

**Industry Standards:**

- **80% coverage:** Standard corporate requirement (Tim Ottinger, Industrial Logic)
- **95% coverage:** High-quality teams (e.g., mabl requires 95% for merge)
- **70% minimum:** Safety net threshold (prevents backsliding)

**Context-Dependent Factors:**

- Safety-critical systems (medical, automotive): Higher coverage (90%+)
- Less critical software: 80% is appropriate
- Avoid 100% as a goal - diminishing returns and false sense of security

**Recommendation for Claude Pilot:**

```json
// vitest.config.ts coverage thresholds
{
  "coverage": {
    "provider": "v8",
    "reporter": ["text", "json", "html", "lcov"],
    "lines": 80,
    "functions": 80,
    "branches": 75,
    "statements": 80,
    "exclude": ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}", "**/test/**", "**/e2e/**", "**/*.d.ts"]
  }
}
```

**Sources:**

- [What unit test coverage percentage should teams aim for? | TechTarget](https://www.techtarget.com/searchsoftwarequality/tip/What-unit-test-coverage-percentage-should-teams-aim-for)
- [Minimum Acceptable Code Coverage | Bullseye](https://www.bullseye.com/minimum.html)
- [Code Coverage Best Practices | Google Testing Blog](https://testing.googleblog.com/2020/08/code-coverage-best-practices.html)

### 1.2 Integration Testing for tRPC + Electron IPC

**Challenge:** Testing type-safe IPC without launching full Electron app.

**Solution:** Mock the electron-trpc infrastructure.

```typescript
// tests/integration/trpc-router.test.ts
import { describe, it, expect, vi } from 'vitest'
import { appRouter } from '@/main/trpc/router'
import type { AppRouter } from '@/main/trpc/router'

describe('tRPC Router Integration', () => {
  it('should handle system status query', async () => {
    const caller = appRouter.createCaller({
      // Mock Electron main process context
      session: { id: 'test-session' },
      event: {} as any,
    })

    const status = await caller.system.status()
    expect(status).toHaveProperty('cpu')
    expect(status).toHaveProperty('memory')
  })

  it('should validate input with Zod', async () => {
    const caller = appRouter.createCaller({ session: {}, event: {} as any })

    await expect(caller.credentials.store({ key: '', value: 'test' })).rejects.toThrow() // Zod validation error
  })
})
```

**Key Patterns:**

1. **Use `createCaller`** instead of full tRPC client (unit-test style)
2. **Mock Electron APIs** (`ipcMain`, `BrowserWindow`, etc.)
3. **Test Zod schemas** separately from handlers
4. **Use `electron-mock-ipc`** for full IPC simulation

**Sources:**

- [electron-trpc Documentation](https://electron-trpc.dev/getting-started/)
- [Using React and tRPC with Electron | Fun to Imagine](https://www.funtoimagine.com/blog/using-react-trpc-electron/)

### 1.3 E2E Testing with Playwright

**Why Playwright for Electron:**

- Experimental Electron support via Chrome DevTools Protocol (CDP)
- Automates Chromium, which Electron is based on
- Can test multi-window scenarios
- Built-in screenshot/video recording

**Configuration:**

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test'
import path from 'path'

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,

  use: {
    trace: 'on-first-retry',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'electron',
      use: {
        ...devices['Desktop Chrome'],
        // Point to packaged Electron app
        launchOptions: {
          executablePath: path.join(__dirname, 'dist/linux-unpacked/claude-pilot'),
        },
      },
    },
  ],
})
```

**Example E2E Test:**

```typescript
// e2e/agents.spec.ts
import { test, expect, _electron as electron } from '@playwright/test'

test('spawns agent and shows in dashboard', async () => {
  const app = await electron.launch({
    args: ['.'],
    env: { NODE_ENV: 'test' },
  })

  const window = await app.firstWindow()

  // Navigate to agents page
  await window.click('nav a[href="/agents"]')

  // Spawn an agent
  await window.click('button:has-text("Spawn Agent")')
  await window.selectOption('select[name="type"]', 'coder')
  await window.fill('input[name="name"]', 'test-agent')
  await window.click('button:has-text("Create")')

  // Verify agent appears in list
  await expect(window.locator('text=test-agent')).toBeVisible()

  await app.close()
})
```

**Sources:**

- [Testing Electron apps with Playwright | Simon Willison's TILs](https://til.simonwillison.net/electron/testing-electron-playwright)
- [Testing Electron Apps with Playwright — Kubeshop | Medium](https://medium.com/kubeshop-i/testing-electron-apps-with-playwright-kubeshop-839ff27cf376)
- [Electron Playwright Example | GitHub](https://github.com/spaceagetv/electron-playwright-example)

### 1.4 Visual Regression Testing

**Options:**

| Tool                       | Pros                                                        | Cons                                    | Best For                            |
| -------------------------- | ----------------------------------------------------------- | --------------------------------------- | ----------------------------------- |
| **Playwright Screenshots** | Free, built-in, baseline images in repo                     | Platform-dependent (Mac vs Linux diffs) | Simple setups, small teams          |
| **Percy**                  | AI-powered visual diffing, cloud-based, filters noise       | Paid ($), requires internet             | General-purpose apps, larger teams  |
| **Chromatic**              | Storybook integration, interactive snapshots, collaboration | Storybook-focused, expensive            | Component libraries, design systems |

**Recommendation for Claude Pilot:** Start with Playwright screenshots, upgrade to Percy if diffs become too noisy.

**Playwright Visual Testing Setup:**

```typescript
// e2e/visual-regression.spec.ts
import { test, expect } from '@playwright/test'

test('dashboard renders correctly', async ({ page }) => {
  await page.goto('/')

  // Wait for metrics to load
  await page.waitForSelector('[data-testid="cpu-metric"]')

  // Take screenshot
  await expect(page).toHaveScreenshot('dashboard.png', {
    maxDiffPixels: 100, // Allow minor differences
    animations: 'disabled', // Disable animations for stability
  })
})
```

**Important:** Run visual tests on the same OS as your CI (Linux). Use Docker locally to match CI environment.

**Sources:**

- [Visual testing with Playwright | Chromatic](https://www.chromatic.com/blog/how-to-visual-test-ui-using-playwright/)
- [Playwright Visual Testing Guide | Codoid](https://codoid.com/automation-testing/playwright-visual-testing-a-comprehensive-guide-to-ui-regression/)
- [Percy vs Chromatic | Medium](https://medium.com/@crissyjoshua/percy-vs-chromatic-which-visual-regression-testing-tool-to-use-6cdce77238dc)

### 1.5 Snapshot Testing for React Components

**When to Use:**

- Complex component structures (nested JSX)
- Regression testing for UI changes
- Complementary to unit tests (not a replacement)

**Best Practices:**

1. **Keep snapshots small** - Avoid full component trees
2. **Use inline snapshots** for small outputs (`toMatchInlineSnapshot()`)
3. **Mock non-deterministic data** (dates, IDs, random values)
4. **Review snapshot diffs carefully** - Don't blindly update with `-u`
5. **Commit snapshots to git** - Treat as first-class test artifacts

**Example:**

```typescript
// src/renderer/components/agents/AgentCard.test.tsx
import { render } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { AgentCard } from './AgentCard'

describe('AgentCard', () => {
  it('renders coder agent correctly', () => {
    const { container } = render(
      <AgentCard
        name="test-coder"
        type="coder"
        status="active"
        tasksCompleted={5}
      />
    )

    expect(container.firstChild).toMatchInlineSnapshot(`
      <div class="agent-card" data-type="coder">
        <h3>test-coder</h3>
        <span class="status active">Active</span>
        <p>Tasks: 5</p>
      </div>
    `)
  })
})
```

**Sources:**

- [Snapshot Testing Guide | Vitest](https://vitest.dev/guide/snapshot)
- [Effective Snapshot Testing | Kent C. Dodds](https://kentcdodds.com/blog/effective-snapshot-testing)
- [JavaScript testing with Snapshots | Wanago.io](https://wanago.io/2024/04/08/javascript-testing-snapshots-react-jest-vitest/)

---

## 2. Electron-Specific Testing

### 2.1 Main Process Testing Strategies

**Challenge:** Main process uses Node.js APIs unavailable in browser environments where Vitest typically runs.

**Solution:** Run Vitest through Electron's Node runtime.

```bash
# Set environment variable to run Electron as Node
ELECTRON_RUN_AS_NODE=true node_modules/.bin/electron node_modules/vitest/vitest.mjs
```

**Alternative:** Use `electron-mocha` (older, Mocha-based approach).

**Comparison: Vitest vs electron-mocha**

| Feature              | Vitest                        | electron-mocha                           |
| -------------------- | ----------------------------- | ---------------------------------------- |
| Speed                | Fast (ESM, parallel)          | Slower (CommonJS)                        |
| TypeScript           | Native support                | Requires ts-node                         |
| Vite Integration     | Seamless                      | None                                     |
| Watch Mode           | Excellent                     | Basic                                    |
| Electron Integration | Requires ELECTRON_RUN_AS_NODE | Built-in                                 |
| Maintenance          | Active                        | Low activity (last update 10 months ago) |

**Recommendation:** Use Vitest with `ELECTRON_RUN_AS_NODE` for consistency with frontend tests.

**Sources:**

- [Vitest Discussion: Electron and native modules | GitHub](https://github.com/vitest-dev/vitest/discussions/2142)
- [electron-mocha | npm](https://www.npmjs.com/package/electron-mocha)

### 2.2 Preload Script Testing

**Strategy:** Treat preload as a bridge - test both sides separately.

```typescript
// src/preload/index.test.ts
import { describe, it, expect, vi } from 'vitest'

// Mock Electron APIs
vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: vi.fn(),
  },
  ipcRenderer: {
    invoke: vi.fn(),
  },
}))

describe('Preload Script', () => {
  it('exposes electron API to renderer', async () => {
    const { contextBridge } = await import('electron')
    await import('./index') // Load preload script

    expect(contextBridge.exposeInMainWorld).toHaveBeenCalledWith('electron', expect.any(Object))
  })
})
```

### 2.3 IPC Communication Testing

**Pattern 1: Mock IPC in Frontend Tests**

```typescript
// src/renderer/hooks/useSystemStatus.test.ts
import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useSystemStatus } from './useSystemStatus'

// Mock tRPC client
vi.mock('@/lib/trpc', () => ({
  trpc: {
    system: {
      status: {
        query: vi.fn(),
      },
    },
  },
}))

describe('useSystemStatus', () => {
  it('fetches system status on mount', async () => {
    const { trpc } = await import('@/lib/trpc')

    vi.mocked(trpc.system.status.query).mockResolvedValue({
      cpu: 45,
      memory: 60,
      uptime: 3600,
    })

    const { result } = renderHook(() => useSystemStatus())

    await waitFor(() => {
      expect(result.current.data).toEqual({
        cpu: 45,
        memory: 60,
        uptime: 3600,
      })
    })
  })
})
```

**Pattern 2: Integration Test with Real IPC**

```typescript
// tests/integration/ipc.test.ts
import { app, ipcMain } from 'electron'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

describe('IPC Integration', () => {
  beforeAll(async () => {
    await app.whenReady()
  })

  afterAll(() => {
    app.quit()
  })

  it('handles system status request', async () => {
    // Simulate renderer sending IPC
    const promise = new Promise((resolve) => {
      ipcMain.handle('trpc', async (event, { path, input }) => {
        if (path === 'system.status') {
          const result = { cpu: 50, memory: 60 }
          resolve(result)
          return result
        }
      })
    })

    const result = await promise
    expect(result).toHaveProperty('cpu')
  })
})
```

### 2.4 Native Module Testing (node-pty, better-sqlite3)

**Problem:** Native modules compiled for Electron's Node version won't run in system Node.

**Solution 1: ELECTRON_RUN_AS_NODE (Recommended)**

```bash
# Run tests through Electron's Node
ELECTRON_RUN_AS_NODE=true ./node_modules/.bin/electron ./node_modules/vitest/vitest.mjs
```

**Solution 2: electron-rebuild**

```bash
# Rebuild native modules for Electron
npx electron-rebuild
```

**Solution 3: Mock native modules in non-E2E tests**

```typescript
// tests/setup.ts
import { vi } from 'vitest'

vi.mock('better-sqlite3', () => ({
  default: vi.fn(() => ({
    prepare: vi.fn(),
    exec: vi.fn(),
    close: vi.fn(),
  })),
}))

vi.mock('node-pty', () => ({
  spawn: vi.fn(() => ({
    write: vi.fn(),
    kill: vi.fn(),
    on: vi.fn(),
  })),
}))
```

**Sources:**

- [Electron and native modules | Vitest Discussions](https://github.com/vitest-dev/vitest/discussions/2142)
- [Native Node Modules | Electron Docs](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules)

### 2.5 Window Management Testing

**Pattern:** Test window lifecycle and inter-window communication.

```typescript
// tests/main/window-manager.test.ts
import { BrowserWindow } from 'electron'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createWindow, getWindow } from '@/main/window-manager'

describe('Window Manager', () => {
  let window: BrowserWindow

  afterEach(() => {
    if (window && !window.isDestroyed()) {
      window.close()
    }
  })

  it('creates window with correct settings', async () => {
    window = await createWindow('main')

    expect(window.isVisible()).toBe(true)
    expect(window.webContents.getTitle()).toBe('Claude Pilot')

    const bounds = window.getBounds()
    expect(bounds.width).toBeGreaterThan(800)
    expect(bounds.height).toBeGreaterThan(600)
  })

  it('applies security settings', async () => {
    window = await createWindow('main')
    const prefs = window.webContents.getLastWebPreferences()

    expect(prefs.nodeIntegration).toBe(false)
    expect(prefs.contextIsolation).toBe(true)
    expect(prefs.sandbox).toBe(true)
  })
})
```

---

## 3. CI/CD Pipeline

### 3.1 GitHub Actions Workflow Structure

**Recommended 3-tier approach:**

1. **Fast Checks** (on every push): Lint, typecheck, unit tests
2. **Integration Tests** (on PR): Integration tests, build verification
3. **Release** (on tag): Full build matrix, signing, publishing

**Example: `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [master, develop]
  pull_request:
    branches: [master]

jobs:
  fast-checks:
    name: Lint & Type Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'

      - run: npm ci

      - name: Lint
        run: npm run lint

      - name: Type Check
        run: npm run typecheck

      - name: Unit Tests
        run: npm run test:run -- --coverage

      - name: Upload Coverage
        uses: codecov/codecov-action@v4
        with:
          token: ${{ secrets.CODECOV_TOKEN }}

  integration-tests:
    name: Integration Tests
    runs-on: ubuntu-latest
    needs: fast-checks
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'

      - run: npm ci

      - name: Install Xvfb
        run: sudo apt-get install -y xvfb

      - name: Run E2E Tests
        run: xvfb-run --auto-servernum npm run test:e2e
        env:
          CI: true

      - name: Upload Test Results
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/

  build-test:
    name: Build Test
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    needs: fast-checks
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'

      - run: npm ci

      - name: Build
        run: npm run build

      - name: Package (test)
        run: npm run package
        env:
          # Don't sign in test builds
          CSC_IDENTITY_AUTO_DISCOVERY: false
```

### 3.2 Cross-Platform Build Matrix

**Example: `.github/workflows/release.yml`**

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    name: Release ${{ matrix.os }}
    strategy:
      matrix:
        include:
          - os: ubuntu-latest
            platform: linux
          - os: macos-latest
            platform: mac
          - os: windows-latest
            platform: windows

    runs-on: ${{ matrix.os }}

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'

      - run: npm ci

      - name: Install Snapcraft (Linux only)
        if: matrix.platform == 'linux'
        run: |
          sudo snap install snapcraft --classic
          echo "${{ secrets.SNAP_TOKEN }}" | snapcraft login --with -

      - name: Import Code Signing Certificate (macOS)
        if: matrix.platform == 'mac'
        env:
          CERTIFICATE_OSX_APPLICATION: ${{ secrets.CERTIFICATE_OSX_APPLICATION }}
          CERTIFICATE_PASSWORD: ${{ secrets.CERTIFICATE_PASSWORD }}
        run: |
          echo $CERTIFICATE_OSX_APPLICATION | base64 --decode > certificate.p12
          security create-keychain -p actions build.keychain
          security default-keychain -s build.keychain
          security unlock-keychain -p actions build.keychain
          security import certificate.p12 -k build.keychain -P $CERTIFICATE_PASSWORD -T /usr/bin/codesign
          security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k actions build.keychain

      - name: Import Code Signing Certificate (Windows)
        if: matrix.platform == 'windows'
        env:
          CERTIFICATE_WINDOWS_PFX: ${{ secrets.CERTIFICATE_WINDOWS_PFX }}
          CERTIFICATE_PASSWORD: ${{ secrets.CERTIFICATE_PASSWORD }}
        run: |
          echo "$env:CERTIFICATE_WINDOWS_PFX" | Out-File -FilePath certificate.txt
          certutil -decode certificate.txt certificate.pfx
          Remove-Item certificate.txt

      - name: Build & Publish
        env:
          # macOS notarization
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_ID_PASSWORD: ${{ secrets.APPLE_ID_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
          # Windows signing
          CSC_LINK: certificate.pfx
          CSC_KEY_PASSWORD: ${{ secrets.CERTIFICATE_PASSWORD }}
          # GitHub token for release
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: npm run release

      - name: Upload Artifacts
        uses: actions/upload-artifact@v4
        with:
          name: ${{ matrix.platform }}-build
          path: |
            dist/*.dmg
            dist/*.exe
            dist/*.AppImage
            dist/*.deb
            dist/*.snap
```

**Sources:**

- [Electron Builder Action | GitHub Marketplace](https://github.com/marketplace/actions/electron-builder-action)
- [Signing Electron Apps with GitHub Actions | Ship Shape](https://shipshape.io/blog/signing-electron-apps-with-github-actions/)
- [Electron Playwright E2E Test Quick Start | GitHub](https://github.com/tanshuai/electron-playwright-e2e-test-quick-start)

### 3.3 Automated Release with electron-builder

**electron-builder Configuration:**

```javascript
// electron-builder.config.js
module.exports = {
  appId: 'com.claudepilot.app',
  productName: 'Claude Pilot',

  directories: {
    output: 'dist',
    buildResources: 'resources',
  },

  files: ['dist-electron/**/*', 'dist/**/*', 'package.json'],

  mac: {
    target: ['dmg', 'zip'],
    category: 'public.app-category.developer-tools',
    hardenedRuntime: true,
    gatekeeperAssess: false,
    entitlements: 'resources/entitlements.mac.plist',
    entitlementsInherit: 'resources/entitlements.mac.plist',
    notarize: {
      teamId: process.env.APPLE_TEAM_ID,
    },
  },

  dmg: {
    sign: false, // DMG itself doesn't need signing
    contents: [
      { x: 130, y: 220 },
      { x: 410, y: 220, type: 'link', path: '/Applications' },
    ],
  },

  win: {
    target: ['nsis', 'portable'],
    certificateFile: process.env.CSC_LINK,
    certificatePassword: process.env.CSC_KEY_PASSWORD,
  },

  nsis: {
    oneClick: false,
    perMachine: true,
    allowToChangeInstallationDirectory: true,
  },

  linux: {
    target: ['AppImage', 'deb', 'snap'],
    category: 'Development',
  },

  snap: {
    publish: {
      provider: 'snapStore',
      channels: ['stable'],
    },
  },

  publish: {
    provider: 'github',
    owner: 'yourorg',
    repo: 'claude-pilot',
  },
}
```

**Sources:**

- [Signing and notarizing Electron apps | Simon Willison's TILs](https://til.simonwillison.net/electron/sign-notarize-electron-macos)
- [Code Signing | Electron Docs](https://github.com/electron/electron/blob/main/docs/tutorial/code-signing.md)

### 3.4 Artifact Signing and Notarization

**Required Secrets:**

| Secret                        | Purpose                            | Platform       |
| ----------------------------- | ---------------------------------- | -------------- |
| `CERTIFICATE_OSX_APPLICATION` | macOS code signing cert (base64)   | macOS          |
| `CERTIFICATE_PASSWORD`        | Cert password                      | macOS, Windows |
| `APPLE_ID`                    | Apple Developer ID                 | macOS          |
| `APPLE_ID_PASSWORD`           | App-specific password              | macOS          |
| `APPLE_TEAM_ID`               | Apple Team ID                      | macOS          |
| `CERTIFICATE_WINDOWS_PFX`     | Windows code signing cert (base64) | Windows        |
| `SNAP_TOKEN`                  | Snapcraft login token              | Linux          |

**Generating Secrets:**

```bash
# macOS: Export cert from Keychain as .p12, then:
base64 -i certificate.p12 | pbcopy

# Windows: Export cert as .pfx, then:
certutil -encode certificate.pfx certificate.txt

# Snap: Generate token:
snapcraft export-login --snaps=claude-pilot --channels=stable snap-token.txt
```

### 3.5 Automated Changelog Generation

**Using release-please (Google's tool):**

```yaml
# .github/workflows/release-please.yml
name: Release Please

on:
  push:
    branches:
      - master

jobs:
  release-please:
    runs-on: ubuntu-latest
    steps:
      - uses: google-github-actions/release-please-action@v4
        id: release
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          release-type: node
          package-name: claude-pilot
          changelog-types: |
            [
              {"type":"feat","section":"Features","hidden":false},
              {"type":"fix","section":"Bug Fixes","hidden":false},
              {"type":"perf","section":"Performance","hidden":false},
              {"type":"refactor","section":"Refactoring","hidden":false},
              {"type":"docs","section":"Documentation","hidden":false},
              {"type":"chore","section":"Miscellaneous","hidden":true}
            ]

      # Trigger release build if PR is merged
      - name: Trigger Release Build
        if: ${{ steps.release.outputs.release_created }}
        run: |
          echo "Release ${{ steps.release.outputs.tag_name }} created!"
          # GitHub Actions will trigger release.yml via tag push
```

**Conventional Commit Format:**

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Examples:**

```
feat(agents): add support for custom agent topologies

Allows users to define mesh, hierarchical, or adaptive topologies
for agent swarms via the UI.

Closes #123

---

fix(terminal): prevent memory leak in pty sessions

Previously, pty sessions were not properly cleaned up when tabs
were closed, leading to memory growth over time.

Fixes #456

---

perf(graph): optimize Cytoscape rendering for 1000+ nodes

Use web workers for layout calculation and incremental rendering
to maintain 60fps with large graphs.

---

BREAKING CHANGE: tRPC router structure changed

Migrated from flat router to nested controllers. Frontend code
must update import paths from:
  trpc.systemStatus() → trpc.system.status()
```

**Sources:**

- [semantic-release | GitHub](https://github.com/semantic-release/semantic-release)
- [Using semantic-release | LogRocket](https://blog.logrocket.com/using-semantic-release-automate-releases-changelogs/)
- [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)

---

## 4. Quality Gates

### 4.1 Pre-commit Hooks (Husky + lint-staged)

**Installation:**

```bash
npm install -D husky lint-staged
npx husky init
```

**Configuration:**

```json
// package.json
{
  "scripts": {
    "prepare": "husky"
  },
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{json,md,yml}": ["prettier --write"]
  }
}
```

```bash
# .husky/pre-commit
npm run lint-staged
npm run typecheck
```

**Advanced: Run type check only on changed files**

```json
{
  "lint-staged": {
    "*.{ts,tsx}": ["bash -c 'npm run typecheck'", "eslint --fix", "prettier --write"]
  }
}
```

**Warning:** Full `typecheck` on every commit can be slow. Consider:

- Running typecheck in CI only
- Using `tsc-files` to check only staged files
- Skipping typecheck for small changes (use `git commit --no-verify`)

**Sources:**

- [Getting started with Husky and lint-staged | Medium](https://duncanlew.medium.com/getting-started-with-husky-and-lint-staged-for-pre-commit-hooks-c2764d8c9ae)
- [Run TypeScript type check in pre-commit hook | DEV](https://dev.to/samueldjones/run-a-typescript-type-check-in-your-pre-commit-hook-using-lint-staged-husky-30id)

### 4.2 PR Checks and Required Reviews

**Branch Protection Rules (GitHub):**

```yaml
# Settings → Branches → Branch protection rules
master:
  required_reviews: 1
  required_status_checks:
    - fast-checks (Lint & Type Check)
    - integration-tests (Integration Tests)
    - build-test (ubuntu-latest)
    - build-test (macos-latest)
    - build-test (windows-latest)
  require_linear_history: true
  enforce_admins: false
  restrictions: null
```

**CODEOWNERS File:**

```
# .github/CODEOWNERS
# Require review from architects for infrastructure changes
/.github/          @yourorg/architects
/electron.vite.config.ts @yourorg/architects
/electron-builder.config.js @yourorg/architects

# Require security review for credential handling
/src/main/controllers/security/ @yourorg/security

# Require UI review for design system changes
/src/renderer/components/common/ @yourorg/design
```

### 4.3 Automated Dependency Updates

**Renovate Configuration (Recommended):**

```json
// renovate.json
{
  "extends": ["config:base"],
  "packageRules": [
    {
      "matchUpdateTypes": ["minor", "patch"],
      "automerge": true,
      "automergeType": "pr",
      "matchCurrentVersion": "!/^0/",
      "minimumReleaseAge": "3 days"
    },
    {
      "matchDepTypes": ["devDependencies"],
      "matchUpdateTypes": ["minor", "patch"],
      "automerge": true,
      "automergeType": "pr"
    },
    {
      "matchPackageNames": ["electron"],
      "groupName": "Electron",
      "automerge": false,
      "schedule": ["before 3am on Monday"]
    },
    {
      "matchPackagePatterns": ["^@types/"],
      "groupName": "TypeScript types",
      "automerge": true
    }
  ],
  "vulnerabilityAlerts": {
    "enabled": true,
    "assignees": ["@yourorg/security"]
  },
  "prConcurrentLimit": 5,
  "prHourlyLimit": 2,
  "timezone": "America/Los_Angeles",
  "schedule": ["before 3am every weekend"]
}
```

**Key Features:**

- **Automerge**: Minor/patch updates auto-merge after 3 days + passing CI
- **Grouping**: Related updates bundled (e.g., all `@types/*`)
- **Scheduling**: Updates only during low-activity times
- **Security alerts**: Immediate PRs for vulnerabilities
- **Rate limiting**: Max 5 PRs at once, 2/hour

**Renovate vs Dependabot:**

| Feature          | Renovate                      | Dependabot     |
| ---------------- | ----------------------------- | -------------- |
| Platforms        | GitHub, GitLab, Bitbucket     | GitHub only    |
| Configuration    | Extensive (JSON)              | Limited (YAML) |
| Grouping         | Advanced                      | Basic          |
| Automerge        | Flexible                      | Limited        |
| Monorepo Support | Excellent                     | Basic          |
| Package Managers | 90+                           | ~20            |
| Cost             | Free (self-hosted/GitHub App) | Free (GitHub)  |

**Sources:**

- [Renovate vs Dependabot | TurboStarter](https://www.turbostarter.dev/blog/renovate-vs-dependabot-whats-the-best-tool-to-automate-your-dependency-updates)
- [Automate Dependency Updates | Medium](https://medium.com/@maruthim152/automation-of-dependency-updates-using-renovate-b768d2d1552e)

### 4.4 Breaking Change Detection

**Strategy 1: API Extractor (for public APIs)**

```bash
npm install -D @microsoft/api-extractor
```

```json
// api-extractor.json
{
  "mainEntryPointFilePath": "./dist/index.d.ts",
  "apiReport": {
    "enabled": true,
    "reportFileName": "claude-pilot.api.md"
  },
  "docModel": {
    "enabled": true
  }
}
```

**In CI:**

```yaml
- name: Check for API Breaking Changes
  run: |
    npm run build
    npx api-extractor run --local

    if git diff --exit-code -- etc/claude-pilot.api.md; then
      echo "No API changes detected"
    else
      echo "::error::API changes detected! Review the diff and update API report if intentional."
      exit 1
    fi
```

**Strategy 2: TypeScript Compiler API (custom tool)**

```typescript
// scripts/check-breaking-changes.ts
import ts from 'typescript'
import { execSync } from 'child_process'

function getTypeSignatures(filePath: string): Map<string, string> {
  const program = ts.createProgram([filePath], {})
  const checker = program.getTypeChecker()
  const sourceFile = program.getSourceFile(filePath)!
  const signatures = new Map<string, string>()

  ts.forEachChild(sourceFile, (node) => {
    if (ts.isFunctionDeclaration(node) && node.name) {
      const symbol = checker.getSymbolAtLocation(node.name)!
      const type = checker.getTypeOfSymbolAtLocation(symbol, node)
      const signature = checker.typeToString(type)
      signatures.set(node.name.text, signature)
    }
  })

  return signatures
}

const currentSigs = getTypeSignatures('./src/main/index.ts')
const mainSigs = getTypeSignatures('./src/main/index.ts') // Load from main branch

let hasBreakingChanges = false

for (const [name, currentSig] of currentSigs) {
  const mainSig = mainSigs.get(name)
  if (mainSig && mainSig !== currentSig) {
    console.error(`Breaking change detected in ${name}:`)
    console.error(`  Before: ${mainSig}`)
    console.error(`  After:  ${currentSig}`)
    hasBreakingChanges = true
  }
}

if (hasBreakingChanges) {
  process.exit(1)
}
```

**Sources:**

- [TypeScript Breaking Change Detector | GitHub](https://github.com/arminyahya/typescript-breaking-change-detector)
- [State of TypeScript 2026 | DevNewsletter](https://devnewsletter.com/p/state-of-typescript-2026)

---

## 5. Tool Configuration Examples

### 5.1 Complete Vitest Configuration

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],

  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        '**/*.test.{ts,tsx}',
        '**/*.spec.{ts,tsx}',
        '**/tests/**',
        '**/e2e/**',
        '**/*.d.ts',
        '**/node_modules/**',
        '**/dist/**',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },

    // Reporter configuration
    reporters: process.env.CI ? ['junit', 'json', 'verbose'] : ['verbose'],
    outputFile: {
      junit: './test-results/junit.xml',
      json: './test-results/results.json',
    },

    // Test execution
    threads: true,
    maxThreads: 4,
    minThreads: 1,

    // Timeouts
    testTimeout: 10000,
    hookTimeout: 10000,

    // Retry flaky tests in CI
    retry: process.env.CI ? 2 : 0,
  },

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@main': path.resolve(__dirname, './src/main'),
      '@renderer': path.resolve(__dirname, './src/renderer'),
      '@shared': path.resolve(__dirname, './src/shared'),
    },
  },
})
```

```typescript
// tests/setup.ts
import { expect, afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

// Cleanup after each test
afterEach(() => {
  cleanup()
})

// Mock Electron APIs globally
global.window = global.window || {}
global.window.electron = {
  invoke: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
}

// Mock better-sqlite3
vi.mock('better-sqlite3', () => ({
  default: vi.fn(() => ({
    prepare: vi.fn(() => ({
      get: vi.fn(),
      all: vi.fn(),
      run: vi.fn(),
    })),
    exec: vi.fn(),
    close: vi.fn(),
  })),
}))

// Mock node-pty
vi.mock('node-pty', () => ({
  spawn: vi.fn(() => ({
    write: vi.fn(),
    kill: vi.fn(),
    on: vi.fn(),
    onData: vi.fn(),
    onExit: vi.fn(),
  })),
}))
```

### 5.2 Complete Playwright Configuration

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test'
import path from 'path'

const PORT = 8888

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,

  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['junit', { outputFile: 'test-results/e2e-results.xml' }],
    ['json', { outputFile: 'test-results/e2e-results.json' }],
  ],

  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'electron',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],

  webServer: process.env.CI
    ? undefined
    : {
        command: 'npm run dev',
        port: PORT,
        timeout: 120_000,
        reuseExistingServer: !process.env.CI,
      },
})
```

### 5.3 Complete ESLint + Prettier Configuration

```javascript
// .eslintrc.cjs
module.exports = {
  root: true,
  env: {
    browser: true,
    node: true,
    es2022: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'prettier',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
    project: './tsconfig.json',
  },
  plugins: ['@typescript-eslint', 'react', 'react-hooks', 'prettier'],
  rules: {
    'prettier/prettier': 'error',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/explicit-function-return-type': 'off',
    'react/react-in-jsx-scope': 'off',
    'react/prop-types': 'off',
  },
  settings: {
    react: {
      version: 'detect',
    },
  },
  overrides: [
    {
      files: ['*.test.ts', '*.test.tsx', '*.spec.ts', '*.spec.tsx'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
      },
    },
  ],
}
```

```json
// .prettierrc
{
  "semi": false,
  "singleQuote": true,
  "trailingComma": "es5",
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

### 5.4 Xvfb Configuration for Headless CI

**Script: `scripts/test-headless.sh`**

```bash
#!/bin/bash
set -euo pipefail

# Start Xvfb (virtual framebuffer)
export DISPLAY=':99.0'
Xvfb :99 -screen 0 1024x768x24 > /dev/null 2>&1 &
XVFB_PID=$!

# Cleanup on exit
trap "kill $XVFB_PID || true" EXIT

# Wait for Xvfb to be ready
sleep 2

# Run tests
npm run test:e2e

# Cleanup happens automatically via trap
```

**Alternative: Use xvfb-run (simpler)**

```yaml
# .github/workflows/ci.yml
- name: Run E2E Tests
  run: xvfb-run --auto-servernum npm run test:e2e
  env:
    CI: true
```

**Sources:**

- [Testing on Headless CI | Electron Docs](https://github.com/electron/electron/blob/main/docs/tutorial/testing-on-headless-ci.md)

---

## 6. Implementation Roadmap

### Phase 1: Foundation (Week 1-2)

**Goal:** Basic testing infrastructure.

- [ ] Install Vitest, Playwright, testing libraries
- [ ] Configure `vitest.config.ts` with coverage thresholds
- [ ] Set up test directory structure (`tests/unit`, `tests/integration`, `e2e`)
- [ ] Create test setup files (mock Electron APIs, native modules)
- [ ] Write first 10 unit tests for critical utilities
- [ ] Configure ESLint + Prettier
- [ ] Set up Husky + lint-staged

**Deliverable:** 20% test coverage, pre-commit hooks working.

### Phase 2: Core Testing (Week 3-4)

**Goal:** Comprehensive unit and component tests.

- [ ] Write unit tests for all tRPC controllers (target: 80% coverage)
- [ ] Write component tests for critical UI (Dashboard, MCP Manager, Terminal)
- [ ] Add snapshot tests for layout components
- [ ] Configure ELECTRON_RUN_AS_NODE for main process tests
- [ ] Write integration tests for IPC communication
- [ ] Set up GitHub Actions workflow (fast-checks job)

**Deliverable:** 60% test coverage, CI running on PRs.

### Phase 3: E2E Testing (Week 5-6)

**Goal:** End-to-end test coverage.

- [ ] Configure Playwright for Electron
- [ ] Write E2E tests for critical workflows:
  - [ ] App startup and dashboard load
  - [ ] MCP server enable/disable
  - [ ] Session transcript viewing
  - [ ] Agent spawning and monitoring
  - [ ] Terminal interaction
- [ ] Set up xvfb for headless CI
- [ ] Add visual regression tests (Playwright screenshots)
- [ ] Configure integration-tests job in GitHub Actions

**Deliverable:** 5-10 E2E tests covering critical paths, CI running E2E.

### Phase 4: CI/CD Automation (Week 7-8)

**Goal:** Full CI/CD pipeline with releases.

- [ ] Set up cross-platform build matrix (Linux, macOS, Windows)
- [ ] Configure electron-builder for all platforms
- [ ] Set up code signing (macOS, Windows)
- [ ] Configure macOS notarization
- [ ] Add Snap/deb/AppImage builds for Linux
- [ ] Configure release-please for changelog automation
- [ ] Test full release workflow on staging branch

**Deliverable:** Automated releases with signed binaries.

### Phase 5: Quality Gates (Week 9-10)

**Goal:** Enterprise-grade quality assurance.

- [ ] Configure Renovate for automated dependency updates
- [ ] Set up branch protection rules on GitHub
- [ ] Add CODEOWNERS file for mandatory reviews
- [ ] Configure CodeCov for coverage visualization
- [ ] Add breaking change detection (API Extractor or custom)
- [ ] Set up Percy or Chromatic for visual regression (optional)
- [ ] Document testing guidelines for contributors

**Deliverable:** 80%+ coverage, automated quality gates, zero manual release steps.

### Phase 6: Optimization (Week 11-12)

**Goal:** Performance and reliability.

- [ ] Analyze and optimize slow tests
- [ ] Add parallelization where possible
- [ ] Configure test caching in CI
- [ ] Add retry logic for flaky tests
- [ ] Set up test result archiving
- [ ] Create test dashboard (TestRail, ReportPortal, or custom)
- [ ] Performance testing for Electron startup time

**Deliverable:** CI runs in <10 minutes, zero flaky tests.

---

## 7. Sources

### Testing Strategy

- [What unit test coverage percentage should teams aim for? | TechTarget](https://www.techtarget.com/searchsoftwarequality/tip/What-unit-test-coverage-percentage-should-teams-aim-for)
- [Minimum Acceptable Code Coverage | Bullseye](https://www.bullseye.com/minimum.html)
- [Code Coverage Best Practices | Google Testing Blog](https://testing.googleblog.com/2020/08/code-coverage-best-practices.html)
- [Testing Electron apps with Playwright | Simon Willison's TILs](https://til.simonwillison.net/electron/testing-electron-playwright)
- [Automated Testing | Electron](https://www.electronjs.org/docs/latest/tutorial/automated-testing)
- [Vitest vs Playwright | BrowserStack](https://www.browserstack.com/guide/vitest-vs-playwright)

### Electron-Specific Testing

- [Vitest Discussion: Electron and native modules | GitHub](https://github.com/vitest-dev/vitest/discussions/2142)
- [electron-mocha | npm](https://www.npmjs.com/package/electron-mocha)
- [Native Node Modules | Electron Docs](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules)
- [Testing Electron Apps with Playwright — Kubeshop | Medium](https://medium.com/kubeshop-i/testing-electron-apps-with-playwright-kubeshop-839ff27cf376)

### tRPC Integration

- [electron-trpc Documentation](https://electron-trpc.dev/getting-started/)
- [Using React and tRPC with Electron | Fun to Imagine](https://www.funtoimagine.com/blog/using-react-trpc-electron/)
- [electron-prisma-trpc-example | GitHub](https://github.com/awohletz/electron-prisma-trpc-example)

### Visual Regression

- [Visual testing with Playwright | Chromatic](https://www.chromatic.com/blog/how-to-visual-test-ui-using-playwright/)
- [Playwright Visual Testing Guide | Codoid](https://codoid.com/automation-testing/playwright-visual-testing-a-comprehensive-guide-to-ui-regression/)
- [Percy vs Chromatic | Medium](https://medium.com/@crissyjoshua/percy-vs-chromatic-which-visual-regression-testing-tool-to-use-6cdce77238dc)

### Snapshot Testing

- [Snapshot Testing Guide | Vitest](https://vitest.dev/guide/snapshot)
- [Effective Snapshot Testing | Kent C. Dodds](https://kentcdodds.com/blog/effective-snapshot-testing)
- [JavaScript testing with Snapshots | Wanago.io](https://wanago.io/2024/04/08/javascript-testing-snapshots-react-jest-vitest/)

### CI/CD

- [Electron Builder Action | GitHub Marketplace](https://github.com/marketplace/actions/electron-builder-action)
- [Signing Electron Apps with GitHub Actions | Ship Shape](https://shipshape.io/blog/signing-electron-apps-with-github-actions/)
- [Electron Playwright E2E Test Quick Start | GitHub](https://github.com/tanshuai/electron-playwright-e2e-test-quick-start)
- [Testing on Headless CI | Electron Docs](https://github.com/electron/electron/blob/main/docs/tutorial/testing-on-headless-ci.md)
- [Code Signing | Electron Docs](https://github.com/electron/electron/blob/main/docs/tutorial/code-signing.md)

### Quality Gates

- [Getting started with Husky and lint-staged | Medium](https://duncanlew.medium.com/getting-started-with-husky-and-lint-staged-for-pre-commit-hooks-c2764d8c9ae)
- [Run TypeScript type check in pre-commit hook | DEV](https://dev.to/samueldjones/run-a-typescript-type-check-in-your-pre-commit-hook-using-lint-staged-husky-30id)
- [Renovate vs Dependabot | TurboStarter](https://www.turbostarter.dev/blog/renovate-vs-dependabot-whats-the-best-tool-to-automate-your-dependency-updates)
- [Automate Dependency Updates | Medium](https://medium.com/@maruthim152/automation-of-dependency-updates-using-renovate-b768d2d1552e)

### Changelog Automation

- [semantic-release | GitHub](https://github.com/semantic-release/semantic-release)
- [Using semantic-release | LogRocket](https://blog.logrocket.com/using-semantic-release-automate-releases-changelogs/)
- [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)

### Breaking Change Detection

- [TypeScript Breaking Change Detector | GitHub](https://github.com/arminyahya/typescript-breaking-change-detector)
- [State of TypeScript 2026 | DevNewsletter](https://devnewsletter.com/p/state-of-typescript-2026)
- [How to test a TypeScript API for Breaking Changes | Lost in Time](https://lostintime.dev/2021/01/02/typescript-api-breaking-changes.html)

---

## Appendix: Quick Reference

### NPM Scripts

```json
{
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "lint": "eslint . --ext .ts,.tsx --max-warnings 0",
    "lint:fix": "eslint . --ext .ts,.tsx --fix",
    "format": "prettier --write \"src/**/*.{ts,tsx,json,css}\"",
    "typecheck": "tsc --noEmit",
    "test": "vitest",
    "test:run": "vitest run",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:e2e:headed": "playwright test --headed",
    "package": "electron-builder --publish never",
    "release": "electron-builder --publish always",
    "prepare": "husky"
  }
}
```

### Environment Variables

```bash
# Testing
CI=true                      # Enable CI mode
ELECTRON_RUN_AS_NODE=true    # Run tests through Electron Node
DISPLAY=:99                  # Xvfb display for headless

# Code Signing (macOS)
APPLE_ID=user@example.com
APPLE_ID_PASSWORD=xxxx-xxxx-xxxx-xxxx
APPLE_TEAM_ID=XXXXXXXXXX

# Code Signing (Windows)
CSC_LINK=/path/to/cert.pfx
CSC_KEY_PASSWORD=password

# Release
GH_TOKEN=ghp_xxxxxxxxxxxx
```

### Test File Naming Conventions

```
src/
  renderer/
    components/
      Dashboard.tsx
      Dashboard.test.tsx       # Component test
      Dashboard.spec.tsx       # Alternative naming
  main/
    services/
      mcp-manager.ts
      mcp-manager.test.ts      # Unit test

tests/
  unit/                        # Pure unit tests
  integration/                 # Integration tests
    trpc-router.test.ts
  fixtures/                    # Test data

e2e/
  dashboard.spec.ts            # E2E tests
  agents.spec.ts
```

### Coverage Badges

Add to README.md:

```markdown
[![Tests](https://github.com/yourorg/claude-pilot/actions/workflows/ci.yml/badge.svg)](https://github.com/yourorg/claude-pilot/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/yourorg/claude-pilot/branch/master/graph/badge.svg)](https://codecov.io/gh/yourorg/claude-pilot)
```

---

**End of Document**
