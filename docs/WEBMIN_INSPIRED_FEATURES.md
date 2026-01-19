# Webmin-Inspired Features for Claude Pilot

> **Document Status**: Implementation Guide
> **Date**: 2026-01-19
> **Purpose**: Extract and adapt best practices from Webmin for Claude Pilot

---

## Executive Summary

Webmin's 25+ year evolution as a system administration tool provides valuable patterns for Claude Pilot. This document identifies key features, strategies, and UI/UX elements to implement.

---

## 1. Module Discovery System

### Webmin Pattern

Webmin uses `module.info` files for declarative module metadata:

```
name=Apache Webserver
desc=Configure Apache web server
category=servers
depends=webmin
```

### Claude Pilot Implementation

**Target**: MCP Server Manager

Create a declarative metadata system for MCP servers:

```typescript
// src/shared/types/mcp-metadata.ts
interface MCPServerMetadata {
  name: string
  displayName: string
  description: string
  version: string
  category: 'memory' | 'tools' | 'search' | 'integration' | 'custom'
  icon?: string
  author?: string

  // Configuration schema
  configSchema: {
    properties: Record<
      string,
      {
        type: 'string' | 'number' | 'boolean' | 'array' | 'object'
        title: string
        description?: string
        default?: unknown
        required?: boolean
        enum?: unknown[]
      }
    >
  }

  // Dependencies and requirements
  requires?: {
    services?: string[] // e.g., ['postgresql', 'qdrant']
    binaries?: string[] // e.g., ['python3', 'node']
    ports?: number[] // Ports that must be available
  }

  // Health check configuration
  healthCheck?: {
    type: 'http' | 'tcp' | 'command'
    endpoint?: string
    port?: number
    command?: string
    interval?: number
  }
}
```

**Implementation Files**:

- `src/main/services/mcp/metadata-loader.ts` - Parse metadata files
- `src/main/controllers/mcp.controller.ts` - Extend with metadata queries
- `src/renderer/components/mcp/MCPCatalog.tsx` - New catalog browser

---

## 2. Config-Driven Form Generation

### Webmin Pattern

Webmin generates configuration forms from module schemas, eliminating manual form coding.

### Claude Pilot Implementation

**Target**: Settings, MCP Configuration, Profile Editor

```typescript
// src/renderer/components/common/SchemaForm.tsx
interface SchemaFormProps {
  schema: JSONSchema7
  data: Record<string, unknown>
  onChange: (data: Record<string, unknown>) => void
  layout?: 'vertical' | 'horizontal' | 'grid'
  categories?: string[] // Group fields by category
}

// Features:
// - Auto-generate form fields from JSON Schema
// - Support for nested objects and arrays
// - Conditional field visibility
// - Inline validation with error messages
// - Help text from schema descriptions
```

**Benefits**:

- MCP server configs auto-generate settings UIs
- Profile settings derive from schema
- Reduces boilerplate by 70%+

---

## 3. Progressive Disclosure UI

### Webmin Pattern

Webmin shows basic options by default with "Advanced" sections that expand on demand.

### Claude Pilot Implementation

**Target**: All settings panels, MCP configuration, terminal settings

```tsx
// src/renderer/components/common/AdvancedSection.tsx
interface AdvancedSectionProps {
  title?: string
  defaultExpanded?: boolean
  children: React.ReactNode
  badge?: string // e.g., "8 options"
}

function AdvancedSection({
  title = 'Advanced Options',
  defaultExpanded = false,
  children,
  badge,
}: AdvancedSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  return (
    <div className="border-t border-border mt-4 pt-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-text-muted hover:text-text-primary"
      >
        <ChevronRight className={cn('w-4 h-4 transition-transform', expanded && 'rotate-90')} />
        <span>{title}</span>
        {badge && <span className="text-xs bg-surface px-2 py-0.5 rounded">{badge}</span>}
      </button>
      {expanded && <div className="mt-4 space-y-4">{children}</div>}
    </div>
  )
}
```

**Apply To**:

- MCP Server Config: Basic (enable/disable) → Advanced (args, env, timeouts)
- Profile Editor: Basic (name, model) → Advanced (temperature, custom rules)
- Terminal: Basic (shell, cwd) → Advanced (env vars, keybindings)

---

## 4. Status Dashboard Enhancements

### Webmin Pattern

- Real-time status indicators with color coding
- Batch operations (start/stop multiple services)
- Quick actions in list views
- History/audit logs per item

### Claude Pilot Implementation

**Target**: Dashboard, Services Panel, MCP Manager

