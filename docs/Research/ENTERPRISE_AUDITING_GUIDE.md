# Enterprise Auditing Guide for Claude Pilot

**Comprehensive Enterprise-Grade Auditing Tools & Best Practices**
_Research Date: January 2026_

---

## Executive Summary

This guide provides comprehensive enterprise-grade auditing tools, methodologies, and best practices for Claude Pilot (Electron + React + TypeScript + tRPC + node-pty). The goal is to ensure 100% functional coverage and production-readiness for SOC 2 compliance.

**Key Focus Areas:**

1. Security Auditing (SAST, Dependency Scanning, IPC Security)
2. Code Quality & Testing (Coverage, E2E, Performance, Accessibility)
3. Runtime Monitoring (Crash Reporting, Performance, Analytics)
4. Build & Release (Code Signing, Auto-Update, SBOM, Reproducibility)
5. Compliance & Standards (SOC 2, GDPR, Enterprise Deployment)

---

## 1. Security Auditing

### 1.1 Static Application Security Testing (SAST)

#### **Electron-Specific Tools**

##### **ElectroNG** (Premium)

- **Description**: Premium SAST tool specifically for Electron applications
- **Developer**: Doyensec
- **Features**:
  - 50+ checks for Electron-specific vulnerabilities
  - Dynamic version detection (auto-adjusts for Electron API changes)
  - Enterprise-grade with consulting support
