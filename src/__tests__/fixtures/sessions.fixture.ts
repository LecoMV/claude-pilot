/**
 * Session Test Fixtures
 *
 * Provides realistic test data for session-related tests.
 * Use these fixtures to create consistent, realistic test scenarios.
 *
 * @module sessions.fixture
 */

// ===========================================================================
// SESSION TYPES (matching actual API types)
// ===========================================================================

export interface SessionFixture {
  id: string
  projectPath: string
  filePath: string
  startTime: number
  lastActivity: number
  isActive: boolean
  stats: {
    messageCount: number
    toolCalls: number
    inputTokens: number
    outputTokens: number
    duration: number
  }
  processInfo?: {
    pid: number
    profile?: string
    workingDir?: string
  }
}

export interface MessageFixture {
  id: string
  sessionId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  toolCalls?: ToolCallFixture[]
  stats?: {
    inputTokens: number
    outputTokens: number
    duration: number
  }
}

export interface ToolCallFixture {
  id: string
  name: string
  input: Record<string, unknown>
  output?: string
  duration: number
  status: 'pending' | 'success' | 'error'
}

export interface TranscriptEntryFixture {
  type: 'user' | 'assistant' | 'system' | 'tool_use' | 'tool_result'
  timestamp: number
  message?: string
  content?: Array<{ type: string; text?: string; name?: string; input?: unknown }>
  toolResult?: { tool_use_id: string; content: string }
}

// ===========================================================================
// SESSIONS FIXTURES
// ===========================================================================

export const createSessionFixture = (overrides: Partial<SessionFixture> = {}): SessionFixture => ({
  id: `session-${Math.random().toString(36).substring(7)}`,
  projectPath: '/home/user/projects/my-app',
  filePath: '/home/user/.claude/projects/-home-user-projects-my-app/transcript.jsonl',
  startTime: Date.now() - 3600000, // 1 hour ago
  lastActivity: Date.now() - 60000, // 1 minute ago
  isActive: false,
  stats: {
    messageCount: 25,
    toolCalls: 12,
    inputTokens: 15000,
    outputTokens: 8000,
    duration: 3540000, // ~59 minutes
  },
  ...overrides,
})

export const activeSessionFixture: SessionFixture = createSessionFixture({
  id: 'active-session-001',
  projectPath: '/home/user/projects/claude-pilot',
  filePath: '/home/user/.claude/projects/-home-user-projects-claude-pilot/transcript.jsonl',
  lastActivity: Date.now() - 5000, // 5 seconds ago
  isActive: true,
  processInfo: {
    pid: 12345,
    profile: 'engineering',
    workingDir: '/home/user/projects/claude-pilot',
  },
})

export const inactiveSessionFixture: SessionFixture = createSessionFixture({
  id: 'inactive-session-001',
  projectPath: '/home/user/projects/old-project',
  lastActivity: Date.now() - 86400000, // 1 day ago
  isActive: false,
})

export const longSessionFixture: SessionFixture = createSessionFixture({
  id: 'long-session-001',
  stats: {
    messageCount: 500,
    toolCalls: 250,
    inputTokens: 500000,
    outputTokens: 250000,
    duration: 28800000, // 8 hours
  },
})

export const sessionListFixture: SessionFixture[] = [
  activeSessionFixture,
  inactiveSessionFixture,
  createSessionFixture({
    id: 'session-002',
    projectPath: '/home/user/projects/api-server',
    stats: { messageCount: 15, toolCalls: 5, inputTokens: 8000, outputTokens: 4000, duration: 1800000 },
  }),
  createSessionFixture({
    id: 'session-003',
    projectPath: '/home/user/projects/web-client',
    stats: { messageCount: 42, toolCalls: 18, inputTokens: 25000, outputTokens: 15000, duration: 5400000 },
  }),
]

// ===========================================================================
// MESSAGE FIXTURES
// ===========================================================================

export const createMessageFixture = (overrides: Partial<MessageFixture> = {}): MessageFixture => ({
  id: `msg-${Math.random().toString(36).substring(7)}`,
  sessionId: 'session-001',
  role: 'user',
  content: 'Hello, can you help me with my code?',
  timestamp: Date.now(),
  ...overrides,
})

export const userMessageFixture: MessageFixture = createMessageFixture({
  id: 'msg-user-001',
  role: 'user',
  content: 'Can you refactor this function to use async/await?',
})

export const assistantMessageFixture: MessageFixture = createMessageFixture({
  id: 'msg-assistant-001',
  role: 'assistant',
  content: "I'll help you refactor that function. Let me read the file first.",
  stats: {
    inputTokens: 150,
    outputTokens: 45,
    duration: 2500,
  },
})

