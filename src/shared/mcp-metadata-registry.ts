/**
 * MCP Server Metadata Registry
 *
 * Static metadata for known MCP servers. This registry provides
 * descriptions, categories, and capabilities for discovered servers
 * based on their command or name patterns.
 */

import type { MCPServerMetadata, MCPServerCategory } from './types'

// Pattern-based matching for automatic metadata detection
interface MetadataPattern {
  pattern: RegExp
  metadata: MCPServerMetadata
}

// Known MCP server metadata
export const MCP_SERVER_METADATA: Record<string, MCPServerMetadata> = {
  // Database servers
  postgres: {
    name: 'PostgreSQL',
    description: 'Query and manage PostgreSQL databases with SQL support',
    category: 'database',
    capabilities: ['query', 'schema', 'transactions'],
    tags: ['sql', 'relational', 'database'],
  },
  memgraph: {
    name: 'Memgraph',
    description: 'Graph database with Cypher query support',
    category: 'database',
    capabilities: ['cypher', 'graph-queries', 'schema'],
    tags: ['graph', 'cypher', 'database'],
  },
  'neon-local': {
    name: 'Neon PostgreSQL',
    description: 'Serverless PostgreSQL with branching support',
    category: 'database',
    capabilities: ['query', 'branching', 'migrations'],
    tags: ['sql', 'serverless', 'postgresql'],
  },

  // Filesystem servers
  filesystem: {
    name: 'Filesystem',
    description: 'Read, write, and manage local files and directories',
    category: 'filesystem',
    capabilities: ['read', 'write', 'list', 'search'],
    tags: ['files', 'directories', 'local'],
  },
  'desktop-commander': {
    name: 'Desktop Commander',
    description: 'Advanced file operations and process management',
    category: 'filesystem',
    capabilities: ['read', 'write', 'processes', 'search'],
    tags: ['files', 'processes', 'desktop'],
  },

  // Browser automation
  playwright: {
    name: 'Playwright',
    description: 'Browser automation for web scraping and testing',
    category: 'browser',
    capabilities: ['navigate', 'click', 'screenshot', 'forms'],
    tags: ['browser', 'automation', 'web'],
  },
  browsermcp: {
    name: 'Browser MCP',
    description: 'Lightweight browser automation',
    category: 'browser',
    capabilities: ['navigate', 'click', 'type', 'screenshot'],
    tags: ['browser', 'automation'],
  },
  'chrome-devtools': {
    name: 'Chrome DevTools',
    description: 'Chrome DevTools Protocol integration',
    category: 'browser',
    capabilities: ['evaluate', 'network', 'performance', 'console'],
    tags: ['chrome', 'devtools', 'debugging'],
  },
  'claude-in-chrome': {
    name: 'Claude in Chrome',
    description: 'Chrome extension for AI-assisted browsing',
    category: 'browser',
    capabilities: ['navigate', 'read', 'interact', 'screenshot'],
    tags: ['chrome', 'extension', 'ai'],
  },

  // Memory and knowledge
  'memory-keeper': {
    name: 'Memory Keeper',
    description: 'Session context and checkpoint management',
    category: 'memory',
    capabilities: ['save', 'restore', 'search', 'checkpoint'],
    tags: ['memory', 'context', 'sessions'],
  },
  'claude-flow': {
    name: 'Claude Flow',
    description: 'Agent orchestration and swarm management',
    category: 'ai',
    capabilities: ['agents', 'swarms', 'workflows', 'memory'],
    tags: ['agents', 'orchestration', 'swarm'],
  },
  'claude-flow_alpha': {
    name: 'Claude Flow Alpha',
    description: 'Experimental agent orchestration features',
    category: 'ai',
    capabilities: ['agents', 'swarms', 'workflows', 'memory'],
    tags: ['agents', 'experimental', 'alpha'],
  },

  // Developer tools
  github: {
    name: 'GitHub',
    description: 'GitHub repository and issue management',
    category: 'developer',
    capabilities: ['repos', 'issues', 'prs', 'code-search'],
    tags: ['git', 'github', 'vcs'],
  },
  beads: {
    name: 'Beads',
    description: 'Work tracking and issue management',
    category: 'developer',
    capabilities: ['create', 'update', 'list', 'dependencies'],
    tags: ['issues', 'tracking', 'tasks'],
  },
  'sequential-thinking': {
    name: 'Sequential Thinking',
    description: 'Step-by-step reasoning and problem solving',
    category: 'ai',
    capabilities: ['reasoning', 'planning', 'analysis'],
    tags: ['thinking', 'reasoning', 'ai'],
  },
  'next-devtools': {
    name: 'Next.js DevTools',
    description: 'Next.js development and debugging tools',
    category: 'developer',
    capabilities: ['docs', 'debug', 'cache'],
    tags: ['nextjs', 'react', 'web'],
  },
  'magic-ui': {
    name: 'Magic UI',
    description: 'AI-powered UI component generation',
    category: 'developer',
    capabilities: ['components', 'design', 'build'],
    tags: ['ui', 'components', 'ai'],
  },

  // Documentation
  context7: {
    name: 'Context7',
    description: 'Documentation search and retrieval',
    category: 'developer',
    capabilities: ['search', 'query', 'resolve'],
    tags: ['docs', 'documentation', 'search'],
  },
  'plugin_document-skills_context7': {
    name: 'Context7 (Plugin)',
    description: 'Documentation search and library resolution',
    category: 'developer',
    capabilities: ['search', 'query', 'resolve-library'],
    tags: ['docs', 'libraries', 'search'],
  },
  'plugin_document-skills_playwright': {
    name: 'Playwright (Plugin)',
    description: 'Document skills with Playwright automation',
    category: 'browser',
    capabilities: ['navigate', 'click', 'screenshot', 'forms'],
    tags: ['browser', 'automation', 'plugin'],
  },
}