- **Use Case**: Individual developers to large enterprises
- **Link**: [Doyensec ElectroNG Launch](https://blog.doyensec.com/2022/09/06/electrong-launch.html)

##### **Electronegativity** (Open Source)

- **NPM Package**: `@doyensec/electronegativity`
- **GitHub**: [doyensec/electronegativity](https://github.com/doyensec/electronegativity)
- **Features**:
  - AST/DOM parsing for security anti-patterns
  - Modular, extensible checks
  - GitHub Action integration (SARIF output)
  - Free and open source
- **Installation**:
  ```bash
  npm install -g @doyensec/electronegativity
  electronegativity --input /path/to/app --output report.sarif
  ```
- **CI/CD Integration**:
  ```yaml
  # .github/workflows/security.yml
  - uses: doyensec/electronegativity@v1
    with:
      input: ./
      output: electronegativity.sarif
  - uses: github/codeql-action/upload-sarif@v2
    with:
      sarif_file: electronegativity.sarif
  ```

#### **General SAST Platforms**

| Tool          | Type          | Best For                              | License                               |
| ------------- | ------------- | ------------------------------------- | ------------------------------------- |
| **CodeQL**    | Query-based   | GitHub integration, semantic analysis | Commercial (GitHub Advanced Security) |
| **Semgrep**   | Pattern-based | Fast, customizable rules, CI/CD       | Open Source + Commercial              |
| **SonarQube** | Code quality  | Quality + Security combined           | Open Source + Commercial              |
| **Checkmarx** | Enterprise    | Large orgs, governance                | Commercial                            |
| **Cycode**    | AI-Native     | Real-time, multi-file analysis        | Commercial                            |
| **Fortify**   | Enterprise    | Security assurance, compliance        | Commercial                            |

**Recommended Stack for Claude Pilot:**

```json
{
  "primary": "@doyensec/electronegativity",
  "ci_cd": "semgrep",
  "github": "codeql",
  "quality": "sonarqube"
}
```

**Implementation:**

```bash
# Install Semgrep
npm install -D @semgrep/cli

# Create semgrep.yml
cat > .semgrep.yml << 'EOF'
rules:
  - id: electron-node-integration
    patterns:
      - pattern: nodeIntegration: true
    message: nodeIntegration should be disabled
    severity: ERROR
    languages: [typescript, javascript]
EOF

# Run in CI
npx semgrep --config=p/security-audit --config=.semgrep.yml src/
```

### 1.2 Dependency Vulnerability Scanning

#### **Tool Comparison**

| Tool           | Detection Rate             | Auto-Fix             | CI/CD         | License           |
| -------------- | -------------------------- | -------------------- | ------------- | ----------------- |
| **npm audit**  | Baseline (false positives) | No                   | Built-in      | Free              |
| **Snyk**       | High (better than npm)     | Yes (PR auto-open)   | Yes           | Free + Commercial |
| **Dependabot** | Good                       | Yes (PR auto-create) | GitHub        | Free              |
| **Renovate**   | Good                       | Yes                  | All platforms | Free              |
| **Socket.dev** | Supply chain focused       | No                   | Yes           | Commercial        |

**Best Practice: Layered Approach**

```bash
# 1. npm audit (baseline check)
npm audit --audit-level=high

# 2. Snyk (comprehensive scan)
npx snyk test --all-projects --severity-threshold=medium

# 3. Dependabot (GitHub native)
# Enable in .github/dependabot.yml

# 4. Snyk auto-fix
npx snyk fix
```

**CI/CD Configuration:**

```yaml
# .github/workflows/security-scan.yml
name: Security Scan
on: [push, pull_request]

jobs:
  snyk:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
        with:
          args: --all-projects --severity-threshold=high
      - uses: github/codeql-action/upload-sarif@v2
        if: always()
        with:
          sarif_file: snyk.sarif
```

**Enterprise Policy:**

```json
// .snyk
{
  "version": "v1.22.1",
  "ignore": {},
  "patch": {},
  "language-settings": {
    "node": {
      "packageManager": "npm",
      "autoUpdate": "patch"
    }
  },
  "failThreshold": "medium",
  "disableAnalytics": true
}
```

### 1.3 CSP and Sandbox Configuration Auditing

#### **Content Security Policy Best Practices**

**Secure CSP for Electron:**

```typescript
// src/main/index.ts
import { session } from 'electron'

session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
  callback({
    responseHeaders: {
      ...details.responseHeaders,
      'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'", // Required for styled-components
        "img-src 'self' data: https:",
        "font-src 'self' data:",
        "connect-src 'self' ws://localhost:* http://localhost:*",
        "media-src 'none'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
      ].join('; '),
    },
  })
})
```

**CSP with Nonce (for server-rendered HTML):**

```typescript
// Generate unique nonce per response
import crypto from 'crypto'

function generateNonce() {
  return crypto.randomBytes(16).toString('base64')
}

// In BrowserWindow setup
const nonce = generateNonce()
mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
  callback({
    responseHeaders: {
      ...details.responseHeaders,
      'Content-Security-Policy': [`script-src 'self' 'nonce-${nonce}'`],
    },
  })
})
```

**⚠️ Critical Warning**: Never hardcode nonces in webpack builds - every user would have the same nonce, making bypass trivial.

#### **Sandbox Configuration Audit**

**Recommended Secure Configuration (Electron 20+ defaults):**

```typescript
// src/main/index.ts
import { BrowserWindow } from 'electron'

const mainWindow = new BrowserWindow({
  width: 1200,
  height: 800,
  webPreferences: {
    // Security hardening
    nodeIntegration: false, // ✅ Default in Electron 5+
    contextIsolation: true, // ✅ Default in Electron 12+
    sandbox: true, // ✅ Default in Electron 20+
    webSecurity: true, // ✅ Default
    allowRunningInsecureContent: false, // ✅ Default
    experimentalFeatures: false, // ✅ Default

    // Preload script (only way to expose APIs)
    preload: path.join(__dirname, 'preload.js'),
  },
})
```

**Audit Tool for Configuration:**

```bash
# Electronegativity automatically checks these
npx @doyensec/electronegativity --input ./dist --checks ELECTRON_SECURITY_CONFIG
```

**Manual Audit Checklist:**

```typescript
// scripts/audit-security-config.ts
import { glob } from 'glob'
import { readFileSync } from 'fs'

const files = glob.sync('src/**/*.{ts,js}')
const violations: string[] = []

files.forEach((file) => {
  const content = readFileSync(file, 'utf-8')

  // Check for dangerous patterns
  if (/nodeIntegration:\s*true/.test(content)) {
    violations.push(`${file}: nodeIntegration: true`)
  }
  if (/contextIsolation:\s*false/.test(content)) {
    violations.push(`${file}: contextIsolation: false`)
  }
  if (/sandbox:\s*false/.test(content)) {
    violations.push(`${file}: sandbox: false`)
  }
  if (/webSecurity:\s*false/.test(content)) {
    violations.push(`${file}: webSecurity: false`)
  }
})

if (violations.length > 0) {
  console.error('Security violations found:')
  violations.forEach((v) => console.error(`  - ${v}`))
  process.exit(1)
}
```

### 1.4 IPC Security Analysis

#### **Automated IPC Security Tools**

##### **Inspectron**

- **Description**: Black-box auditing tool with instrumented Electron versions
- **Features**:
  - IPC flow analysis
  - Page navigation tracking
  - Cross-context JavaScript execution monitoring
- **Methodology**: Compiled 14 Electron versions with modified APIs for instrumentation
- **Reference**: [USENIX Security '24](https://www.usenix.org/system/files/sec24summer-prepub-120-ali.pdf)

##### **Bananatron**

- **GitHub**: Open source black-box framework
- **Results**: Audited 112 popular Electron apps, found real-world vulnerabilities
- **Focus**: Context isolation bypass, IPC validation gaps

#### **Manual IPC Audit Checklist**

```typescript
// Good: Origin validation + Schema validation
ipcMain.handle('database:query', async (event, args) => {
  // 1. Validate origin
  const url = event.sender.getURL()
  if (!url.startsWith('file://') && !url.startsWith('app://')) {
    throw new Error('Unauthorized IPC origin')
  }

  // 2. Validate args with Zod
  const schema = z.object({
    query: z.string().max(1000),
    params: z.array(z.any()).max(10),
  })
  const validated = schema.parse(args)

  // 3. Execute safely
  return database.query(validated.query, validated.params)
})

// Bad: No validation
ipcMain.handle('database:query', async (event, args) => {
  return database.query(args.query, args.params) // ❌ SQL injection risk
})
```

**Automated IPC Audit Script:**

```bash
# Grep for dangerous patterns
grep -r "ipcMain\\.handle\|ipcMain\\.on" src/main --include="*.ts" | \
  while read line; do
    # Extract handler name
    handler=$(echo "$line" | grep -oP "ipcMain\\.(handle|on)\\('\\K[^']+")

    # Check if handler validates event.sender
    if ! grep -A 20 "$handler" src/main -r | grep -q "event\.sender\.getURL()"; then
      echo "⚠️  Missing origin validation: $handler"
    fi

    # Check if handler validates args
    if ! grep -A 20 "$handler" src/main -r | grep -q "z\."; then
      echo "⚠️  Missing schema validation: $handler"
    fi
  done
```

#### **ContextBridge Security**

**Secure Pattern:**

```typescript
// preload/index.ts
import { contextBridge, ipcRenderer } from 'electron'

// Good: Strip event object, only pass data
contextBridge.exposeInMainWorld('electronAPI', {
  // ✅ Callback strips event
  onUpdateCounter: (callback: (value: number) => void) =>
    ipcRenderer.on('update-counter', (_event, value) => callback(value)),

  // ✅ Validated input, typed output
  queryDatabase: (query: string) => ipcRenderer.invoke('database:query', { query }),
})

// Bad: Exposes event object
contextBridge.exposeInMainWorld('electronAPI', {
  // ❌ Event object can be exploited
  onUpdateCounter: (callback) => ipcRenderer.on('update-counter', callback),
})
```

**Known Vulnerabilities:**

- Context isolation bypass (CVE-2023-XXXXX)
- Exploit: APIs returning non-serializable objects (e.g., canvas rendering context)
- Mitigation: Ensure all contextBridge returns are JSON-serializable

### 1.5 Native Module Security

#### **Security Risks**

| Module Type         | Risk Level | Mitigation                                          |
| ------------------- | ---------- | --------------------------------------------------- |
| node-pty (terminal) | HIGH       | Validate all shell commands, no user input in exec  |
| better-sqlite3      | MEDIUM     | Parameterized queries only, no string concatenation |
| Native bindings     | HIGH       | Audit C++ source, check for memory safety           |
| Electron rebuild    | MEDIUM     | Ensure rebuild matches Electron ABI version         |

#### **Audit Native Modules:**

```bash
# List all native modules
npm ls --depth=0 --parseable | xargs npm ls --depth=0 --json | \
  jq -r '.dependencies | to_entries[] | select(.value.dependencies != null) | .key'

# Check for unsafe syscalls (Linux)
strace -f -e trace=process,file,network npm start 2>&1 | \
  grep -E "execve|open|socket|connect"

# Audit node-pty usage
grep -r "spawn\|exec" src/ --include="*.ts" | \
  grep -v "// Audited:" && \
  echo "⚠️  Found unaudited spawn/exec calls"
```

**Secure node-pty Usage:**

```typescript
// Good: Validated, restricted shell
import { spawn } from 'node-pty'
import { z } from 'zod'

const allowedCommands = ['ls', 'git', 'npm', 'claude']

function createTerminal(command: string) {
  // 1. Validate command is in allowlist
  const cmd = command.split(' ')[0]
  if (!allowedCommands.includes(cmd)) {
    throw new Error(`Command not allowed: ${cmd}`)
  }

  // 2. Spawn with restricted environment
  const pty = spawn(cmd, [], {
    name: 'xterm-256color',
    cols: 80,
    rows: 30,
    cwd: process.env.HOME,
    env: {
      ...process.env,
      PATH: '/usr/bin:/bin', // Restrict PATH
    },
  })

  return pty
}

// Bad: Arbitrary command execution
function createTerminal(command: string) {
  return spawn(command, [], {
    /* ... */
  }) // ❌ Command injection risk
}
```

---

## 2. Code Quality & Testing

### 2.1 Test Coverage Requirements

#### **Enterprise Coverage Targets**

| Component        | Unit Coverage | Integration Coverage | E2E Coverage |
| ---------------- | ------------- | -------------------- | ------------ |
| tRPC Controllers | 90%+          | 80%+                 | -            |
| React Components | 80%+          | -                    | 70%+         |
| IPC Handlers     | 95%+          | 90%+                 | -            |
| Critical Paths   | 100%          | 100%                 | 100%         |

**Critical Paths Include:**

- Credential storage (`pass` integration)
- Session transcript parsing
- MCP server management
- Auto-update mechanism

#### **Coverage Tools**

```bash
# Install coverage tools
npm install -D vitest @vitest/coverage-v8 @vitest/ui

# Configure vitest.config.ts
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      all: true,
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.spec.{ts,tsx}',
        'src/**/*.test.{ts,tsx}',
        'src/types/**',
        'src/**/*.d.ts'
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80
      }
    }
  }
})

# Run coverage
npm run test:coverage
```

#### **Coverage Enforcement in CI:**

```yaml
# .github/workflows/test.yml
name: Test Coverage
on: [push, pull_request]

jobs:
  coverage:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run test:coverage

      # Fail if coverage drops below threshold
      - name: Check coverage thresholds
        run: |
          COVERAGE=$(jq '.total.lines.pct' coverage/coverage-summary.json)
          if (( $(echo "$COVERAGE < 80" | bc -l) )); then
            echo "Coverage $COVERAGE% is below 80% threshold"
            exit 1
          fi

      # Upload to Codecov
      - uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
          flags: unittests
          fail_ci_if_error: true
```

### 2.2 E2E Testing with Playwright

#### **Why Playwright for Electron?**

- **Spectron is deprecated** (only supports Electron ≤13, no active maintainers)
- **Playwright is the official recommendation** (Electron docs use Playwright 1.52.0)
- **Microsoft-maintained**, TypeScript-native, CDP support

#### **Setup Playwright for Electron**

```bash
# Install Playwright
npm install -D @playwright/test playwright

# Install Electron testing helpers
npm install -D @playwright/test electron
```

**Playwright Configuration:**

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test'
import path from 'path'

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  fullyParallel: false, // Electron apps run one at a time
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Electron can't run multiple instances
  reporter: [['html'], ['junit', { outputFile: 'test-results/junit.xml' }]],
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'electron',
      testMatch: /.*\.spec\.ts/,
    },
  ],
})
```

**Example E2E Test:**

```typescript
// e2e/dashboard.spec.ts
import { test, expect, _electron as electron } from '@playwright/test'
import path from 'path'