export const assistantWithToolsFixture: MessageFixture = createMessageFixture({
  id: 'msg-assistant-002',
  role: 'assistant',
  content: "I've found the function. Here's my refactored version:",
  toolCalls: [
    {
      id: 'tool-001',
      name: 'Read',
      input: { file_path: '/home/user/projects/my-app/src/utils.ts' },
      output: 'export function processData(data) { ... }',
      duration: 150,
      status: 'success',
    },
    {
      id: 'tool-002',
      name: 'Edit',
      input: {
        file_path: '/home/user/projects/my-app/src/utils.ts',
        old_string: 'function processData(data) {',
        new_string: 'async function processData(data: Data): Promise<Result> {',
      },
      output: 'File edited successfully',
      duration: 200,
      status: 'success',
    },
  ],
  stats: {
    inputTokens: 2500,
    outputTokens: 800,
    duration: 15000,
  },
})

export const messageListFixture: MessageFixture[] = [
  userMessageFixture,
  assistantMessageFixture,
  createMessageFixture({
    id: 'msg-user-002',
    role: 'user',
    content: 'Thanks! Can you also add error handling?',
  }),
  assistantWithToolsFixture,
]

// ===========================================================================
// TRANSCRIPT FIXTURES (JSONL format)
// ===========================================================================

export const createTranscriptEntryFixture = (
  overrides: Partial<TranscriptEntryFixture> = {}
): TranscriptEntryFixture => ({
  type: 'user',
  timestamp: Date.now(),
  message: 'Hello Claude',
  ...overrides,
})

export const transcriptUserEntry: TranscriptEntryFixture = {
  type: 'user',
  timestamp: Date.now() - 60000,
  message: 'Help me fix this bug',
}

export const transcriptAssistantEntry: TranscriptEntryFixture = {
  type: 'assistant',
  timestamp: Date.now() - 55000,
  content: [
    {
      type: 'text',
      text: "I'll help you fix that bug. Let me examine the code.",
    },
    {
      type: 'tool_use',
      name: 'Read',
      input: { file_path: '/home/user/projects/my-app/src/bug.ts' },
    },
  ],
}

export const transcriptToolResultEntry: TranscriptEntryFixture = {
  type: 'tool_result',
  timestamp: Date.now() - 54000,
  toolResult: {
    tool_use_id: 'tool-use-001',
    content: 'export function buggyFunction() { /* code */ }',
  },
}

export const transcriptEntriesFixture: TranscriptEntryFixture[] = [
  transcriptUserEntry,
  transcriptAssistantEntry,
  transcriptToolResultEntry,
  {
    type: 'assistant',
    timestamp: Date.now() - 50000,
    content: [{ type: 'text', text: "I found the bug. Here's the fix:" }],
  },
]

/**
 * Creates a JSONL string from transcript entries.
 * Use this when mocking file reads.
 */
export const createTranscriptJsonl = (entries: TranscriptEntryFixture[]): string =>
  entries.map((entry) => JSON.stringify(entry)).join('\n')

// ===========================================================================
// PROCESS INFO FIXTURES
// ===========================================================================

export interface ProcessInfoFixture {
  pid: number
  command: string
  args: string[]
  cwd: string
  startTime: number
  profile?: string
}

export const createProcessInfoFixture = (
  overrides: Partial<ProcessInfoFixture> = {}
): ProcessInfoFixture => ({
  pid: Math.floor(Math.random() * 100000) + 1000,
  command: 'claude',
  args: ['--profile', 'engineering', '--project', '/home/user/projects/my-app'],
  cwd: '/home/user/projects/my-app',
  startTime: Date.now() - 600000,
  profile: 'engineering',
  ...overrides,
})

export const activeProcessFixture: ProcessInfoFixture = createProcessInfoFixture({
  pid: 12345,
  profile: 'engineering',
})

export const anotherActiveProcessFixture: ProcessInfoFixture = createProcessInfoFixture({
  pid: 67890,
  profile: 'security',
  cwd: '/home/user/security-audit',
  args: ['--profile', 'security', '--project', '/home/user/security-audit'],
})

// ===========================================================================
// EDGE CASE FIXTURES
// ===========================================================================

export const emptySessionFixture: SessionFixture = createSessionFixture({
  id: 'empty-session',
  stats: {
    messageCount: 0,
    toolCalls: 0,
    inputTokens: 0,
    outputTokens: 0,
    duration: 0,
  },
})

export const corruptedSessionFixture = {
  id: 'corrupted-session',
  // Missing required fields to test error handling
  projectPath: '/home/user/projects/corrupted',
}

export const maliciousSessionIdFixtures = [
  '../../../etc/passwd',
  '..\\..\\..\\windows\\system32',
  '/etc/shadow',
  'session;rm -rf /',
  'session|cat /etc/passwd',
  'session`whoami`',
  'session$(id)',
]
