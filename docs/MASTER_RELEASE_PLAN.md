# Claude Pilot - Master Release Plan

> **Document Status**: CONSOLIDATED PLANNING
> **Date**: 2026-01-19
> **Target**: v0.2.0 Initial Public Release

---

## Executive Summary

This document consolidates all planned work for Claude Pilot v0.2.0 release, including:

- Original v0.2.0 release blockers
- Webmin-inspired UI/UX enhancements
- Performance optimizations
- Testing requirements

---

## Current State (as of 2026-01-19)

### What's Complete

| Category           | Status       | Details                                                                                                                               |
| ------------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Views**          | ✅ 15/15     | Dashboard, MCP, Memory, Profiles, Terminal, Sessions, Context, Services, Ollama, Agents, Chat, Beads, Settings, Global Settings, Logs |
| **tRPC Migration** | ✅ Complete  | 201 handlers across 25 controllers                                                                                                    |
| **Build**          | ✅ Pass      | 23s build, zero TypeScript errors                                                                                                     |
| **Lint**           | ⚠️ Warnings  | 142 warnings (non-blocking)                                                                                                           |
| **Backend**        | ✅ Connected | PostgreSQL, Memgraph, Qdrant online                                                                                                   |

### Recent Additions (Today)

| Component         | Status      | Commit    |
| ----------------- | ----------- | --------- |
| AdvancedSection   | ✅ Complete | `4ec105b` |
| CollapsibleCard   | ✅ Complete | `4ec105b` |
| StatusIndicator   | ✅ Complete | `4ec105b` |
| BatchActions      | ✅ Complete | `4ec105b` |
| HelpTooltip       | ✅ Complete | `4ec105b` |
| FormField         | ✅ Complete | `4ec105b` |
| InfoBanner        | ✅ Complete | `4ec105b` |
| FileCache service | ✅ Complete | `4ec105b` |

---

## Phase 1: Critical Fixes (Release Blockers)

### 1.1 Bundle Optimization

**Bead**: `deploy-3wem` | **Priority**: P1 | **Effort**: Medium

Current bundle: **6,122 KB** (too large for fast cold start)

| Task             | Target Size   | Method                    |
| ---------------- | ------------- | ------------------------- |
| Monaco editor    | ~2MB → lazy   | `React.lazy()` + Suspense |
| Cytoscape/graphs | ~500KB → lazy | Dynamic import            |
| xterm.js         | ~300KB → lazy | Route-based splitting     |
| Recharts         | ~200KB → lazy | Dynamic import            |

**Implementation**:

```typescript
// electron.vite.config.ts
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        'monaco': ['monaco-editor'],
        'graphs': ['cytoscape', 'graphology', 'sigma'],
        'terminal': ['xterm', 'xterm-addon-fit', 'xterm-addon-webgl'],
        'charts': ['recharts']
      }
    }
  }
}
```

### 1.2 Chat Interface Fix

**Bead**: `deploy-t8fi` | **Status**: ✅ CLOSED

Fixed with multi-turn support and full terminal mode:

- Added `--continue` flag for session continuity
- Added "Full Terminal" button for interactive Claude
- Proper stream-json parsing

---

## Phase 2: UI Polish

### 2.1 Loading States & Skeletons

**Bead**: `deploy-ugsk` | **Priority**: P1 | **Effort**: Low

| View           | Needs Skeleton      |
| -------------- | ------------------- |
| Dashboard      | System status cards |
| Memory Browser | Query results       |
| Sessions       | Transcript list     |
| MCP Manager    | Server list         |
| Ollama         | Model list          |

**Component to create**: `<Skeleton variant="card|list|text" />`

### 2.2 Empty States

**Priority**: P1 | **Effort**: Low

| View     | Empty State Message                                           |
| -------- | ------------------------------------------------------------- |
| Sessions | "No sessions found. Start a Claude Code session in Terminal." |
| Memory   | "No memories stored yet. Use /learn to save insights."        |
| Beads    | "No issues tracked. Create your first bead with 'bd create'." |
| Logs     | "Log viewer is empty. Logs appear when services are running." |

### 2.3 Error Messages

**Priority**: P1 | **Effort**: Low

- Replace generic "Error" with specific messages
- Add retry buttons where applicable
- Include error codes for debugging

### 2.4 Responsive Design

**Bead**: `deploy-833o` | **Priority**: P2 | **Effort**: Medium

| Breakpoint | Target                           |
| ---------- | -------------------------------- |
| < 768px    | Stack sidebar, collapse panels   |
| 768-1024px | Narrow sidebar, responsive cards |
| > 1024px   | Full layout                      |

### 2.5 Dark Theme Audit

**Priority**: P2 | **Effort**: Low

- Audit all components for color consistency
- Ensure proper contrast ratios (WCAG AA)
- Fix any hardcoded colors

---

## Phase 3: Webmin-Inspired Enhancements

### 3.1 Progressive Disclosure ✅ COMPLETE

**Bead**: `deploy-fgsf` | **Status**: CLOSED

Components delivered:

- `<AdvancedSection>` - Expandable options section
- `<CollapsibleCard>` - Expandable card variant

### 3.2 Module Discovery System

**Bead**: `deploy-4xys` | **Priority**: P2 | **Effort**: 3 days

Create declarative metadata for MCP servers:

```typescript
interface MCPServerMetadata {
  name: string
  displayName: string
  description: string
  category: 'memory' | 'tools' | 'search' | 'integration'
  configSchema: JSONSchema7
  healthCheck: { type: 'http' | 'tcp' | 'command', ... }
}
```

### 3.3 Schema-Driven Form Generation

**Bead**: `deploy-yvr9` | **Priority**: P2 | **Effort**: 4 days

Auto-generate settings forms from JSON Schema:

- MCP server configuration
- Profile settings
- App preferences

### 3.4 Enhanced Status Indicators ✅ PARTIAL

**Bead**: `deploy-hhfk` | **Priority**: P2

Components delivered:

- `<StatusIndicator>` - Multiple variants (dot/badge/pill/icon)
- `<BatchActions>` - Multi-select toolbar
- `<SelectableItem>` - Selection wrapper

Still needed:

- Integrate into MCP Manager
- Integrate into Services panel
- Add batch operations UI

### 3.5 File Caching ✅ COMPLETE

Delivered in `src/main/services/cache/`:

- `FileCache` - Stat-based caching
- `JsonFileCache` - JSON parsing
- `configCache` / `transcriptCache` - Global instances

---

## Phase 4: Performance

### 4.1 Code Splitting

See Phase 1.1 (Bundle Optimization)

### 4.2 Lazy Loading

**Bead**: `deploy-lzhx` | **Priority**: P2

```typescript
// Lazy load heavy components
const MonacoEditor = lazy(() => import('@/components/common/CodeEditor'))
const AgentCanvas = lazy(() => import('@/components/agents/AgentCanvas'))
const HybridGraphViewer = lazy(() => import('@/components/memory/HybridGraphViewer'))
```

### 4.3 Memory Profiling

**Priority**: P2 | **Effort**: Medium

- Run Electron DevTools memory profiler
- Identify and fix memory leaks
- Target: < 300MB idle memory

---

## Phase 5: Testing

### 5.1 Unit Tests

**Bead**: `deploy-mo4k` | **Target**: 80% coverage

Current: ~77% | Target: 80%+

Priority test files:

- [ ] New common components (AdvancedSection, StatusIndicator, HelpTooltip)
- [ ] FileCache service
- [ ] Chat controller

### 5.2 Component Tests

**Bead**: `deploy-62gz` | **Priority**: P1

Fix mock/render issues in:

- AgentCanvas tests
- Memory Browser tests
- Terminal tests

### 5.3 Manual Testing Checklist

**Bead**: `deploy-kflm` | **Priority**: P1

- [ ] Fresh install experience
- [ ] All 15 views load correctly
- [ ] Navigation (sidebar, command palette)
- [ ] Keyboard shortcuts
- [ ] Settings persistence
- [ ] Error handling

---

## Phase 6: Release Packaging

### 6.1 Pre-Release

- [ ] Update version to 0.2.0 in package.json
- [ ] Update CHANGELOG.md
- [ ] Code signing certificate

### 6.2 Build Packages

- [ ] Linux: .deb, .AppImage, .rpm
- [ ] Windows: .exe, .msi (NSIS)
- [ ] macOS: .dmg

### 6.3 Post-Release

- [ ] Git tag v0.2.0
- [ ] GitHub release with notes
- [ ] Monitor for critical issues

---

## Beads Summary (Claude Pilot)

### EPIC Beads

| Bead          | Title                                    | Status |
| ------------- | ---------------------------------------- | ------ |
| `deploy-3u33` | EPIC: Claude Pilot v0.2.0 Release        | Open   |
| `deploy-hl6t` | EPIC: Webmin-inspired UI/UX enhancements | Open   |

### Task Beads

| Bead          | Title                                | Priority | Status     |
| ------------- | ------------------------------------ | -------- | ---------- |
| `deploy-3wem` | Bundle optimization - code splitting | P1       | Open       |
| `deploy-ugsk` | UI polish - loading skeletons        | P1       | Open       |
| `deploy-kflm` | Pre-release manual testing           | P1       | Open       |
| `deploy-62gz` | Fix failing component tests          | P1       | Open       |
| `deploy-lzhx` | Lazy load heavy components           | P2       | Open       |
| `deploy-833o` | Responsive design audit              | P2       | Open       |
| `deploy-tzm7` | Error handling UX                    | P2       | Open       |
| `deploy-4xys` | Module discovery metadata system     | P2       | Open       |
| `deploy-yvr9` | Schema-driven form generation        | P2       | Open       |
| `deploy-hhfk` | Enhanced status with batch ops       | P2       | Open       |
| `deploy-t8fi` | Fix ChatInterface                    | P2       | **CLOSED** |
| `deploy-fgsf` | Progressive disclosure component     | P3       | **CLOSED** |

---

## Recommended Execution Order

### Week 1: Critical Path

1. **Bundle optimization** (`deploy-3wem`) - Unblocks fast startup
2. **Loading skeletons** (`deploy-ugsk`) - Quick visual polish
3. **Fix component tests** (`deploy-62gz`) - Unblocks CI

### Week 2: UI Polish

4. **Responsive design** (`deploy-833o`)
5. **Empty states** (no bead)
6. **Error messages** (`deploy-tzm7`)
7. **Lazy loading** (`deploy-lzhx`)

### Week 3: Webmin Features

8. **Integrate StatusIndicator/BatchActions** (`deploy-hhfk`)
9. **Module discovery** (`deploy-4xys`)
10. **Schema-driven forms** (`deploy-yvr9`)

### Week 4: Testing & Release

11. **Manual testing** (`deploy-kflm`)
12. **Unit test coverage** (`deploy-mo4k`)
13. **Package and release**

---

## Open Questions

1. **Distribution**: GitHub releases only, or also package managers (apt, brew)?
2. **Auto-update**: Implement electron-updater now or post-release?
3. **Telemetry**: Add anonymous usage analytics?
4. **Documentation site**: Need docs website for launch?

---

## Enterprise Features (v0.3.0+)

Documented in Gemini research, targeted for future release:

- OAuth 2.0/OIDC (RFC 8252)
- Zero-knowledge vector search
- Worker thread optimization
- Teleport integration
- 5-tier configuration hierarchy