test.describe('Dashboard', () => {
  test('should display system status', async () => {
    // Launch Electron app
    const app = await electron.launch({
      args: [path.join(__dirname, '../dist-electron/main.js')],
      env: {
        ...process.env,
        NODE_ENV: 'test',
      },
    })

    // Wait for window
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    // Navigate to dashboard
    await window.click('[data-testid="nav-dashboard"]')

    // Verify system status card
    const statusCard = window.locator('[data-testid="system-status-card"]')
    await expect(statusCard).toBeVisible()

    // Verify metrics
    const cpuMetric = window.locator('[data-testid="metric-cpu"]')
    await expect(cpuMetric).toContainText(/\d+%/)

    // Cleanup
    await app.close()
  })

  test('should handle MCP server toggle', async () => {
    const app = await electron.launch({
      args: [path.join(__dirname, '../dist-electron/main.js')],
    })

    const window = await app.firstWindow()

    // Navigate to MCP settings
    await window.click('[data-testid="nav-mcp"]')

    // Toggle server
    const toggle = window.locator('[data-testid="mcp-server-toggle-memory-keeper"]')
    await toggle.click()

    // Verify status change
    await expect(toggle).toHaveAttribute('aria-checked', 'true')

    await app.close()
  })
})
```

**Migration from Spectron:**

```typescript
// Before (Spectron)
const app = new Application({
  path: electronPath,
  args: [path.join(__dirname, '..')],
})
await app.start()
await app.client.waitUntilWindowLoaded()

// After (Playwright)
const app = await electron.launch({
  args: [path.join(__dirname, '../dist-electron/main.js')],
})
const window = await app.firstWindow()
await window.waitForLoadState('domcontentloaded')
```

#### **Enterprise E2E Testing Strategy**

**Coverage Goals:**

1. **Quick feedback**: App starts, no script errors, authentication works
2. **Critical paths**: User workflows (create session, view memory, run command)
3. **Edge cases**: Network failures, IPC errors, crash recovery

**Challenges:**

- Comprehensive E2E requires dedicated teams (months of initial dev, 80% ongoing maintenance)
- Focus on high-value tests, not 100% coverage

### 2.3 Performance Profiling

#### **Chrome DevTools Integration**

```typescript
// Enable DevTools in production builds (with env flag)
if (process.env.ENABLE_DEVTOOLS === 'true') {
  mainWindow.webContents.openDevTools({ mode: 'detach' })
}

// Remote debugging
app.commandLine.appendSwitch('remote-debugging-port', '9222')
// Connect via chrome://inspect
```

#### **Memory Leak Detection**

**Tools:**

1. **Chrome DevTools Memory Tab**:
   - Heap snapshots
   - Allocation timeline
   - Detached DOM trees
2. **Node.js Profiling**:
   ```bash
   node --cpu-prof --heap-prof dist-electron/main.js
   # Generates .cpuprofile and .heapprofile
   # Analyze in Chrome DevTools Performance/Memory tabs
   ```

**Detection Indicators:**

- RSS (Resident Set Size) grows but heap doesn't → native memory leak
- Detached DOM nodes → event listeners not cleaned up
- Steady increase without GC drops → retained objects

**Example Leak Detection Script:**

```typescript
// scripts/memory-leak-test.ts
import { _electron as electron } from '@playwright/test'

