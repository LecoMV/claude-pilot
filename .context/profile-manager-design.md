# Claude Code Profile Manager - Design Document

## Overview

The Profile Manager enables users to create, manage, and switch between different Claude Code configurations optimized for specific workflows (security research, web development, data science, etc.).

## Discovered Configuration Points

From research of `~/.claude/` and CLI options:

### 1. Core Settings (`settings.json`)
```json
{
  "max_tokens": 64000,           // Token limit per response
  "thinking": {
    "type": "enabled",           // enabled | disabled
    "budget_tokens": 32000       // Extended thinking budget
  },
  "autoCompact": true,           // Auto-compaction
  "verbose": true,               // Verbose logging
  "cleanupPeriodDays": 1,        // Session cleanup
  "fileSuggestion": { ... },     // File suggestion command
  "env": { ... },                // Environment variables
  "permissions": {
    "allow": [ ... ],            // Tool whitelist
    "deny": [ ... ]              // Tool blacklist
  }
}
```

### 2. Instructions (`CLAUDE.md` + `rules/*.md`)
- Global instructions in `~/.claude/CLAUDE.md`
- Additional rules in `~/.claude/rules/`
- Project-level override in `.claude/CLAUDE.md`

### 3. MCP Servers (`mcp.json`)
- Server definitions with command, args, env
- Can enable/disable per profile

### 4. Custom Commands (`commands/`)
- Slash commands for workflows
- Category-organized (security/, coding/, etc.)

### 5. Hooks (`hooks/`)
- Event-driven scripts
- Pre/post tool execution
- Session lifecycle events

### 6. CLI Override Options
```bash
--model <model>                    # Model selection
--system-prompt <prompt>           # Override system prompt
--append-system-prompt <prompt>    # Append to prompt
--allowedTools <tools>             # Tool whitelist
--disallowedTools <tools>          # Tool blacklist
--agents <json>                    # Custom agents
--permission-mode <mode>           # Permission handling
--settings <file>                  # Load settings file
```

---

## Profile Structure

Each profile is a self-contained configuration bundle:

```
~/.claude/profiles/
├── security/
│   ├── profile.json          # Profile metadata + settings
│   ├── CLAUDE.md             # Profile-specific instructions
│   ├── rules/
│   │   ├── pentest-rules.md
│   │   └── opsec-rules.md
│   ├── mcp-servers.json      # MCP server subset
│   ├── commands/             # Profile-specific commands
│   ├── hooks/                # Profile-specific hooks
│   └── wordlists/            # Profile resources
├── webdev/
│   ├── profile.json
│   ├── CLAUDE.md
│   ├── rules/
│   │   ├── react-patterns.md
│   │   └── accessibility.md
│   └── ...
└── datascience/
    └── ...
```

### Profile Metadata (`profile.json`)
```json
{
  "name": "Security Research",
  "id": "security",
  "description": "Optimized for penetration testing, bug bounty, and security research",
  "icon": "shield",
  "color": "#f38ba8",
  "version": "1.0.0",
  "author": "Alex Mayhew",
  "created": "2025-01-15T00:00:00Z",
  "updated": "2025-01-15T00:00:00Z",

  "settings": {
    "model": "opus",
    "max_tokens": 64000,
    "thinking": {
      "type": "enabled",
      "budget_tokens": 32000
    },
    "verbose": true
  },

  "permissions": {
    "allow": [
      "Bash(nmap:*)",
      "Bash(nikto:*)",
      "Bash(sqlmap:*)",
      "Bash(ffuf:*)",
      "Bash(nuclei:*)",
      "Bash(metasploit:*)"
    ],
    "deny": []
  },

  "mcpServers": [
    "pentest",
    "nmap-mcp",
    "sqlmap-mcp",
    "ffuf-mcp",
    "nuclei-mcp",
    "metasploit"
  ],

  "environment": {
    "HTB_API_KEY": "${HTB_API_KEY}",
    "HACKERONE_API_KEY": "${HACKERONE_API_KEY}"
  },

  "tags": ["security", "pentest", "bugbounty", "ctf"]
}
```

---

## Profile Manager UI Components

### 1. Profile List View
- Card grid showing all profiles
- Active profile highlighted
- Quick switch buttons
- Search/filter by tags

### 2. Profile Editor
Tabbed interface:

#### Tab: General
- Name, description, icon, color
- Tags for categorization
- Author info

#### Tab: Instructions (CLAUDE.md)
- Monaco editor with markdown preview
- Syntax highlighting
- Template insertion
- Import from file

