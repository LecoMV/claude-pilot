# Claude Pilot - Production Readiness Plan (January 2026)

> **Version**: 0.2.0 → 1.0.0
> **Timeline**: 4 Weeks
> **Created**: 2026-01-21
> **Based on**: Latest 2026 best practices research

---

## Executive Summary

This plan brings Claude Pilot to enterprise-grade production readiness using January 2026 best practices for Electron security, React performance, accessibility (WCAG 2.2), and UX patterns.

**Current State**: B+ (85% ready)
**Target State**: A (Production Ready)

---

## Week 1: Security & Performance (Critical Path)

### 1.1 Shell Injection Prevention (SEC-1) - P0

**Research Finding**: Use `execFile()` instead of `exec()` - it takes an argument array and prevents shell metacharacter injection.

**Files to Fix**:

- `src/main/services/claude/cli.ts`
- `src/main/services/services-manager.ts`
- `src/main/services/terminal.ts`

**Implementation Pattern**:

```typescript
// BEFORE (Vulnerable)
import { exec } from 'child_process'
exec(`claude ${userInput}`, callback)

// AFTER (Safe - 2026 Best Practice)
import { execFile } from 'child_process'
import { sanitizeArg } from '@/utils/security'

const args = ['--flag', sanitizeArg(userInput)]
execFile('claude', args, { shell: false }, callback)

// Input validation with Zod
const CommandInputSchema = z.object({
  command: z
    .string()
    .max(1000)
    .refine((s) => !/[;&|`$(){}[\]<>]/.test(s), 'Invalid characters'),
})
```

**Effort**: 4 hours

---

### 1.2 Path Traversal Protection (SEC-2) - P0

**Research Finding**: Canonicalize with `realpath()` → verify starts with allowed base directory → validate after symlink resolution.

**Implementation Pattern**:

```typescript
// src/main/utils/path-security.ts
import { realpath } from 'fs/promises'
import { resolve, normalize } from 'path'

const ALLOWED_BASES = [process.env.HOME, '/tmp/claude-pilot']

export async function validatePath(userPath: string): Promise<string> {
  // Block obvious attacks
  if (userPath.includes('..') || userPath.includes('~')) {
    throw new Error('Path traversal not allowed')
  }

  // Block Windows UNC paths (NTLM leak risk)
  if (/^\\\\|^\/\//.test(userPath)) {
    throw new Error('UNC paths not allowed')
  }

  // Resolve to absolute path
  const absolutePath = resolve(userPath)

  // Resolve symlinks
  const realPath = await realpath(absolutePath)

  // Verify within allowed directory
  const isAllowed = ALLOWED_BASES.some((base) => base && realPath.startsWith(normalize(base)))

  if (!isAllowed) {
    throw new Error('Path outside allowed directories')
  }

  return realPath
}
```

**Effort**: 2 hours

---

### 1.3 Bundle Optimization - P0

**Research Finding**: electron-vite 5.0 supports isolated build mode and manual chunk configuration for optimal code splitting.

**Target**: 6MB → 2MB initial bundle

**Implementation** (electron.vite.config.ts):

```typescript
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  renderer: {
    plugins: [react()],
    build: {
      chunkSizeWarningLimit: 500,
      rollupOptions: {
        output: {
          manualChunks: {
            // Core React (always loaded)
            'react-vendor': ['react', 'react-dom'],

            // UI framework (loaded early)
            'ui-vendor': ['lucide-react', 'clsx', 'tailwind-merge'],

            // Heavy editors (lazy loaded)
            monaco: ['@monaco-editor/react', 'monaco-editor'],

            // Terminal (lazy loaded)
            terminal: ['@xterm/xterm', '@xterm/addon-fit', '@xterm/addon-webgl'],

            // Visualization (lazy loaded)
            graphs: ['cytoscape', 'graphology', 'sigma', 'reactflow'],

            // Charts (lazy loaded)
            charts: ['recharts'],

            // Data layer
            trpc: ['@trpc/client', '@trpc/react-query', 'superjson'],
          },
        },
      },
    },
  },
})
```

**Effort**: 4 hours

---

### 1.4 Lazy Loading Implementation - P0

**Research Finding**: Use React.lazy with Suspense and avoid loading waterfalls by preloading data alongside components.

**Create**: `src/renderer/components/common/LazyComponents.tsx`

```typescript
import { lazy, Suspense, ComponentType } from 'react'
import { Skeleton } from './Skeleton'