async function detectMemoryLeak() {
  const app = await electron.launch({
    args: ['./dist-electron/main.js'],
  })

  const window = await app.firstWindow()
  const initialMemory = await window.evaluate(() => performance.memory.usedJSHeapSize)

  // Simulate 100 interactions
  for (let i = 0; i < 100; i++) {
    await window.click('[data-testid="refresh-button"]')
    await window.waitForTimeout(100)
  }

  // Force GC (requires --expose-gc)
  await window.evaluate(() => {
    if (global.gc) global.gc()
  })

  const finalMemory = await window.evaluate(() => performance.memory.usedJSHeapSize)
  const growth = ((finalMemory - initialMemory) / initialMemory) * 100

  console.log(`Memory growth: ${growth.toFixed(2)}%`)
  if (growth > 20) {
    console.error('⚠️  Potential memory leak detected')
    process.exit(1)
  }

  await app.close()
}

detectMemoryLeak()
```

### 2.4 Accessibility Auditing (WCAG Compliance)

#### **Tools Comparison**

| Tool            | Coverage        | Integration         | Best For                      |
| --------------- | --------------- | ------------------- | ----------------------------- |
| **axe-core**    | 57% WCAG issues | Browser, Playwright | Comprehensive, clear reports  |
| **Pa11y**       | Baseline        | CLI, CI/CD          | Fast, simple, headless Chrome |
| **Pa11y + axe** | Combined        | Both runners        | Best of both worlds           |
| **Lighthouse**  | Good            | Chrome DevTools, CI | Performance + Accessibility   |

#### **Implementation**

**Install Tools:**

```bash
npm install -D axe-core axe-playwright pa11y
```

**Playwright + axe-core:**

```typescript
// e2e/accessibility.spec.ts
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test.describe('Accessibility', () => {
  test('should not have accessibility violations on dashboard', async ({ page }) => {
    await page.goto('http://localhost:5173')

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze()

    expect(accessibilityScanResults.violations).toEqual([])
  })

  test('should support keyboard navigation', async ({ page }) => {
    await page.goto('http://localhost:5173')

    // Tab through interactive elements
    await page.keyboard.press('Tab')
    const firstFocus = await page.evaluate(() => document.activeElement?.tagName)
    expect(firstFocus).toBe('BUTTON')

    // Verify focus visible
    const focusVisible = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement
      return window.getComputedStyle(el).outlineWidth !== '0px'
    })
    expect(focusVisible).toBe(true)
  })
})
```

**Pa11y in CI:**

```bash
# Install Pa11y
npm install -D pa11y-ci

# Create .pa11yci.json
cat > .pa11yci.json << 'EOF'
{
  "defaults": {
    "standard": "WCAG2AA",
    "runners": ["axe", "htmlcs"],
    "timeout": 10000,
    "chromeLaunchConfig": {
      "headless": true
    }
  },
  "urls": [
    "http://localhost:5173/",
    "http://localhost:5173/dashboard",
    "http://localhost:5173/mcp",
    "http://localhost:5173/settings"
  ]
}
EOF

# Run in CI
npx pa11y-ci --config .pa11yci.json
```

**Combined axe + Pa11y:**

```javascript
// accessibility-audit.js
const pa11y = require('pa11y')

pa11y('http://localhost:5173', {
  runners: ['htmlcs', 'axe'],
}).then((results) => {
  if (results.issues.length > 0) {
    console.error('Accessibility violations:')
    results.issues.forEach((issue) => {
      console.error(`  - ${issue.message} (${issue.code})`)
    })
    process.exit(1)
  }
})
```

#### **WCAG 2.1 AA Checklist for Claude Pilot**

- [ ] **Perceivable**:
  - [ ] Text alternatives for images (`alt` attributes)
  - [ ] Color contrast ≥ 4.5:1 for normal text, ≥ 3:1 for large text
  - [ ] Content not solely conveyed by color
  - [ ] Audio controls for sound that plays automatically

- [ ] **Operable**:
  - [ ] All functionality keyboard accessible
  - [ ] No keyboard traps
  - [ ] Skip navigation links
  - [ ] Descriptive page titles
  - [ ] Focus visible (outline on `:focus`)

- [ ] **Understandable**:
  - [ ] Language of page defined (`<html lang="en">`)
  - [ ] Consistent navigation
  - [ ] Clear form labels and error messages

- [ ] **Robust**:
  - [ ] Valid HTML (passes W3C validator)
  - [ ] ARIA roles used correctly
  - [ ] Compatible with assistive technologies

---

## 3. Runtime Monitoring

### 3.1 Crash Reporting and Error Tracking

#### **Sentry for Electron**

**Installation:**

```bash
npm install @sentry/electron
```

**Main Process Setup:**

```typescript
// src/main/index.ts
import * as Sentry from '@sentry/electron/main'

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'production',
  release: `claude-pilot@${app.getVersion()}`,

  // Performance monitoring
  tracesSampleRate: 1.0,

  // Filter sensitive data
  beforeSend(event) {
    // Remove PII
    if (event.user) {
      delete event.user.email
      delete event.user.ip_address
    }

    // Scrub credentials from breadcrumbs
    if (event.breadcrumbs) {
      event.breadcrumbs = event.breadcrumbs.map((crumb) => {
        if (crumb.message?.includes('password')) {
          return { ...crumb, message: '[Filtered]' }
        }
        return crumb
      })
    }

    return event
  },

  // Source maps (upload separately)
  integrations: [new Sentry.Integrations.Electron()],
})
```

**Renderer Process Setup:**

```typescript
// src/renderer/main.tsx
import * as Sentry from '@sentry/electron/renderer'

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'production',
  release: `claude-pilot@${__APP_VERSION__}`,

  integrations: [
    new Sentry.BrowserTracing({
      routingInstrumentation: Sentry.reactRouterV6Instrumentation(
        React.useEffect,
        useLocation,
        useNavigationType,
        createRoutesFromChildren,
        matchRoutes
      ),
    }),
  ],

  tracesSampleRate: 1.0,
})
```

**Native Crash Reports (Minidumps):**

```typescript
// Electron's crashpad integration (automatic)
import { crashReporter } from 'electron'

crashReporter.start({
  productName: 'Claude Pilot',
  companyName: 'Your Company',
  submitURL: process.env.SENTRY_DSN, // Sentry ingests minidumps
  uploadToServer: true,
  compress: true,
})
```

**Source Maps Upload:**

```bash
# Install Sentry CLI
npm install -D @sentry/cli

# Configure .sentryclirc
cat > .sentryclirc << EOF
[defaults]
url=https://sentry.io/
org=your-org
project=claude-pilot

[auth]
token=YOUR_AUTH_TOKEN
EOF

# Upload source maps after build
npx sentry-cli sourcemaps upload \
  --release claude-pilot@$(node -p "require('./package.json').version") \
  ./dist
