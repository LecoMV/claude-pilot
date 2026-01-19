# Gemini Deep Research Topics for Claude Pilot v0.2.0

> **Purpose**: Topics requiring deeper research before or during implementation
> **Date**: 2026-01-19

---

## High Priority (Needed for v0.2.0)

### 1. Electron App Packaging Optimization 2026

**Why**: Bundle is 6MB, needs reduction for fast startup

Research needed:

- Best practices for electron-vite production builds
- Code signing on macOS/Windows (current setup untested)
- electron-builder optimization flags
- Tree-shaking configuration for Electron
- Native module handling (node-pty, better-sqlite3)

### 2. React 19 Lazy Loading with Error Boundaries

**Why**: Heavy components need lazy loading (Monaco ~2MB, Cytoscape ~500KB)

Research needed:

- React.lazy() + Suspense best practices 2026
- Error boundary integration with lazy components
- Loading skeleton patterns
- Route-based code splitting in Electron (no router)
- Prefetching strategies

### 3. Monaco Editor Electron Optimization

**Why**: Monaco is ~2MB and slows initial load

Research needed:

- Monaco worker bundle optimization
- Language feature cherry-picking (only need JSON, Markdown, YAML)
- Web worker configuration in Electron
- Monaco alternatives for lighter footprint (CodeMirror 6?)

---

## Medium Priority (Can implement with existing knowledge)

### 4. Vitest Coverage Optimization

**Status**: Already optimized (threads pool, happy-dom, v8 coverage)

Minor research:

- Increasing thresholds from 70% to 80%
- Component testing for excluded WebGL components
- Stryker mutation testing configuration

### 5. Playwright Electron Testing

**Status**: Already using \_electron.launch correctly

Minor research:

- Visual regression testing setup
- Accessibility testing integration
- Performance metrics collection

---

## Lower Priority (v0.3.0+)

### 6. OAuth 2.0/OIDC in Electron (RFC 8252)

**Existing research**: `docs/Research/Electron OAuth 2.0_OIDC Best Practices.md`

### 7. Zero-Knowledge Encrypted Vector Search

**Existing research**: `docs/Research/Encrypted Vector Search for Claude Pilot.md`

### 8. Worker Thread Optimization (Piscina)

**Existing research**: `docs/Research/Electron Worker Thread Optimization Strategies.md`

### 9. Teleport Desktop Integration

**Existing research**: `docs/Research/Integrating Teleport into Desktop Apps.md`

---

## Research Approach

For high-priority topics, use Gemini 2.0 Deep Research:

1. **Query format**: "Electron [topic] best practices 2026 production optimization"
2. **Focus areas**: Performance, security, user experience
3. **Output format**: Implementation guide with code examples

---

## Immediate Actions (No Research Needed)

These can be implemented now based on best practices:

1. **Code splitting** - Configure rollup manualChunks
2. **Loading skeletons** - Use existing Skeleton component pattern
3. **Empty states** - Standard UX pattern
4. **Responsive design** - Tailwind breakpoint audit

---

## Decision: What Needs Gemini Research?

### MUST Research Before Implementation:

- [ ] Monaco Editor optimization (complex, many options)

### CAN Implement Now:

- [x] Code splitting configuration
- [x] Loading skeletons
- [x] Empty states
- [x] Test configuration optimization

### DEFER to v0.3.0:

- Enterprise features (OAuth, encryption, Teleport)
