/**
 * Profile Test Fixtures
 *
 * Provides realistic test data for Claude profile-related tests.
 * Use these fixtures to create consistent, realistic test scenarios.
 *
 * @module profiles.fixture
 */

// ===========================================================================
// PROFILE TYPES (matching actual API types)
// ===========================================================================

export interface ProfileFixture {
  name: string
  displayName?: string
  description?: string
  path: string
  isActive: boolean
  lastUsed?: number
  settings: ProfileSettingsFixture
  stats?: ProfileStatsFixture
}

export interface ProfileSettingsFixture {
  theme?: 'dark' | 'light' | 'system'
  model?: string
  maxTokens?: number
  temperature?: number
  systemPrompt?: string
  allowedTools?: string[]
  mcpServers?: string[]
  customInstructions?: string
}

export interface ProfileStatsFixture {
  totalSessions: number
  totalMessages: number
  totalTokensUsed: number
  averageSessionDuration: number
}

export interface ClaudeSettingsFixture {
  version: string
  profiles: Record<string, ProfileSettingsFixture>
  activeProfile?: string
  global: GlobalSettingsFixture
}

export interface GlobalSettingsFixture {
  defaultModel: string
  autoUpdate: boolean
  telemetry: boolean
  theme: 'dark' | 'light' | 'system'
  editor: {
    fontSize: number
    fontFamily: string
    lineHeight: number
  }
  terminal: {
    fontSize: number
    fontFamily: string
    cursorStyle: 'block' | 'underline' | 'bar'
  }
}

// ===========================================================================
// PROFILE FIXTURES
// ===========================================================================

export const createProfileFixture = (overrides: Partial<ProfileFixture> = {}): ProfileFixture => ({
  name: 'default',
  displayName: 'Default Profile',
  description: 'Standard Claude configuration',
  path: '/home/user/.claude-profiles/default/CLAUDE.md',
  isActive: false,
  lastUsed: Date.now() - 86400000,
  settings: {
    theme: 'dark',
    model: 'claude-sonnet-4-20250514',
    maxTokens: 8192,
    temperature: 0.7,
  },
  ...overrides,
})

export const engineeringProfileFixture: ProfileFixture = createProfileFixture({
  name: 'engineering',
  displayName: 'Engineering',
  description: 'Principal Software Architect focused on modern web development',
  path: '/home/user/.claude-profiles/engineering/CLAUDE.md',
  isActive: true,
  lastUsed: Date.now(),
  settings: {
    theme: 'dark',
    model: 'claude-opus-4-20250514',
    maxTokens: 16384,
    temperature: 0.5,
    systemPrompt:
      'You are a Principal Software Architect focused on modern web development with security awareness.',
    allowedTools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'],
    mcpServers: ['github', 'filesystem', 'postgresql', 'memgraph'],
  },
  stats: {
    totalSessions: 150,
    totalMessages: 4500,
    totalTokensUsed: 2500000,
    averageSessionDuration: 3600000,
  },
})

export const securityProfileFixture: ProfileFixture = createProfileFixture({
  name: 'security',
  displayName: 'Security Researcher',
  description: 'Offensive security specialist for pentesting and CTF challenges',
  path: '/home/user/.claude-profiles/security/CLAUDE.md',
  isActive: false,
  lastUsed: Date.now() - 172800000,
  settings: {
    theme: 'dark',
    model: 'claude-opus-4-20250514',
    maxTokens: 16384,
    temperature: 0.3,
    systemPrompt:
      'You are an elite security researcher specializing in penetration testing and vulnerability research.',
    allowedTools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'WebFetch'],
    mcpServers: ['github', 'filesystem', 'memgraph', 'cybersec-kb'],
    customInstructions: 'Follow PTES methodology. Document all findings.',
  },
  stats: {
    totalSessions: 75,
    totalMessages: 2200,
    totalTokensUsed: 1500000,
    averageSessionDuration: 5400000,
  },
})

export const tradingProfileFixture: ProfileFixture = createProfileFixture({
  name: 'trading',
  displayName: 'Crypto Trading',
  description: 'Cryptocurrency market analysis and trading strategies',
  path: '/home/user/.claude-profiles/trading/CLAUDE.md',
  isActive: false,
  lastUsed: Date.now() - 604800000,
  settings: {
    theme: 'dark',
    model: 'claude-sonnet-4-20250514',
    maxTokens: 8192,
    temperature: 0.4,
    mcpServers: ['github', 'postgresql'],
  },
  stats: {
    totalSessions: 25,
    totalMessages: 800,
    totalTokensUsed: 400000,
    averageSessionDuration: 2700000,
  },
})

export const minimalProfileFixture: ProfileFixture = createProfileFixture({
  name: 'minimal',
  displayName: 'Minimal',
  description: 'Bare minimum configuration',
  path: '/home/user/.claude-profiles/minimal/CLAUDE.md',
  settings: {},
})

export const profileListFixture: ProfileFixture[] = [
  engineeringProfileFixture,
  securityProfileFixture,
  tradingProfileFixture,
  minimalProfileFixture,
]

// ===========================================================================
// CLAUDE.MD CONTENT FIXTURES
// ===========================================================================