```

**Performance Monitoring:**

```typescript
// Instrument tRPC calls
import * as Sentry from '@sentry/electron/renderer'

const transaction = Sentry.startTransaction({
  op: 'trpc.query',
  name: 'session.list',
})

const result = await trpc.session.list.query()

transaction.finish()
```

### 3.2 Performance Monitoring

#### **Metrics to Track**

| Metric                | Target  | Tool                        |
| --------------------- | ------- | --------------------------- |
| Cold start time       | < 2s    | Custom instrumentation      |
| Hot reload time       | < 500ms | Webpack dev server          |
| Memory usage (idle)   | < 300MB | process.memoryUsage()       |
| Memory usage (active) | < 500MB | Chrome DevTools             |
| IPC latency           | < 50ms  | Performance.now()           |
| FPS (animations)      | 60fps   | Chrome DevTools Performance |

**Custom Performance Tracking:**

```typescript
// src/main/utils/performance.ts
import { performance } from 'perf_hooks'
import * as Sentry from '@sentry/electron/main'

export class PerformanceMonitor {
  private metrics = new Map<string, number>()

  start(name: string) {
    this.metrics.set(name, performance.now())
  }

  end(name: string) {
    const start = this.metrics.get(name)
    if (!start) return

    const duration = performance.now() - start
    this.metrics.delete(name)

    // Log to Sentry
    Sentry.addBreadcrumb({
      category: 'performance',
      message: `${name}: ${duration.toFixed(2)}ms`,
      level: 'info',
    })

    // Warn if slow
    if (duration > 100) {
      console.warn(`⚠️  Slow operation: ${name} took ${duration.toFixed(2)}ms`)
    }

    return duration
  }
}

// Usage
const perf = new PerformanceMonitor()

// Measure app startup
perf.start('app-ready')
app.on('ready', () => {
  perf.end('app-ready')
})

// Measure IPC handlers
ipcMain.handle('database:query', async (event, args) => {
  perf.start('database-query')
  const result = await database.query(args)
  perf.end('database-query')
  return result
})
```

### 3.3 User Analytics (Privacy-Respecting)

#### **Options**

| Tool          | Privacy                            | Self-Hosted | Cost      |
| ------------- | ---------------------------------- | ----------- | --------- |
| **Plausible** | High (GDPR-compliant, no cookies)  | Yes         | Paid      |
| **Umami**     | High (GDPR-compliant, open source) | Yes         | Free      |
| **PostHog**   | Medium (feature flags + analytics) | Yes         | Free tier |
| **Mixpanel**  | Low (requires opt-in)              | No          | Free tier |

**Recommended: Umami (Self-Hosted)**

```bash
# Deploy Umami with Docker
docker run -d \
  -p 3000:3000 \
  --name umami \
  -e DATABASE_URL=postgresql://user:pass@localhost:5432/umami \
  ghcr.io/umami-software/umami:postgresql-latest
```

**Integration:**

```typescript
// src/renderer/lib/analytics.ts
export class Analytics {
  private enabled: boolean

  constructor() {
    // Respect user privacy settings
    this.enabled = localStorage.getItem('analytics-enabled') === 'true'
  }

  trackPageView(path: string) {
    if (!this.enabled) return

    fetch('https://analytics.yourcompany.com/api/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'pageview',
        url: path,
        website: 'claude-pilot',
      }),
    })
  }

  trackEvent(name: string, data?: Record<string, any>) {
    if (!this.enabled) return

    fetch('https://analytics.yourcompany.com/api/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'event',
        event_name: name,
        event_data: data,
        website: 'claude-pilot',
      }),
    })
  }
}

// Usage
const analytics = new Analytics()
analytics.trackPageView('/dashboard')
analytics.trackEvent('mcp_server_enabled', { server: 'memory-keeper' })
```

**Privacy Policy Requirements:**

- Clearly state what data is collected (page views, feature usage)
- Never collect PII (IP anonymization, no cookies)
- Provide opt-out mechanism
- Honor DNT (Do Not Track) headers

---

## 4. Build & Release

### 4.1 Code Signing

#### **Requirements by Platform**

| Platform    | Certificate Type                           | Cost          | Renewal |
| ----------- | ------------------------------------------ | ------------- | ------- |
| **macOS**   | Apple Developer ID                         | $99/year      | Annual  |
| **Windows** | EV Code Signing (required for auto-update) | $300-500/year | Annual  |
| **Linux**   | Optional (GPG signature)                   | Free          | N/A     |

#### **Windows Code Signing**

**Setup (electron-builder):**

```javascript
// electron-builder.yml
win: target: -nsis - portable
sign: './scripts/sign-windows.js'
certificateSubjectName: 'Your Company Inc'
signDlls: true
publisherName: 'Your Company Inc'

nsis: oneClick: false
allowToChangeInstallationDirectory: true
perMachine: true
```

**Cloud-Based Signing (Recommended for CI):**

```bash
# Use DigiCert/Sectigo cloud HSM
export WINDOWS_SIGN_USER="your-username"
export WINDOWS_SIGN_PASSWORD="your-password"
export WINDOWS_SIGN_CERT_SHA1="thumbprint"

npm run build:win
```

**Custom Signing Script:**

```javascript
// scripts/sign-windows.js
const { execSync } = require('child_process')

exports.default = async function (configuration) {
  const signtool = 'C:\\Program Files (x86)\\Windows Kits\\10\\bin\\x64\\signtool.exe'
  const certPath = process.env.WINDOWS_CERT_PATH
  const certPassword = process.env.WINDOWS_CERT_PASSWORD

  // Dual signing (SHA1 + SHA256)
  execSync(
    `"${signtool}" sign /f "${certPath}" /p "${certPassword}" /fd sha256 /tr http://timestamp.digicert.com /td sha256 "${configuration.path}"`
  )
  execSync(
    `"${signtool}" sign /f "${certPath}" /p "${certPassword}" /fd sha1 /t http://timestamp.digicert.com "${configuration.path}"`
  )
}
```

#### **macOS Code Signing**

```javascript
// electron-builder.yml
mac: target: -dmg - zip
category: public.app - category.developer - tools
hardenedRuntime: true
gatekeeperAssess: false
entitlements: build / entitlements.mac.plist
entitlementsInherit: build / entitlements.mac.plist
notarize: teamId: YOUR_TEAM_ID
```

**Entitlements:**

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

**Notarization:**

```bash
# Store credentials
xcrun notarytool store-credentials "AC_PASSWORD" \
  --apple-id "your@email.com" \
  --team-id YOUR_TEAM_ID \
  --password "app-specific-password"