#### Tab: Rules
- List of rule files
- Add/edit/delete rules
- Enable/disable per rule
- Drag-drop reorder (priority)

#### Tab: Model & Tokens
- Model selector (sonnet, opus, haiku)
- Max tokens slider (8K - 200K)
- Extended thinking toggle + budget
- Response length preferences

#### Tab: Permissions
- Tool permission matrix
- Preset groups (security tools, dev tools, etc.)
- Custom pattern editor
- Permission mode selector

#### Tab: MCP Servers
- Server checklist from available
- Per-profile server configuration
- Environment variable overrides

#### Tab: Commands
- Custom command list
- Command editor (markdown)
- Import/export commands

#### Tab: Hooks
- Hook configuration
- Enable/disable hooks
- Hook execution order

#### Tab: Environment
- Environment variable editor
- Secret management (encrypted storage)
- Variable inheritance

### 3. Profile Actions
- **Activate** - Switch to this profile
- **Duplicate** - Clone profile as new
- **Export** - Export as ZIP/JSON
- **Import** - Import from file
- **Share** - Export for sharing (sanitized)
- **Delete** - Remove profile

### 4. Quick Launcher
- Keyboard shortcut (Cmd/Ctrl + Shift + P)
- Fuzzy search profiles
- Recent profiles list
- Context-aware suggestions

---

## Profile Activation Flow

When a profile is activated:

1. **Backup Current** - Save current settings as "previous"
2. **Merge Settings** - Apply profile settings.json
3. **Copy Instructions** - Symlink/copy CLAUDE.md and rules
4. **Configure MCP** - Enable/disable MCP servers
5. **Load Commands** - Merge custom commands
6. **Register Hooks** - Apply hook configuration
7. **Set Environment** - Export environment variables
8. **Validate** - Run health check
9. **Notify** - Show activation toast

### Activation CLI
```bash
# Via Command Center
claude-cc profile activate security

# Via Claude CLI (future integration)
claude --profile security
```

---

## Pre-built Profile Templates

### 1. Security Research
- Identity: Security researcher / pentester
- Tools: nmap, nikto, sqlmap, ffuf, nuclei, metasploit
- MCP: pentest-mcp, security tools
- Rules: OWASP methodology, PTES phases

### 2. Web Development
- Identity: Full-stack web developer
- Tools: npm, git, docker, prisma
- MCP: github, puppeteer, context7
- Rules: React patterns, accessibility, TDD

### 3. Data Science
- Identity: Data scientist / ML engineer
- Tools: python, jupyter, conda
- MCP: Sequential thinking
- Rules: Statistical rigor, visualization best practices

### 4. DevOps / SRE
- Identity: Site reliability engineer
- Tools: kubectl, terraform, ansible
- MCP: github, sequential-thinking
- Rules: Infrastructure as code, observability

### 5. Technical Writing
- Identity: Technical documentation writer
- Tools: git, markdown tools
- MCP: fetch, context7
- Rules: Documentation standards, clarity

### 6. Code Review
- Identity: Senior code reviewer
- Tools: git, static analysis
- MCP: github
- Rules: Security review checklist, performance patterns

---

## Implementation Phases

### Phase 1: Core Profile System
- Profile data structure
- Storage and serialization
- Basic CRUD operations
- Profile activation logic

### Phase 2: Profile Editor UI
- Monaco editor integration
- Settings forms
- MCP server selector
- Permission matrix

### Phase 3: Advanced Features
- Profile templates
- Import/export
- Quick launcher
- Profile sharing

### Phase 4: Claude CLI Integration
- `--profile` flag support
- Profile auto-detection
- Project-level profiles

---

## Technical Considerations

### Storage
- Profiles stored in `~/.claude/profiles/`
- Active profile symlinked to main config
- SQLite for profile metadata index

### Security
- Secrets encrypted with OS keychain
- No plaintext API keys in profile.json
- Sanitization for shared profiles

### Performance
- Lazy-load profile content
- Cache active profile
- Debounce editor saves

### Compatibility
- Backward compatible with current config
- Migration script for existing setup
- Version checking for profiles

---

## Open Questions for Research

1. Can Claude CLI accept `--profile` or `--settings-dir` for profile switching?
2. Is there an API to reload MCP servers without restart?
3. What's the max size/complexity for CLAUDE.md before performance degrades?
4. Can hooks be conditionally loaded per profile?
5. Is there a way to scope permissions per project + profile combination?