// Lazy load heavy components
export const MonacoEditor = lazy(() =>
  import('@/components/common/CodeEditor')
)

export const AgentCanvas = lazy(() =>
  import('@/components/agents/AgentCanvas')
)

export const HybridGraphViewer = lazy(() =>
  import('@/components/memory/HybridGraphViewer')
)

export const Terminal = lazy(() =>
  import('@/components/terminal/Terminal')
)

export const Recharts = lazy(() =>
  import('@/components/dashboard/MetricsChart')
)

// Wrapper with loading fallback
export function LazyLoad<P extends object>({
  component: Component,
  fallback = <Skeleton variant="card" />,
  ...props
}: {
  component: ComponentType<P>
  fallback?: React.ReactNode
} & P) {
  return (
    <Suspense fallback={fallback}>
      <Component {...(props as P)} />
    </Suspense>
  )
}
```

**Effort**: 4 hours

---

### 1.5 Fix Failing UI Tests - P0

**Research Finding**: Use `userEvent` over `fireEvent`, proper async handling with `findBy*` queries, and reset mocks between tests.

**Files to Fix**:

- `src/renderer/components/settings/__tests__/GlobalSettings.test.tsx` (29 failures)

**Pattern**:

```typescript
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { vi, beforeEach, describe, it, expect } from 'vitest'

// Reset mocks properly
beforeEach(() => {
  vi.clearAllMocks()
})

// Use userEvent for realistic interactions
const user = userEvent.setup()
await user.click(screen.getByRole('button', { name: /save/i }))

// Use findBy for async content
expect(await screen.findByText(/saved/i)).toBeInTheDocument()

// Wait for state updates
await waitFor(() => {
  expect(mockMutation).toHaveBeenCalledOnce()
})
```

**Effort**: 4 hours

---

## Week 2: UI/UX Polish

### 2.1 Skeleton Loading Components - P1

**Research Finding**: Skeleton screens mimic final UI structure for perceived performance improvement.

**Create**: `src/renderer/components/common/Skeleton.tsx`

```typescript
interface SkeletonProps {
  variant: 'card' | 'list' | 'table' | 'text' | 'avatar'
  count?: number
  className?: string
}