# electron-builder handles notarization automatically
npm run build:mac
```

### 4.2 Auto-Update Security

#### **Security Considerations**

⚠️ **Critical**: Doyensec found signature validation bypass vulnerability in `electron-updater`. Recommendation: Use Electron Forge + Squirrel.

**Secure Auto-Update Configuration:**

```javascript
// src/main/update.ts
import { autoUpdater } from 'electron-updater'
import log from 'electron-log'

// Configure logger
autoUpdater.logger = log
autoUpdater.logger.transports.file.level = 'info'

// Security: Always verify signatures
autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = false

// Update feed (HTTPS required)
autoUpdater.setFeedURL({
  provider: 'github',
  owner: 'your-org',
  repo: 'claude-pilot',
  private: false,
})

// Check for updates
autoUpdater.checkForUpdates()

autoUpdater.on('update-available', (info) => {
  log.info('Update available:', info)

  // Ask user before downloading
  dialog
    .showMessageBox({
      type: 'info',
      title: 'Update Available',
      message: `Version ${info.version} is available. Download now?`,
      buttons: ['Yes', 'No'],
    })
    .then((result) => {
      if (result.response === 0) {
        autoUpdater.downloadUpdate()
      }
    })
})

autoUpdater.on('update-downloaded', (info) => {
  // Verify signature before installing
  dialog
    .showMessageBox({
      type: 'info',
      title: 'Update Ready',
      message: 'Update downloaded. Restart to install?',
      buttons: ['Restart', 'Later'],
    })
    .then((result) => {
      if (result.response === 0) {
        setImmediate(() => autoUpdater.quitAndInstall())
      }
    })
})
```

**Alternative: Minisign for Windows**

```bash
# Generate keypair
minisign -G

# Sign release
minisign -Sm release.exe

# Verify in app
minisign -Vm release.exe -P <public_key>
```

### 4.3 SBOM Generation

#### **Tools**

| Tool                   | Format         | Accuracy                  | Integration |
| ---------------------- | -------------- | ------------------------- | ----------- |
| **cyclonedx-node-npm** | CycloneDX      | High (Level-2 OWASP SCVS) | npm script  |
| **npm sbom**           | SPDX/CycloneDX | Medium                    | Built-in    |
| **Syft**               | SPDX/CycloneDX | High                      | CLI         |

**Implementation:**

```bash
# Install CycloneDX
npm install -D @cyclonedx/cyclonedx-npm

# Generate SBOM
npx @cyclonedx/cyclonedx-npm --output-file sbom.json

# Or use npm native
npm sbom --sbom-format=cyclonedx > sbom.json
```

**CI/CD Integration:**

```yaml
# .github/workflows/sbom.yml
name: Generate SBOM
on:
  release:
    types: [published]

jobs:
  sbom:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci

      # Generate SBOM
      - run: npx @cyclonedx/cyclonedx-npm --output-file sbom.json

      # Attach to release
      - uses: actions/upload-release-asset@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          upload_url: ${{ github.event.release.upload_url }}
          asset_path: ./sbom.json
          asset_name: sbom.json
          asset_content_type: application/json

      # Optional: Upload to dependency-track
      - run: |
          curl -X POST \
            -H "X-Api-Key: ${{ secrets.DEPENDENCY_TRACK_API_KEY }}" \
            -F "project=claude-pilot" \
            -F "bom=@sbom.json" \
            https://dependency-track.yourcompany.com/api/v1/bom
```

### 4.4 Reproducible Builds

#### **Best Practices**

1. **Pin all dependencies**:

   ```json
   // package.json - use exact versions
   {
     "dependencies": {
       "electron": "34.0.0", // Not ^34.0.0
       "react": "19.0.0"
     }
   }
   ```

2. **Lock file integrity**:

   ```bash
   # Commit package-lock.json
   git add package-lock.json

   # Use npm ci in CI (not npm install)
   npm ci
   ```

3. **Deterministic timestamps**:

   ```javascript
   // electron-builder.yml
   buildVersion: '${env.GIT_COMMIT_SHA}'
   ```

4. **Cache dependencies**:

   ```yaml
   # .github/workflows/build.yml
   - uses: actions/cache@v3
     with:
       path: ~/.npm
       key: ${{ runner.os }}-node-${{ hashFiles('package-lock.json') }}
   ```

5. **Use specific Node.js version**:
   ```json
   // package.json
   {
     "engines": {
       "node": "20.11.0",
       "npm": "10.2.4"
     }
   }
   ```

**Verification:**

```bash
# Build twice, compare hashes
npm run build
sha256sum dist/claude-pilot-1.0.0.AppImage > hash1.txt

npm run clean
npm run build
sha256sum dist/claude-pilot-1.0.0.AppImage > hash2.txt