// Pattern-based metadata matching for servers not in the registry
const METADATA_PATTERNS: MetadataPattern[] = [
  {
    pattern: /postgres|pg|sql/i,
    metadata: {
      name: 'Database',
      description: 'Database operations and queries',
      category: 'database',
      tags: ['database', 'sql'],
    },
  },
  {
    pattern: /browser|playwright|chrome|puppeteer/i,
    metadata: {
      name: 'Browser',
      description: 'Browser automation and web interaction',
      category: 'browser',
      tags: ['browser', 'web'],
    },
  },
  {
    pattern: /file|fs|directory/i,
    metadata: {
      name: 'Filesystem',
      description: 'File and directory operations',
      category: 'filesystem',
      tags: ['files'],
    },
  },
  {
    pattern: /memory|context|cache/i,
    metadata: {
      name: 'Memory',
      description: 'Memory and context management',
      category: 'memory',
      tags: ['memory'],
    },
  },
  {
    pattern: /github|git|gitlab/i,
    metadata: {
      name: 'Version Control',
      description: 'Version control and repository management',
      category: 'developer',
      tags: ['git', 'vcs'],
    },
  },
  {
    pattern: /ai|llm|claude|agent/i,
    metadata: {
      name: 'AI',
      description: 'AI and agent capabilities',
      category: 'ai',
      tags: ['ai', 'agents'],
    },
  },
  {
    pattern: /security|auth|crypt/i,
    metadata: {
      name: 'Security',
      description: 'Security and authentication',
      category: 'security',
      tags: ['security'],
    },
  },
]

/**
 * Get metadata for an MCP server by name
 */
export function getMCPServerMetadata(serverName: string): MCPServerMetadata | null {
  // Normalize the name for lookup
  const normalizedName = serverName.toLowerCase().replace(/[^a-z0-9_-]/g, '')

  // Direct registry lookup
  if (MCP_SERVER_METADATA[normalizedName]) {
    return MCP_SERVER_METADATA[normalizedName]
  }

  // Try original name
  if (MCP_SERVER_METADATA[serverName]) {
    return MCP_SERVER_METADATA[serverName]
  }

  // Pattern-based matching
  for (const { pattern, metadata } of METADATA_PATTERNS) {
    if (pattern.test(serverName)) {
      return {
        ...metadata,
        name: serverName,
      }
    }
  }

  // Default metadata for unknown servers
  return null
}

/**
 * Infer category from server name or command
 */
export function inferServerCategory(serverName: string, command?: string): MCPServerCategory {
  const searchText = `${serverName} ${command || ''}`.toLowerCase()

  if (/postgres|mysql|sqlite|mongo|redis|memgraph|neo4j|qdrant|database|db/.test(searchText)) {
    return 'database'
  }
  if (/browser|chrome|playwright|puppeteer|selenium/.test(searchText)) {
    return 'browser'
  }
  if (/file|fs|directory|path/.test(searchText)) {
    return 'filesystem'
  }
  if (/memory|context|cache|store/.test(searchText)) {
    return 'memory'
  }
  if (/github|git|gitlab|bitbucket|code|dev/.test(searchText)) {
    return 'developer'
  }
  if (/ai|llm|claude|agent|model|embed/.test(searchText)) {
    return 'ai'
  }
  if (/api|http|rest|graphql|fetch/.test(searchText)) {
    return 'api'
  }
  if (/security|auth|crypt|vault|secret/.test(searchText)) {
    return 'security'
  }
  if (/note|todo|task|calendar|email/.test(searchText)) {
    return 'productivity'
  }

  return 'other'
}

/**
 * Get category color for UI display
 */
export function getCategoryColor(category: MCPServerCategory): string {
  const colors: Record<MCPServerCategory, string> = {
    database: 'text-accent-blue',
    filesystem: 'text-accent-yellow',
    browser: 'text-accent-purple',
    api: 'text-accent-green',
    memory: 'text-accent-blue',
    developer: 'text-accent-purple',
    ai: 'text-accent-purple',
    productivity: 'text-accent-green',
    security: 'text-accent-red',
    other: 'text-text-muted',
  }
  return colors[category]
}

/**
 * Get category icon name for UI display
 */
export function getCategoryIcon(category: MCPServerCategory): string {
  const icons: Record<MCPServerCategory, string> = {
    database: 'Database',
    filesystem: 'FolderOpen',
    browser: 'Globe',
    api: 'Plug',
    memory: 'Brain',
    developer: 'Code',
    ai: 'Sparkles',
    productivity: 'CheckSquare',
    security: 'Shield',
    other: 'Server',
  }
  return icons[category]
}