export const engineeringClaudeMdFixture = `# Claude Code - Engineering Profile

## Identity
Principal Software Architect with security awareness.

## Non-Negotiables
1. **Read Before Write** - Never modify without reading first
2. **No API Hallucination** - Fetch docs or admit uncertainty
3. **TDD for Core Logic** - Test before implementation
4. **OWASP Aware** - Write secure code by default

## Stack Preferences
- **Frontend:** Next.js, TailwindCSS
- **Backend:** Hono/FastAPI
- **Database:** PostgreSQL/Prisma
- **Testing:** Vitest, Playwright

## Code Style
- TS/JS: Prettier, 2 spaces, explicit types
- Python: Black, 4 spaces, type hints
`

export const securityClaudeMdFixture = `# Claude Code - Security Profile

## Identity
Elite security researcher specializing in penetration testing.

## Methodology
Follow PTES (Penetration Testing Execution Standard):
1. Pre-engagement Interactions
2. Intelligence Gathering
3. Threat Modeling
4. Vulnerability Analysis
5. Exploitation
6. Post Exploitation
7. Reporting

## Tools
- Nmap, Rustscan
- Nuclei, Burp Suite
- Metasploit, SQLMap
- Custom scripts

## Documentation
Always document:
- Findings with severity ratings
- Reproduction steps
- Remediation recommendations
`

export const createClaudeMdContent = (profile: ProfileFixture): string => `# ${profile.displayName || profile.name}

${profile.description || 'No description provided.'}

${profile.settings.systemPrompt ? `## System Prompt\n${profile.settings.systemPrompt}\n` : ''}

## Settings
- Model: ${profile.settings.model || 'claude-sonnet-4-20250514'}
- Max Tokens: ${profile.settings.maxTokens || 8192}
- Temperature: ${profile.settings.temperature || 0.7}
`

// ===========================================================================
// SETTINGS FILE FIXTURES
// ===========================================================================

export const createClaudeSettingsFixture = (
  overrides: Partial<ClaudeSettingsFixture> = {}
): ClaudeSettingsFixture => ({
  version: '1.0.0',
  profiles: {
    default: { theme: 'dark', model: 'claude-sonnet-4-20250514' },
    engineering: { theme: 'dark', model: 'claude-opus-4-20250514', maxTokens: 16384 },
    security: { theme: 'dark', model: 'claude-opus-4-20250514', temperature: 0.3 },
  },
  activeProfile: 'engineering',
  global: {
    defaultModel: 'claude-sonnet-4-20250514',
    autoUpdate: true,
    telemetry: false,
    theme: 'dark',
    editor: {
      fontSize: 14,
      fontFamily: 'JetBrains Mono',
      lineHeight: 1.5,
    },
    terminal: {
      fontSize: 14,
      fontFamily: 'JetBrains Mono',
      cursorStyle: 'block',
    },
  },
  ...overrides,
})

export const claudeSettingsJsonFixture: ClaudeSettingsFixture = createClaudeSettingsFixture()

export const minimalSettingsFixture: ClaudeSettingsFixture = createClaudeSettingsFixture({
  profiles: {},
  activeProfile: undefined,
})

// ===========================================================================
// MCP SERVER FIXTURES (related to profiles)
// ===========================================================================

export interface MCPServerConfigFixture {
  name: string
  command: string
  args: string[]
  env?: Record<string, string>
  enabled: boolean
  description?: string
}

export const createMCPServerConfigFixture = (
  overrides: Partial<MCPServerConfigFixture> = {}
): MCPServerConfigFixture => ({
  name: 'test-server',
  command: 'npx',
  args: ['-y', '@test/mcp-server'],
  enabled: true,
  ...overrides,
})

export const githubMCPServerFixture: MCPServerConfigFixture = createMCPServerConfigFixture({
  name: 'github',
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-github'],
  env: { GITHUB_TOKEN: '${GITHUB_TOKEN}' },
  enabled: true,
  description: 'GitHub API integration',
})

export const filesystemMCPServerFixture: MCPServerConfigFixture = createMCPServerConfigFixture({
  name: 'filesystem',
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-filesystem', '/home/user'],
  enabled: true,
  description: 'Filesystem access',
})

export const postgresqlMCPServerFixture: MCPServerConfigFixture = createMCPServerConfigFixture({
  name: 'postgresql',
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-postgres'],
  env: { POSTGRES_URL: '${POSTGRES_URL}' },
  enabled: true,
  description: 'PostgreSQL database access',
})

export const mcpServerListFixture: MCPServerConfigFixture[] = [
  githubMCPServerFixture,
  filesystemMCPServerFixture,
  postgresqlMCPServerFixture,
  createMCPServerConfigFixture({
    name: 'disabled-server',
    command: 'node',
    args: ['./disabled-server.js'],
    enabled: false,
  }),
]

// ===========================================================================
// EDGE CASE FIXTURES
// ===========================================================================

export const emptyProfileFixture: ProfileFixture = createProfileFixture({
  name: 'empty',
  settings: {},
  stats: undefined,
})

export const corruptedProfileFixture = {
  name: 'corrupted',
  // Missing required fields
}

export const maliciousProfileNameFixtures = [
  '../../../etc/passwd',
  '..\\..\\..\\windows\\system32',
  'profile;rm -rf /',
  'profile|cat /etc/passwd',
  'profile`whoami`',
  'profile$(id)',
  'profile\x00null',
  '<script>alert("xss")</script>',
]