diff hash1.txt hash2.txt # Should be identical
```

---

## 5. Compliance & Standards

### 5.1 SOC 2 Compliance

#### **SOC 2 Requirements for Desktop Apps**

**Trust Service Criteria (TSC):**

| Criterion                | Requirement                 | Implementation                                                                               |
| ------------------------ | --------------------------- | -------------------------------------------------------------------------------------------- |
| **Security** (Mandatory) | Access controls, encryption | - MFA for cloud services<br>- Credentials in GPG-encrypted `pass`<br>- IPC validation        |
| **Availability**         | Uptime, monitoring          | - Crash reporting (Sentry)<br>- Health checks<br>- Auto-update                               |
| **Processing Integrity** | Accurate processing         | - Input validation (Zod schemas)<br>- Error handling<br>- Audit logs                         |
| **Confidentiality**      | Data protection             | - Encryption at rest (SQLCipher)<br>- HTTPS for all network calls<br>- No logging of secrets |
| **Privacy**              | PII handling                | - No PII collection without consent<br>- Data retention policies<br>- User data deletion     |

**Technical Controls:**

1. **Authentication & Access Control**:

   ```typescript
   // Enforce MFA for sensitive operations
   if (operation.isSensitive && !user.mfaVerified) {
     throw new Error('MFA required')
   }
   ```

2. **Encryption**:

   ```typescript
   // Encrypt sensitive data at rest
   import { safeStorage } from 'electron'

   const encrypted = safeStorage.encryptString(secret)
   store.set('credentials', encrypted.toString('base64'))
   ```

3. **Logging & Monitoring**:

   ```typescript
   // Audit log structure
   interface AuditEvent {
     timestamp: Date
     user: string
     action: string
     resource: string
     result: 'success' | 'failure'
     ip?: string // Anonymized
   }

   function logAudit(event: AuditEvent) {
     // Log to secure storage, forward to SIEM
     secureLogger.info(event)
   }
   ```

4. **Vulnerability Management**:
   - Run `npm audit` weekly
   - Apply security patches within 30 days (critical) / 90 days (high)
   - Track in Snyk/Dependabot

**Documentation Requirements:**

- [ ] Information Security Policy (reviewed annually)
- [ ] Incident Response Plan
- [ ] Access Control Policy
- [ ] Data Classification Policy
- [ ] Vendor Management Policy

**Endpoint Security Controls:**

- [ ] Device posture checks (OS version, encryption enabled)
- [ ] Conditional access (block rooted/jailbroken devices)
- [ ] Monitoring and logging (track access, detect anomalies)
- [ ] Periodic compliance checks

### 5.2 GDPR Compliance

#### **GDPR Requirements for Desktop Apps**

**Key Principles:**

1. **Privacy by Design**:
   - Build privacy into architecture from day one
   - Example: Use local storage by default, cloud sync opt-in

2. **Data Minimization**:

   ```typescript
   // Only collect necessary data
   interface UserProfile {
     id: string // Required
     name: string // Required for display
     // email: string // NOT collected unless needed
     // ip: string // NOT collected
   }
   ```

3. **Consent Management**:

   ```typescript
   // First-run consent dialog
   if (!settings.get('gdpr-consent')) {
     const consent = await dialog.showMessageBox({
       type: 'question',
       title: 'Privacy & Data Collection',
       message:
         'We collect anonymized usage data to improve the app. You can opt-out anytime in Settings.',
       buttons: ['Accept', 'Decline'],
       defaultId: 1,
     })

     settings.set('gdpr-consent', consent.response === 0)
   }
   ```

4. **Right to Access**:

   ```typescript
   // Export user data
   ipcMain.handle('user:export-data', async () => {
     return {
       profile: await db.getProfile(),
       settings: settings.store,
       sessions: await db.getSessions(),
       // Exclude sensitive data
       created_at: new Date().toISOString(),
     }
   })
   ```

5. **Right to Deletion**:

   ```typescript
   // Delete all user data
   ipcMain.handle('user:delete-data', async () => {
     await db.deleteAllSessions()
     await db.deleteProfile()
     settings.clear()
     app.relaunch()
     app.exit(0)
   })
   ```

6. **Data Breach Notification**:
   - Detect breaches within 72 hours
   - Notify users if personal data compromised
   - Document all security incidents

**2026 Enforcement Priorities:**

- **Dark Patterns**: Don't make data collection harder to opt-out than opt-in
- **Cookie Consent**: Not applicable to desktop apps (no browser cookies)
- **AI Processing**: If using AI, ensure user consent and data transparency

**Fines**: €20M or 4% of global revenue (whichever is higher)

### 5.3 Enterprise Deployment Standards

#### **Installer Requirements**

1. **Silent Install**:

   ```bash
   # Windows (NSIS)
   claude-pilot-setup.exe /S /D=C:\Program Files\ClaudePilot

   # macOS (PKG)
   sudo installer -pkg claude-pilot.pkg -target /

   # Linux (DEB)
   sudo dpkg -i claude-pilot.deb
   ```

2. **MSI for Windows (Enterprise)**:

   ```javascript
   // electron-builder.yml
   win:
     target:
       - nsis
       - msi # For Group Policy deployment

   msi:
     perMachine: true
     createDesktopShortcut: true
     createStartMenuShortcut: true
     oneClick: false
   ```

3. **Configuration Management**:

   ```json
   // /etc/claude-pilot/policy.json (system-wide)
   {
     "updates": {
       "autoDownload": false,
       "autoInstall": false,
       "channel": "stable"
     },
     "security": {
       "allowedDomains": ["*.yourcompany.com"],
       "enforceSSL": true
     },
     "features": {
       "analytics": false,
       "crashReporting": true
     }
   }
   ```

4. **Licensing**:

   ```typescript
   // License validation
   async function validateLicense() {
     const license = settings.get('license-key')

     const response = await fetch('https://api.yourcompany.com/validate', {
       method: 'POST',
       body: JSON.stringify({ key: license }),
     })

     if (!response.ok) {
       dialog.showErrorBox('Invalid License', 'Please contact support.')
       app.quit()
     }
   }
   ```

#### **MDM Integration**

**macOS Configuration Profile:**

```xml
<!-- com.yourcompany.claude-pilot.mobileconfig -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <array>
    <dict>
      <key>PayloadType</key>
      <string>com.yourcompany.claude-pilot</string>
      <key>PayloadVersion</key>
      <integer>1</integer>
      <key>AutoUpdate</key>
      <false/>
      <key>TelemetryEnabled</key>
      <false/>
    </dict>
  </array>
</dict>
</plist>
```

**Windows Group Policy:**

```
HKLM\Software\Policies\ClaudePilot
  - AutoUpdate (DWORD): 0
  - TelemetryEnabled (DWORD): 0
  - LicenseServer (STRING): https://license.yourcompany.com