export function Skeleton({ variant, count = 1, className }: SkeletonProps) {
  const baseClass = 'animate-pulse bg-border rounded'

  const variants = {
    card: (
      <div className={`${baseClass} p-4 space-y-3`}>
        <div className="h-4 bg-surface rounded w-1/3" />
        <div className="h-3 bg-surface rounded w-full" />
        <div className="h-3 bg-surface rounded w-5/6" />
      </div>
    ),
    list: (
      <div className={`${baseClass} p-3 flex items-center gap-3`}>
        <div className="h-10 w-10 bg-surface rounded-full" />
        <div className="flex-1 space-y-2">
          <div className="h-3 bg-surface rounded w-1/2" />
          <div className="h-2 bg-surface rounded w-1/3" />
        </div>
      </div>
    ),
    // ... other variants
  }

  return (
    <div className={className}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i}>{variants[variant]}</div>
      ))}
    </div>
  )
}
```

**Apply to**:

- Dashboard (system status cards)
- SessionManager (session list)
- MemoryBrowser (query results)
- MCPManager (server list)
- OllamaManager (model list)

**Effort**: 4 hours

---

### 2.2 Empty State Components - P1

**Research Finding**: Empty states should educate and motivate users with clear next actions.

**Create**: `src/renderer/components/common/EmptyState.tsx`

```typescript
interface EmptyStateProps {
  icon: React.ReactNode
  title: string
  description: string
  action?: {
    label: string
    onClick: () => void
  }
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center">
      <div className="text-6xl text-text-muted mb-6">{icon}</div>
      <h3 className="text-lg font-semibold text-text-primary mb-2">{title}</h3>
      <p className="text-sm text-text-muted max-w-md mb-6">{description}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="px-4 py-2 bg-accent-blue text-white rounded-lg hover:bg-accent-blue/90"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
```

**Empty States to Create**:
| View | Icon | Title | Description |
|------|------|-------|-------------|
| Sessions | 💬 | No sessions found | Start a Claude Code session in Terminal |
| Memory | 🧠 | No memories stored | Use /learn to save insights |
| Beads | 📋 | No issues tracked | Create your first bead with 'bd create' |
| Logs | 📄 | Log viewer empty | Logs appear when services run |
| Projects | 📁 | No projects | Create your first Claude project |

**Effort**: 3 hours

---

### 2.3 Error Handling UX - P1

**Research Finding**: Errors should be specific, include error codes, and provide recovery actions.

**Create**: `src/renderer/components/common/ErrorMessage.tsx`

```typescript
interface ErrorMessageProps {
  type: 'inline' | 'banner' | 'toast'
  severity: 'error' | 'warning' | 'info'
  code?: string
  title: string
  message: string
  action?: {
    label: string
    onClick: () => void
  }
  onDismiss?: () => void
}

export function ErrorMessage({
  type,
  severity,
  code,
  title,
  message,
  action,
  onDismiss,
}: ErrorMessageProps) {
  const colors = {
    error: 'bg-accent-red/10 border-accent-red text-accent-red',
    warning: 'bg-accent-yellow/10 border-accent-yellow text-accent-yellow',
    info: 'bg-accent-blue/10 border-accent-blue text-accent-blue',
  }

  return (
    <div className={`flex items-start gap-3 p-4 rounded-lg border ${colors[severity]}`}>
      <AlertCircle className="w-5 h-5 flex-shrink-0" />
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <h4 className="font-semibold">{title}</h4>
          {code && <code className="text-xs opacity-70">[{code}]</code>}
        </div>
        <p className="text-sm opacity-90 mt-1">{message}</p>
        {action && (
          <button
            onClick={action.onClick}
            className="mt-3 text-sm font-medium underline hover:no-underline"
          >
            {action.label}
          </button>
        )}
      </div>
      {onDismiss && (
        <button onClick={onDismiss} className="opacity-50 hover:opacity-100">
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}
```

**Effort**: 4 hours

---

### 2.4 Responsive Design Audit - P1

**Research Finding**: Desktop apps should support variable window sizes with responsive breakpoints.

**Breakpoints**:
| Size | Min Width | Layout |
|------|-----------|--------|
| sm | 640px | Stacked sidebar |
| md | 900px | Narrow sidebar |
| lg | 1200px | Full layout |
| xl | 1600px | Extended panels |

**Components to Update**:

- Sidebar: Collapsible on sm/md
- Dashboard grid: 1→2→3→4 columns
- Settings: Stack sections on sm
- Memory Browser: Collapse filters on sm

**Effort**: 8 hours

---

### 2.5 Test Coverage to 80% - P1

**Research Finding**: Use V8 coverage provider with AST remapping for accurate results.

**Current**: ~77%
**Target**: 80%+

**Priority Test Files**:

1. New common components (Skeleton, EmptyState, ErrorMessage)
2. Lazy loading wrappers
3. Security utilities (path validation, input sanitization)
4. Chat controller edge cases

**Configuration**:

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/**/*.d.ts', 'src/**/types.ts'],
      thresholds: {
        lines: 80,
        branches: 75,
        functions: 80,
        statements: 80,
      },
    },
  },
})
```

**Effort**: 6 hours

---

## Week 3: Accessibility & Polish

### 3.1 WCAG 2.2 Accessibility Audit - P1

**Research Finding**: WCAG 2.2 Level AA is required by April 2026 for government compliance. Focus on keyboard navigation, focus indicators, and ARIA labels.

**Implementation Checklist**:

#### Keyboard Navigation

- [ ] Skip navigation link (first focusable element)
- [ ] Logical tab order (no positive tabIndex)
- [ ] All interactive elements keyboard accessible
- [ ] Focus trap in modals
- [ ] Return focus when dialogs close

#### Focus Indicators (WCAG 2.2)

```css
/* Minimum 3:1 contrast ratio */
:focus-visible {
  outline: 2px solid #89b4fa;
  outline-offset: 2px;
  border-radius: 4px;
}

/* Remove for mouse users */
button:focus:not(:focus-visible) {
  outline: none;
}
```

#### ARIA Labels

- [ ] All form inputs have labels
- [ ] Icon-only buttons have aria-label
- [ ] Live regions for dynamic content
- [ ] Dialog aria-modal and aria-labelledby
- [ ] Menu aria-expanded and aria-haspopup

#### Screen Reader Testing

- Test with NVDA (Windows) or VoiceOver (macOS)
- Verify page title updates on route change
- Confirm dynamic content announcements

**Effort**: 16 hours

---

### 3.2 Accessibility Testing Integration - P1

**Research Finding**: Use axe-core for automated testing (catches 57% of WCAG issues with zero false positives).

**Setup**:

```bash
npm install --save-dev @axe-core/react jest-axe @axe-core/playwright
```

**Unit Tests**:

```typescript
// Every component test should include
import { axe, toHaveNoViolations } from 'jest-axe'
expect.extend(toHaveNoViolations)

it('should have no accessibility violations', async () => {
  const { container } = render(<Component />)
  const results = await axe(container)
  expect(results).toHaveNoViolations()
})
```

**E2E Tests**:

```typescript
// e2e/accessibility.spec.ts
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('Dashboard has no a11y violations', async ({ page }) => {
  await page.goto('/')
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
    .analyze()
  expect(results.violations).toEqual([])
})
```

**Effort**: 4 hours

---

### 3.3 Rate Limiting Middleware - P2

**Research Finding**: Add rate limiting to IPC layer to prevent abuse.

**Implementation**:

```typescript
// src/main/trpc/middleware/rateLimit.ts
import { TRPCError } from '@trpc/server'

const rateLimits = new Map<string, { count: number; resetAt: number }>()

export const rateLimitMiddleware = t.middleware(async ({ ctx, next, path }) => {
  const key = `${ctx.clientId}:${path}`
  const now = Date.now()
  const limit = rateLimits.get(key)

  if (limit && limit.resetAt > now) {
    if (limit.count >= 100) {
      // 100 requests per minute
      throw new TRPCError({
        code: 'TOO_MANY_REQUESTS',
        message: 'Rate limit exceeded',
      })
    }
    limit.count++
  } else {
    rateLimits.set(key, { count: 1, resetAt: now + 60000 })
  }

  return next()
})
```

**Effort**: 4 hours

---

### 3.4 Request Timeout Middleware - P2

**Implementation**:

```typescript
// src/main/trpc/middleware/timeout.ts
export const timeoutMiddleware = t.middleware(async ({ next }) => {
  const timeoutMs = 30000 // 30 seconds

  const result = await Promise.race([
    next(),
    new Promise((_, reject) =>
      setTimeout(
        () =>
          reject(
            new TRPCError({
              code: 'TIMEOUT',
              message: 'Request timed out',
            })
          ),
        timeoutMs
      )
    ),
  ])

  return result
})
```

**Effort**: 2 hours

---

## Week 4: Release Preparation

### 4.1 Manual Testing Checklist - P1

**All 15 Views**:

- [ ] Dashboard - System metrics load, charts render
- [ ] Projects - Project list, CLAUDE.md viewer
- [ ] MCP Manager - Server status, enable/disable
- [ ] Memory Browser - PostgreSQL, Memgraph, Qdrant queries
- [ ] Profiles - Create, edit, delete profiles
- [ ] Terminal - PTY sessions, Claude CLI
- [ ] Sessions - Session list, ghost detection
- [ ] Context - Context analysis, token usage
- [ ] Services - Systemd/Podman status
- [ ] Ollama - Model list, pull, run
- [ ] Agents - Agent canvas, spawn modal
- [ ] Chat - Multi-turn conversation
- [ ] Beads - Issue tracking
- [ ] Settings - App preferences
- [ ] Logs - Log streaming

**Cross-cutting**:

- [ ] Keyboard navigation works everywhere
- [ ] Dark mode consistent
- [ ] Sidebar collapse/expand
- [ ] Command palette (Ctrl+K)
- [ ] Settings persist after restart
- [ ] Error states show properly
- [ ] Loading states show properly

**Effort**: 8 hours

---

### 4.2 Code Signing Setup - P1

**macOS** ($99/year):

1. Enroll in Apple Developer Program
2. Create "Developer ID Application" certificate
3. Configure electron-builder:

```json
{
  "mac": {
    "hardenedRuntime": true,
    "gatekeeperAssess": false,
    "entitlements": "build/entitlements.mac.plist",
    "entitlementsInherit": "build/entitlements.mac.plist"
  }
}
```

4. Notarize with `notarytool`

**Windows** ($350/year EV certificate):

1. Purchase EV certificate from Sectigo/Digicert
2. Configure signtool in CI
3. Enable SmartScreen reputation

**Effort**: 8 hours (+ procurement time)

---

### 4.3 Release Packaging - P1

**Version Bump**:

```bash
npm version 0.2.0
```

**Build All Platforms**:

```bash
npm run dist:all
```

**Outputs**:

- Linux: AppImage, deb, tar.gz
- macOS: dmg, zip (signed + notarized)
- Windows: exe, portable (signed)

**GitHub Release**:

```bash
git tag v0.2.0
git push origin v0.2.0
gh release create v0.2.0 release/* --title "Claude Pilot v0.2.0" --notes-file CHANGELOG.md
```

**Effort**: 4 hours

---

## Beads Summary

### Week 1 (Security & Performance)

| ID  | Title                                       | Priority | Effort |
| --- | ------------------------------------------- | -------- | ------ |
| TBD | Fix shell injection vulnerabilities (SEC-1) | P0       | 4h     |
| TBD | Add path traversal protection (SEC-2)       | P0       | 2h     |
| TBD | Bundle optimization with code splitting     | P0       | 4h     |
| TBD | Implement lazy loading for heavy components | P0       | 4h     |
| TBD | Fix GlobalSettings test failures            | P0       | 4h     |

### Week 2 (UI/UX)

| ID  | Title                                    | Priority | Effort |
| --- | ---------------------------------------- | -------- | ------ |
| TBD | Create Skeleton loading components       | P1       | 4h     |
| TBD | Create EmptyState components             | P1       | 3h     |
| TBD | Create ErrorMessage component with codes | P1       | 4h     |
| TBD | Responsive design audit and fixes        | P1       | 8h     |
| TBD | Increase test coverage to 80%            | P1       | 6h     |

### Week 3 (Accessibility)

| ID  | Title                              | Priority | Effort |
| --- | ---------------------------------- | -------- | ------ |
| TBD | WCAG 2.2 accessibility audit       | P1       | 16h    |
| TBD | Add axe-core accessibility testing | P1       | 4h     |
| TBD | Add rate limiting middleware       | P2       | 4h     |
| TBD | Add request timeout middleware     | P2       | 2h     |

### Week 4 (Release)

| ID  | Title                                | Priority | Effort |
| --- | ------------------------------------ | -------- | ------ |
| TBD | Manual testing all 15 views          | P1       | 8h     |
| TBD | Code signing setup (macOS + Windows) | P1       | 8h     |
| TBD | Release packaging v0.2.0             | P1       | 4h     |

**Total Effort**: ~99 hours (~4 weeks at 25h/week)

---

## Success Criteria

### Security

- [ ] Zero shell injection vulnerabilities
- [ ] All file paths validated
- [ ] Rate limiting active
- [ ] CSP headers strict

### Performance

- [ ] Initial bundle < 2MB
- [ ] Cold start < 2s
- [ ] Memory < 300MB idle

### Quality

- [ ] Test coverage ≥ 80%
- [ ] Zero critical/high lint errors
- [ ] All E2E tests passing

### Accessibility

- [ ] WCAG 2.2 Level AA compliant
- [ ] Keyboard navigation complete
- [ ] axe-core tests in CI

### UX

- [ ] Loading states on all async views
- [ ] Empty states on all lists
- [ ] Specific error messages
- [ ] Responsive on all window sizes

---

## References

- [Electron Security Best Practices 2026](./Research/ELECTRON_SECURITY_2026.md)
- [Bundle Optimization Guide](./Research/BUNDLE_OPTIMIZATION_2026.md)
- [React Testing Best Practices](./Research/REACT_TESTING_2026.md)
- [WCAG 2.2 Accessibility Guide](./Research/ACCESSIBILITY_2026.md)
- [UX Patterns for Desktop Apps](./Research/UX_PATTERNS_2026.md)