```tsx
// Enhanced status indicators
type ServiceStatus = 'online' | 'offline' | 'degraded' | 'starting' | 'stopping' | 'unknown'

const statusConfig: Record<ServiceStatus, { color: string; icon: LucideIcon; pulse?: boolean }> = {
  online: { color: 'text-accent-green', icon: CheckCircle },
  offline: { color: 'text-accent-red', icon: XCircle },
  degraded: { color: 'text-accent-yellow', icon: AlertCircle },
  starting: { color: 'text-accent-blue', icon: Loader2, pulse: true },
  stopping: { color: 'text-accent-yellow', icon: Loader2, pulse: true },
  unknown: { color: 'text-text-muted', icon: HelpCircle },
}

// Batch operations component
interface BatchActionsProps {
  selectedIds: string[]
  actions: {
    label: string
    icon: LucideIcon
    onClick: (ids: string[]) => void
    variant?: 'default' | 'danger'
    confirm?: string // Confirmation message
  }[]
}
```

**New Features**:

- Multi-select with Shift+Click in service lists
- Batch start/stop/restart for MCP servers
- Batch enable/disable for profiles
- Action history per service (last 10 actions)

---

## 5. Theme Override Architecture

### Webmin Pattern

Themes can override module-specific CSS and templates without modifying core code.

### Claude Pilot Implementation

**Target**: Component theming, custom branding

```typescript
// src/renderer/themes/theme-context.tsx
interface ThemeOverrides {
  // Color overrides
  colors?: Partial<ThemeColors>

  // Component overrides
  components?: {
    [componentName: string]: {
      className?: string
      style?: React.CSSProperties
    }
  }

  // Custom CSS
  customCSS?: string
}

// Theme provider with override support
function ThemeProvider({ theme, overrides, children }: ThemeProviderProps) {
  // Merge base theme with overrides
  const mergedTheme = useMemo(() => deepMerge(theme, overrides), [theme, overrides])

  return (
    <ThemeContext.Provider value={mergedTheme}>
      {overrides?.customCSS && <style>{overrides.customCSS}</style>}
      {children}
    </ThemeContext.Provider>
  )
}
```

**Benefits**:

- Enterprise customers can apply custom branding
- Users can customize without modifying source
- Dark/light/custom theme variants

---

## 6. Intelligent Caching

### Webmin Pattern

- File stat-based cache invalidation
- Config file caching with dependency tracking
- In-memory caching for frequent reads

### Claude Pilot Implementation

**Target**: Session discovery, MCP config, file watchers

```typescript
// src/main/services/cache/file-cache.ts
interface FileCacheEntry<T> {
  data: T
  mtime: number
  size: number
  checksum?: string
}

class FileCache<T> {
  private cache = new Map<string, FileCacheEntry<T>>()

  async get(filePath: string, parser: (content: string) => T): Promise<T> {
    const stats = await fsPromises.stat(filePath)
    const cached = this.cache.get(filePath)

    if (cached && cached.mtime === stats.mtimeMs && cached.size === stats.size) {
      return cached.data
    }

    const content = await fsPromises.readFile(filePath, 'utf-8')
    const data = parser(content)

    this.cache.set(filePath, {
      data,
      mtime: stats.mtimeMs,
      size: stats.size,
    })

    return data
  }

  invalidate(filePath: string) {
    this.cache.delete(filePath)
  }

  invalidateAll() {
    this.cache.clear()
  }
}
```

**Apply To**:

- Session transcript discovery (cache file list, invalidate on change)
- MCP config loading (cache parsed JSON, invalidate on write)
- Profile loading (cache CLAUDE.md content)

---

## 7. Hierarchical Search

### Webmin Pattern

- Search across all modules with relevance ranking
- Category-based filtering
- Quick navigation to search results

### Claude Pilot Implementation

**Target**: CommandPalette, Global Search

```typescript
// src/renderer/components/common/CommandPalette.tsx
interface SearchResult {
  id: string
  type: 'view' | 'action' | 'session' | 'memory' | 'mcp' | 'profile' | 'setting'
  title: string
  subtitle?: string
  icon?: LucideIcon
  category: string
  score: number
  action: () => void
  keywords?: string[]
}

// Hierarchical search with scoring
function searchAll(query: string): SearchResult[] {
  const results: SearchResult[] = []

  // Search views (highest priority)
  results.push(...searchViews(query).map((r) => ({ ...r, score: r.score * 1.5 })))

  // Search actions
  results.push(...searchActions(query).map((r) => ({ ...r, score: r.score * 1.3 })))

  // Search sessions
  results.push(...searchSessions(query))

  // Search MCP servers
  results.push(...searchMCPServers(query))

  // Search memories
  results.push(...searchMemories(query).map((r) => ({ ...r, score: r.score * 0.8 })))

  // Sort by score descending
  return results.sort((a, b) => b.score - a.score)
}
```