```

---

## 6. Implementation Roadmap

### Phase 1: Security Foundation (Week 1-2)

- [ ] Install and configure Electronegativity
- [ ] Run initial security audit, fix critical issues
- [ ] Setup Snyk for dependency scanning
- [ ] Configure CSP and sandbox settings
- [ ] Audit all IPC handlers for validation
- [ ] Setup Sentry crash reporting

### Phase 2: Testing Infrastructure (Week 3-4)

- [ ] Configure Vitest with coverage thresholds (80%)
- [ ] Migrate E2E tests from Spectron to Playwright
- [ ] Setup Pa11y + axe-core for accessibility
- [ ] Implement memory leak detection tests
- [ ] Add performance benchmarks

### Phase 3: Build & Release (Week 5-6)

- [ ] Setup code signing (Windows EV cert, macOS Developer ID)
- [ ] Configure auto-update with signature verification
- [ ] Generate SBOM with CycloneDX
- [ ] Implement reproducible builds
- [ ] Create silent installers for enterprise

### Phase 4: Compliance (Week 7-8)

- [ ] Document SOC 2 controls
- [ ] Implement GDPR consent management
- [ ] Create data export/deletion features
- [ ] Setup audit logging
- [ ] Create privacy policy

### Phase 5: Monitoring & Optimization (Week 9-10)

- [ ] Setup performance monitoring dashboard
- [ ] Implement user analytics (privacy-respecting)
- [ ] Configure alerting for errors/crashes
- [ ] Optimize startup time and memory usage
- [ ] Load testing and stress testing

---

## 7. Continuous Monitoring Checklist

### Daily

- [ ] Check Sentry for new crashes
- [ ] Review CI/CD build status
- [ ] Monitor auto-update success rate

### Weekly

- [ ] Run `npm audit` and fix high/critical issues
- [ ] Review Snyk vulnerability reports
- [ ] Check test coverage (should be ≥80%)
- [ ] Review performance metrics

### Monthly

- [ ] Run full security audit with Electronegativity
- [ ] Update dependencies (patch versions)
- [ ] Review accessibility reports
- [ ] Analyze user feedback

### Quarterly

- [ ] Penetration testing (consider hiring firm)
- [ ] SOC 2 audit preparation
- [ ] Review and update policies
- [ ] Renew code signing certificates (if expiring)

### Annually

- [ ] Full SOC 2 Type II audit
- [ ] GDPR compliance review
- [ ] Update Information Security Policy
- [ ] Review vendor contracts

---

## 8. Tools Summary

### Essential Tools (Must Have)

```json
{
  "security": {
    "sast": "@doyensec/electronegativity",
    "dependencies": "snyk",
    "runtime": "@sentry/electron"
  },
  "testing": {
    "unit": "vitest",
    "e2e": "@playwright/test",
    "accessibility": "axe-core",
    "coverage": "@vitest/coverage-v8"
  },
  "build": {
    "bundler": "electron-vite",
    "builder": "electron-builder",
    "signing": "electron-builder (built-in)"
  },
  "monitoring": {
    "errors": "@sentry/electron",
    "analytics": "umami",
    "performance": "custom"
  }
}
```

### Recommended Tools (Nice to Have)

```json
{
  "security": {
    "codeql": "github/codeql-action",
    "semgrep": "@semgrep/cli"
  },
  "testing": {
    "visual": "percy",
    "load": "k6"
  },
  "compliance": {
    "sbom": "@cyclonedx/cyclonedx-npm",
    "license": "fossa"
  }
}
```

---

## 9. Cost Breakdown

| Category       | Tool                   | Cost (Annual)             |
| -------------- | ---------------------- | ------------------------- |
| **Security**   | Snyk Team              | $0 (open source)          |
|                | ElectroNG              | $2,000-5,000 (enterprise) |
|                | Code signing (Windows) | $400                      |
|                | Code signing (macOS)   | $99                       |
| **Testing**    | Playwright             | $0 (open source)          |
|                | Percy (visual testing) | $450 (5k screenshots)     |
| **Monitoring** | Sentry Team            | $26/month ($312/year)     |
|                | Umami (self-hosted)    | $0                        |
| **Compliance** | SOC 2 audit            | $15,000-30,000            |
| **Total**      |                        | ~$18,261-36,261           |

---

## 10. Sources & References

### Security Auditing

- [Doyensec ElectroNG Launch](https://blog.doyensec.com/2022/09/06/electrong-launch.html)
- [Electronegativity GitHub](https://github.com/doyensec/electronegativity)
- [Top 13 Enterprise SAST Tools for 2026 - Cycode](https://cycode.com/blog/top-13-enterprise-sast-tools-for-2026/)
- [Penetration Testing of Electron-based Applications](https://deepstrike.io/blog/penetration-testing-of-electron-based-applications)
- [Electron Security Documentation](https://www.electronjs.org/docs/latest/tutorial/security)
- [Bananatron: Electron App Security Analysis](https://muffin.ink/blog/bananatron/)

### Dependency Scanning

- [NPM Security Best Practices - Snyk](https://snyk.io/articles/npm-security-best-practices-shai-hulud-attack/)
- [Strengthening Dependency Security - Shinagawa Labs](https://shinagawa-web.com/en/blogs/dependency-package-security-audit)
- [Top Dependency Scanners Guide](https://dev.to/samlan/top-dependency-scanners-a-comprehensive-guide-2kf)

### Testing

- [Automated Testing for Electron - CircleCI](https://circleci.com/blog/electron-testing/)
- [How to Test Electron Apps with Playwright](https://medium.com/better-programming/how-to-test-electron-apps-1e8eb0078d7b)
- [Testing Electron Apps with Playwright - Kubeshop](https://medium.com/kubeshop-i/testing-electron-apps-with-playwright-kubeshop-839ff27cf376)
- [20 Best End-to-End (E2E) Testing Tools to Use in 2026](https://www.virtuosoqa.com/post/best-end-to-end-testing-tools)
- [GitHub: electron-playwright-example](https://github.com/spaceagetv/electron-playwright-example)

### Performance & Accessibility

- [Chrome DevTools Memory Leak Debugging](https://arunangshudas.com/blog/how-to-analyze-and-debug-memory-leaks-with-chrome-devtools/)
- [Diagnosing Memory Leaks in Electron](https://www.mindfulchase.com/explore/troubleshooting-tips/frameworks-and-libraries/diagnosing-and-fixing-memory-leaks-in-electron-applications.html)
- [Pa11y Accessibility Testing](https://github.com/pa11y/pa11y)
- [Combining axe-core and PA11Y](https://www.craigabbott.co.uk/blog/combining-axe-core-and-pa11y/)

### Crash Reporting

- [Sentry for Electron](https://sentry.io/for/electron/)
- [Sentry Electron Documentation](https://docs.sentry.io/platforms/javascript/guides/electron/)
- [Minidumps: Electron Bug Reports](https://blog.sentry.io/minidumps-electron-bug-reports/)

### Code Signing & Auto-Update

- [Electron Code Signing Documentation](https://www.electronjs.org/docs/latest/tutorial/code-signing)
- [Signature Validation Bypass in Electron-Updater](https://blog.doyensec.com/2020/02/24/electron-updater-update-signature-bypass.html)
- [electron-builder Windows Code Signing](https://www.electron.build/code-signing-win.html)

### SBOM

- [CycloneDX for Node.js](https://github.com/CycloneDX/cyclonedx-node-npm)
- [npm sbom Documentation](https://docs.npmjs.com/cli/v10/commands/npm-sbom/)
- [How to Generate SBOM for JavaScript Apps - Snyk](https://snyk.io/blog/generate-sbom-javascript-node-js-applications/)

### Compliance

- [SOC 2 Compliance: Complete Introduction](https://auditboard.com/blog/soc-2-framework-guide-the-complete-introduction/)
- [SOC 2 Compliance in 2026 - Venn](https://www.venn.com/learn/soc2-compliance/)
- [Complete GDPR Compliance Guide (2026-Ready)](https://secureprivacy.ai/blog/gdpr-compliance-2026/)
- [Data Privacy Laws in 2026](https://www.tekclarion.com/cyber-security/data-privacy-laws-2026/)

### CSP & Security Headers

- [Electron CSP Best Practices](https://content-security-policy.com/examples/electron/)
- [Creating Electron App - CSP for file://](https://blog.coding.kiwi/electron-csp-local/)
- [Helmet.js Documentation](https://helmetjs.github.io/)
- [OWASP CSP Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html)

---

**End of Enterprise Auditing Guide for Claude Pilot**