**Enhancements**:

- Type-ahead suggestions
- Recent searches history
- Keyboard navigation (↑/↓ to select, Enter to execute)
- Category filtering (prefix: `mcp:`, `session:`, `memory:`)

---

## 8. Inline Help System

### Webmin Pattern

- Contextual help tooltips
- Documentation links per field
- "What's This?" help mode

### Claude Pilot Implementation

**Target**: All complex settings and features

```tsx
// src/renderer/components/common/HelpTooltip.tsx
interface HelpTooltipProps {
  content: string | React.ReactNode
  docsLink?: string
  placement?: 'top' | 'right' | 'bottom' | 'left'
}

function HelpTooltip({ content, docsLink, placement = 'top' }: HelpTooltipProps) {
  return (
    <Tooltip
      content={
        <div className="max-w-xs p-2">
          <p className="text-sm">{content}</p>
          {docsLink && (
            <a href={docsLink} className="text-accent-blue text-xs mt-2 flex items-center gap-1">
              <ExternalLink className="w-3 h-3" />
              Learn more
            </a>
          )}
        </div>
      }
      placement={placement}
    >
      <HelpCircle className="w-4 h-4 text-text-muted cursor-help" />
    </Tooltip>
  )
}

// Usage
;<FormField label="API Rate Limit">
  <Input type="number" />
  <HelpTooltip
    content="Maximum requests per minute. Lower values reduce API costs."
    docsLink="/docs/rate-limiting"
  />
</FormField>
```

---

## 9. Audit Trail

### Webmin Pattern

- Log all configuration changes
- Who changed what, when
- Rollback capability

### Claude Pilot Implementation

**Target**: Settings, MCP config, profiles

```typescript
// src/main/controllers/audit.controller.ts (enhance existing)
interface AuditEntry {
  id: string
  timestamp: number
  action: 'create' | 'update' | 'delete' | 'enable' | 'disable'
  resource: {
    type: 'mcp_server' | 'profile' | 'setting' | 'session'
    id: string
    name: string
  }
  changes: {
    field: string
    oldValue: unknown
    newValue: unknown
  }[]
  user?: string
  source: 'ui' | 'api' | 'cli' | 'hook'
}

// Audit log viewer component
// src/renderer/components/settings/AuditLog.tsx
// - Filterable by resource type, date range
// - Expandable details for each entry
// - Export to JSON/CSV
```

---

## Implementation Roadmap

### Phase 1: Foundation (Week 1-2)

| Task                             | Priority | Effort |
| -------------------------------- | -------- | ------ |
| Module discovery metadata system | High     | 3 days |
| Enhanced status indicators       | High     | 2 days |
| Progressive disclosure component | Medium   | 1 day  |
| File-based caching service       | High     | 2 days |

### Phase 2: UI Enhancements (Week 3-4)

| Task                               | Priority | Effort |
| ---------------------------------- | -------- | ------ |
| Schema-driven form generator       | High     | 4 days |
| CommandPalette search improvements | Medium   | 2 days |
| Batch operations UI                | Medium   | 2 days |
| Inline help tooltips               | Low      | 1 day  |

### Phase 3: Advanced Features (Week 5-6)

| Task                   | Priority | Effort |
| ---------------------- | -------- | ------ |
| Theme override system  | Medium   | 3 days |
| Audit log enhancements | Medium   | 2 days |
| MCP catalog browser    | Medium   | 2 days |
| Config rollback        | Low      | 2 days |

---

## Quick Wins (Implement First)

1. **AdvancedSection component** - 2 hours
2. **Enhanced StatusIndicator** - 2 hours
3. **HelpTooltip component** - 1 hour
4. **Batch selection in lists** - 3 hours
5. **File stat caching** - 4 hours

---

## Related Beads

| Bead | Description                   |
| ---- | ----------------------------- |
| TBD  | Module discovery system       |
| TBD  | Config-driven forms           |
| TBD  | Status dashboard enhancements |
| TBD  | Progressive disclosure UI     |
| TBD  | Theme override architecture   |

---

## References

- Webmin Source: https://github.com/webmin/webmin
- Module Development Guide: https://doxfer.webmin.com/Webmin/Module_Development
- Theme Development: https://doxfer.webmin.com/Webmin/Theme_Development
