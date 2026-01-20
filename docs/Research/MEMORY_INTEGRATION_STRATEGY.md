# Memory Integration Strategy for Claude Code

**Research Date:** January 20, 2026
**Status:** Comprehensive Analysis with Implementation Recommendations

## Executive Summary

Claude Code instances currently don't automatically leverage external memory systems (Mem0/Qdrant, Memgraph, PostgreSQL) despite their availability. This research identifies the integration gaps and provides actionable patterns to make memory retrieval automatic rather than manual.

**Key Finding:** Memory integration requires a multi-layered approach combining MCP servers, hooks, CLAUDE.md instructions, and pre-session context priming.

---

## Current Memory Architecture Analysis

### Existing Memory Systems

| System                     | Type              | Status           | Records         | Purpose                        |
| -------------------------- | ----------------- | ---------------- | --------------- | ------------------------------ |
| **PostgreSQL Learnings**   | Relational DB     | ✅ Active        | ~100+ learnings | Text-based session insights    |
| **Qdrant (mem0_memories)** | Vector DB         | ⚠️ Underutilized | 6 vectors       | Semantic search via embeddings |
| **Memgraph**               | Knowledge Graph   | ⚠️ Inaccessible  | 1.7M+ nodes     | CybersecKB relationships       |
| **Memory-Keeper MCP**      | Checkpoint System | ✅ Active        | ~4 checkpoints  | Session state persistence      |
| **CLAUDE.md**              | Static Context    | ✅ Active        | Per-project     | Project instructions           |

### The Integration Gap

**Problem:** Memory systems exist but are **passive** - they require explicit invocation via:

- Manual `/recall` commands
- Explicit MCP tool calls (`mcp__memory-keeper__context_get`)
- Direct database queries (`psql`, `curl`)

**Root Cause:** Claude Code has no built-in RAG (Retrieval Augmented Generation) layer that automatically:

1. Detects when context is needed
2. Queries memory systems
3. Injects results into the prompt

---

## How Claude Code's Built-In Memory Works

### Official Memory Systems

Based on [Claude Code documentation](https://code.claude.com/docs/en/memory) and [system prompt analysis](https://github.com/Piebald-AI/claude-code-system-prompts):

1. **CLAUDE.md Files** - Automatically loaded hierarchically:
   - Recursively scanned from current directory up to root
   - Concatenated into system prompt
   - ~16KB token limit enforced

2. **Settings.json** - User preferences:
   - Location: `~/.claude/settings.json`
   - Defines environment, permissions, MCP servers
   - Loaded at session initialization

3. **Session Transcripts** - Conversation history:
   - Location: `~/.claude/projects/<project>/transcript.jsonl`
   - Used for compaction and context resumption
   - Not automatically queried across sessions

4. **Compaction Summaries** - Compressed context:
   - Generated when context window fills
   - Stored in transcript file
   - Used to maintain long-term session continuity

### Extension Points

Claude Code provides hooks for custom integration:

- `PreToolUse` / `PostToolUse` - Intercept tool calls
- `UserPromptSubmit` - Pre-process user inputs
- `Stop` - Post-session cleanup
- Custom MCP servers - Expose memory as tools

---

## RAG Integration Patterns for CLI Tools

### Industry Best Practices

Research on [RAG patterns for 2026](https://dev.to/pavanbelagatti/learn-how-to-build-reliable-rag-applications-in-2026-1b7p) reveals:

#### 1. **Agentic RAG Pattern**

- LLM decomposes queries into subqueries
- Parallel retrieval from multiple sources
- Response synthesis with grounding checks
- **Relevance:** Can be implemented via hooks

#### 2. **Bidirectional RAG**

- Generated answers added back to corpus
- Grounding validation prevents hallucination pollution
- **Relevance:** Post-session hooks can write back learnings

#### 3. **Mindscape-Aware RAG**

- Build high-level summaries of long documents
- Summary guides retrieval focus
- **Relevance:** Checkpointing system already does this

### Automatic vs Manual Retrieval

| Pattern                   | Trigger         | Pros          | Cons                         |
| ------------------------- | --------------- | ------------- | ---------------------------- |
| **Pre-Session Injection** | Session start   | Zero latency  | No query-specific retrieval  |
| **Hook-Based Retrieval**  | Tool use events | Context-aware | Adds latency per tool        |
| **Prompt Instruction**    | CLAUDE.md rules | Simple setup  | Relies on LLM compliance     |
| **MCP Auto-Tools**        | Tool capability | Type-safe     | Requires explicit invocation |

**Recommendation:** Hybrid approach combining all four.

---

## MCP Server Memory Integration

### Available Memory MCP Servers

Based on [web research](https://github.com/doobidoo/mcp-memory-service) and [MCP documentation](https://glama.ai/mcp/servers/@michael-denyer/memory-mcp):

#### 1. **MCP Memory Service** (doobidoo)

- **Features:** AI embeddings, 5ms retrieval, auto-capture
- **Integration:** Works with Claude Code + 13 other clients
- **Status:** Not installed in current environment

#### 2. **MCP Memory Keeper** (mkreyman)

- **Features:** SQLite persistence, session-based
- **Location:** `~/mcp-data/memory-keeper/context.db`
- **Status:** ✅ Active (4 checkpoints exist)

#### 3. **Claude Code Memory Server** (Neo4j-based)

- **Features:** Graph relationships, semantic search
- **Status:** Not installed (would require Neo4j)

### Automatic Tool Invocation

Key insight from [MCP tool invocation research](https://github.com/variablesoftware/mcp_tool_invocation):

> "Once added, MCP tools are automatically available to the LLM alongside built-in tools, enabling seamless integration without manual intervention."

**But:** "Available" ≠ "Automatically used". Tools must be:

1. Suggested in system prompt
2. Called explicitly by the LLM
3. Or invoked via hooks

---

## Hook-Based Automatic Memory Retrieval

### Current Hook Implementation

Analyzing existing hooks at `~/.claude/hooks/`:

#### **context-prime.py** (Pre-Session Hook)

```python
def main():
    # Queries:
    # - PostgreSQL vector_memories (top 5)
    # - PostgreSQL learnings (legacy fallback)
    # - Memory-keeper checkpoint (latest)
    # - Qdrant count (metadata only)

    # Output injected into context: ~300-500 tokens
    print("## Memory Context")
    print("**Recent Learnings:**")
    # ... formatted memories
```

**Strengths:**

- Zero-latency (pre-computed)
- Compact token usage
- Multi-source aggregation

**Weaknesses:**

- Not query-specific
- Limited to 5 recent items
- No semantic search

#### **auto-persist-learning.py** (Post-Tool Hook)

```python
# Triggers on: WebSearch, WebFetch, Task
# Stores to:
# - PostgreSQL pgvector (with nomic-embed-text embeddings)
# - Memgraph (entity extraction)
# - Optionally Backboard.io (cloud sync)

# Automatic categorization:
# security, architecture, technique, tool, learning, project
```

**Strengths:**

- Automatic write-back (bidirectional RAG)
- Multi-backend storage
- Category classification

**Weaknesses:**

- Requires Ollama for embeddings
- 25 learning/session limit
- Not used for retrieval (write-only)

### Hook Invocation Flow

From [Claude Code hooks documentation](https://code.claude.com/docs/en/hooks):

```
Session Start
  ↓
UserPromptSubmit Hook (can inject context)
  ↓
PreToolUse Hook (can modify tool inputs)
  ↓
Tool Execution
  ↓
PostToolUse Hook (can capture outputs)
  ↓
Stop Hook (cleanup)
```

**Key Opportunity:** `UserPromptSubmit` hook can perform semantic search on user query and inject relevant memories before Claude processes the prompt.

---

## CLAUDE.md Memory Instruction Patterns

### Automatic Loading Mechanism

From [GitHub research](https://github.com/centminmod/my-claude-code-setup):

> "CLAUDE.md files are automatically loaded into Claude Code's context when launched, with content directly injected into the model's prompt context for every session."

**Security Note:** Per [Piebald system prompts](https://github.com/Piebald-AI/claude-code-system-prompts), Claude Code injects a reminder:

> "This context may or may not be relevant to your tasks. You should not respond to this context unless it is highly relevant."

### Effective Memory Instructions

Best practices from [HumanLayer blog](https://www.humanlayer.dev/blog/writing-a-good-claude-md):

#### ❌ Ineffective Pattern

```markdown
## Memory Systems

You have access to PostgreSQL, Memgraph, and Qdrant.
```

→ Too vague, no actionable instructions

#### ✅ Effective Pattern

```markdown
## Automatic Memory Retrieval

**BEFORE answering research questions:**

1. Check PostgreSQL learnings: `sudo -u postgres psql -d claude_memory -c "SELECT content FROM learnings WHERE topic ILIKE '%{query}%' LIMIT 3;"`
2. Check CybersecKB: `python3 ~/cybersec-kb/scripts/query_kb.py "{query}" --limit 5`
3. If embeddings available, query Qdrant: (MCP tool or curl API)

**AFTER completing tasks with new insights:**

- Use `/learn` command to store findings
- Or rely on auto-persist-learning hook (automatic)

**Retrieval Priority:**

1. CybersecKB (3M techniques) - ALWAYS search first for security topics
2. PostgreSQL learnings - Your personal knowledge base
3. Memory-Keeper checkpoints - Recent session context
```

---

## Implementation Recommendations

### Phase 1: Immediate Wins (1-2 hours)

#### 1.1 Enhanced CLAUDE.md Instructions

Add to `~/.claude/CLAUDE.md`:

````markdown
## Memory System Integration Protocol

### Research Workflow (MANDATORY for security/architecture questions)

1. **CybersecKB First:** Before answering ANY cybersecurity question:
   ```bash
   python3 /home/deploy/cybersec-kb/scripts/query_kb.py "<topic>" --limit 10
   ```
````

2. **Check Past Learnings:** For project-specific or repeated questions:

   ```bash
   sudo -u postgres psql -d claude_memory -c "SELECT topic, content FROM learnings WHERE topic ILIKE '%<keyword>%' OR content ILIKE '%<keyword>%' ORDER BY created_at DESC LIMIT 5;"
   ```

3. **Session Context:** Check latest checkpoint:
   ```bash
   cat $(ls -t /home/deploy/mcp-data/memory-keeper/checkpoint-*.json | head -1)
   ```

### Auto-Persist Enabled

- WebSearch, WebFetch, Task outputs automatically saved
- No manual `/learn` needed for research findings
- Limit: 25 learnings/session

### Query Memory On Demand

- `/recall "topic"` - Semantic search (if implemented)
- `bd search "keyword"` - Search Beads issues

````

#### 1.2 Fix Memgraph Connectivity

Current status: Connection failed

```bash
# Check if Memgraph is running
sudo systemctl status memgraph

# If not running, start it
sudo systemctl start memgraph

# Test connection
python3 -c "from memgraph import Memgraph; db=Memgraph('127.0.0.1', 7687); print('Connected')"

# Add to CLAUDE.md once working:
# CybersecKB Query: python3 ~/cybersec-kb/scripts/query_kb.py
````

#### 1.3 Populate Qdrant with Existing Learnings

Currently only 6 vectors (mostly tests). Backfill from PostgreSQL:

```python
#!/usr/bin/env python3
"""Backfill Qdrant from PostgreSQL learnings."""
import psycopg2
from qdrant_client import QdrantClient
from sentence_transformers import SentenceTransformer

# Initialize
db = psycopg2.connect(dbname="claude_memory", user="deploy", password="...", host="localhost", port=5433)
qdrant = QdrantClient(url="http://localhost:6333")
model = SentenceTransformer('all-MiniLM-L6-v2')

# Fetch learnings
cur = db.cursor()
cur.execute("SELECT id, topic, content, category FROM learnings ORDER BY created_at DESC LIMIT 100")

# Embed and upload
for id, topic, content, category in cur.fetchall():
    vector = model.encode(f"{topic}\n\n{content}")
    qdrant.upsert(
        collection_name="claude_memories",
        points=[{
            "id": id,
            "vector": vector.tolist(),
            "payload": {"topic": topic, "content": content, "category": category}
        }]
    )
```

---

### Phase 2: Hook-Based Retrieval (2-4 hours)

#### 2.1 Semantic Search Hook (UserPromptSubmit)

Create `~/.claude/hooks/semantic-retrieval.py`:

```python
#!/usr/bin/env python3
"""Pre-query semantic memory retrieval."""
import json
import sys
from qdrant_client import QdrantClient
from sentence_transformers import SentenceTransformer

def main():
    # Read user prompt from stdin
    data = json.loads(sys.stdin.read())
    user_prompt = data.get("prompt", "")

    if len(user_prompt) < 20:
        sys.exit(0)  # Too short to search

    # Generate query embedding
    model = SentenceTransformer('all-MiniLM-L6-v2')
    query_vector = model.encode(user_prompt)

    # Search Qdrant
    qdrant = QdrantClient(url="http://localhost:6333")
    results = qdrant.search(
        collection_name="claude_memories",
        query_vector=query_vector,
        limit=3,
        score_threshold=0.7
    )

    if results:
        print("## Relevant Past Learnings", file=sys.stderr)
        for hit in results:
            print(f"- [{hit.payload['category']}] {hit.payload['topic']}", file=sys.stderr)
            print(f"  {hit.payload['content'][:150]}...", file=sys.stderr)
```

**Configuration:** Add to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "UserPromptSubmit": "~/.claude/hooks/semantic-retrieval.py"
  }
}
```

#### 2.2 CybersecKB Auto-Query Hook

Create `~/.claude/hooks/auto-cybersec-kb.py`:

```python
#!/usr/bin/env python3
"""Automatically query CybersecKB for security keywords."""
import json
import sys
import subprocess
import re

SECURITY_KEYWORDS = [
    "CVE-", "exploit", "vulnerability", "payload", "attack",
    "GTFOBins", "LOLBAS", "privilege escalation", "injection"
]

def main():
    data = json.loads(sys.stdin.read())
    user_prompt = data.get("prompt", "")

    # Check if security-related
    if not any(kw in user_prompt for kw in SECURITY_KEYWORDS):
        sys.exit(0)

    # Extract search term
    match = re.search(r"(CVE-\d{4}-\d+|\b[A-Za-z0-9_-]{3,}\b)", user_prompt)
    if not match:
        sys.exit(0)

    term = match.group(0)

    # Query KB
    result = subprocess.run(
        ["python3", "/home/deploy/cybersec-kb/scripts/query_kb.py", term, "--limit", "3"],
        capture_output=True,
        text=True,
        timeout=10
    )

    if result.returncode == 0 and result.stdout:
        print(f"## CybersecKB Results for '{term}'", file=sys.stderr)
        print(result.stdout, file=sys.stderr)

if __name__ == "__main__":
    main()
```

---

### Phase 3: MCP Memory Server (4-6 hours)

#### 3.1 Install MCP Memory Service

```bash
# Clone and install
cd ~/mcp-servers
git clone https://github.com/doobidoo/mcp-memory-service
cd mcp-memory-service
npm install

# Configure in Claude Code
# Add to MCP server config (location TBD - no ~/.config/mcp found)
```

#### 3.2 Create Custom Memory Aggregator MCP

File: `~/mcp-servers/unified-memory-mcp/index.ts`

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { Pool } from 'pg'
import { QdrantClient } from '@qdrant/js-client-rest'

const server = new Server({
  name: 'unified-memory',
  version: '1.0.0',
})

const pgPool = new Pool({
  host: 'localhost',
  port: 5433,
  database: 'claude_memory',
  user: 'deploy',
  password: process.env.PGPASSWORD,
})

const qdrant = new QdrantClient({ url: 'http://localhost:6333' })

server.setRequestHandler('tools/list', async () => ({
  tools: [
    {
      name: 'search_memories',
      description: 'Semantic search across all memory systems',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          limit: { type: 'number', default: 5 },
        },
        required: ['query'],
      },
    },
    {
      name: 'recall_learning',
      description: 'Get specific learning by topic',
      inputSchema: {
        type: 'object',
        properties: {
          topic: { type: 'string' },
        },
        required: ['topic'],
      },
    },
  ],
}))

server.setRequestHandler('tools/call', async (request) => {
  if (request.params.name === 'search_memories') {
    const { query, limit } = request.params.arguments

    // 1. Semantic search in Qdrant
    const vectorResults = await qdrant.search('claude_memories', {
      vector: await embed(query), // Using Ollama nomic-embed-text
      limit: limit,
    })

    // 2. Keyword search in PostgreSQL
    const pgResults = await pgPool.query(
      'SELECT topic, content, category FROM learnings WHERE topic ILIKE $1 OR content ILIKE $1 LIMIT $2',
      [`%${query}%`, limit]
    )

    // 3. Merge and rank results
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              semantic: vectorResults.map((r) => r.payload),
              keyword: pgResults.rows,
            },
            null,
            2
          ),
        },
      ],
    }
  }
})

// Start server
const transport = new StdioServerTransport()
await server.connect(transport)
```

**Register in settings.json:**

```json
{
  "mcpServers": {
    "unified-memory": {
      "command": "node",
      "args": ["/home/deploy/mcp-servers/unified-memory-mcp/index.js"],
      "env": {
        "PGPASSWORD": "<from pass>"
      }
    }
  }
}
```

#### 3.3 Add MCP Tools to CLAUDE.md

```markdown
## MCP Memory Tools

**Available MCP Tools:**

- `mcp__unified-memory__search_memories` - Semantic + keyword search
- `mcp__memory-keeper__context_get` - Session checkpoints
- `mcp__memgraph__run_query` - Graph queries (CybersecKB)

**Usage Pattern:**
When user asks about past work, code patterns, or security topics:

1. Call `search_memories(query="<topic>")` first
2. If insufficient, call direct database queries
3. Cite sources in response
```

---

### Phase 4: Automatic Context Injection (1-2 hours)

#### 4.1 Enhanced context-prime.py Hook

Modify existing `~/.claude/hooks/context-prime.py`:

```python
def main():
    """Enhanced multi-source context priming."""
    output = ["## Session Context Memory"]

    # 1. Semantic recent memories (if Qdrant available)
    try:
        qdrant_recent = get_recent_qdrant_memories(limit=3)
        if qdrant_recent:
            output.append("**Recent Semantic Memories:**")
            output.extend(qdrant_recent)
    except:
        pass

    # 2. PostgreSQL learnings (fallback)
    learnings = query_postgres_learnings(limit=5)
    if learnings:
        output.append("**Recent Learnings:**")
        output.extend(learnings)

    # 3. Memory-keeper checkpoint
    checkpoint = get_memory_keeper_checkpoint()
    if checkpoint:
        output.append(f"**Last Session:** {checkpoint}")

    # 4. Active Beads issues
    try:
        beads_active = subprocess.run(
            ["bd", "list", "--status=in_progress", "--format=compact"],
            capture_output=True, text=True, timeout=2
        )
        if beads_active.returncode == 0:
            output.append("**Active Tasks:**")
            output.append(beads_active.stdout.strip())
    except:
        pass

    # 5. Quick access commands
    output.append("")
    output.append("**Memory Commands:**")
    output.append("- `/recall \"topic\"` - Semantic search")
    output.append("- `python3 ~/cybersec-kb/scripts/query_kb.py \"term\"` - 3M security KB")
    output.append("- `bd search \"keyword\"` - Search issues")

    print('\n'.join(output))
```

---

### Phase 5: Monitoring and Feedback Loop (Ongoing)

#### 5.1 Memory Usage Analytics

Create `~/.claude/hooks/memory-analytics.py` (Stop hook):

```python
#!/usr/bin/env python3
"""Track which memory sources were actually used."""
import json
import sys
from pathlib import Path

ANALYTICS_FILE = Path.home() / ".claude/state/memory-analytics.jsonl"

def main():
    # Read session transcript
    data = json.loads(sys.stdin.read())
    session_id = data.get("session_id")

    # Parse transcript for memory-related tool calls
    memory_tools_used = []

    # Check if KB was queried
    if "cybersec-kb" in str(data):
        memory_tools_used.append("cybersec-kb")

    if "SELECT" in str(data) and "learnings" in str(data):
        memory_tools_used.append("postgresql")

    # Log analytics
    ANALYTICS_FILE.parent.mkdir(exist_ok=True)
    with open(ANALYTICS_FILE, 'a') as f:
        f.write(json.dumps({
            "timestamp": datetime.now().isoformat(),
            "session_id": session_id,
            "tools_used": memory_tools_used,
        }) + '\n')
```

#### 5.2 Weekly Memory Health Report

```bash
#!/bin/bash
# ~/.claude/scripts/memory-health-report.sh

echo "## Memory System Health Report"
echo "Generated: $(date)"
echo ""

echo "### Storage Stats"
echo "- PostgreSQL learnings: $(sudo -u postgres psql -d claude_memory -t -c 'SELECT COUNT(*) FROM learnings')"
echo "- Qdrant vectors: $(curl -s http://localhost:6333/collections/claude_memories | jq -r '.result.points_count')"
echo "- Memgraph nodes: $(python3 -c 'from memgraph import Memgraph; db=Memgraph("127.0.0.1", 7687); print(list(db.execute_and_fetch("MATCH (n) RETURN count(n)"))[0]["count(n)"])')"
echo "- Memory-Keeper checkpoints: $(ls -1 ~/mcp-data/memory-keeper/checkpoint-*.json | wc -l)"
echo ""

echo "### Usage Analytics (Last 7 Days)"
tail -100 ~/.claude/state/memory-analytics.jsonl | \
  jq -s 'group_by(.tools_used[]) | map({tool: .[0].tools_used[0], count: length}) | .[]'
```

---

## Configuration Checklist

### ✅ Immediate Actions

- [ ] Add memory retrieval instructions to `~/.claude/CLAUDE.md`
- [ ] Fix Memgraph connectivity (`sudo systemctl start memgraph`)
- [ ] Backfill Qdrant with existing PostgreSQL learnings
- [ ] Test `context-prime.py` hook executes at session start
- [ ] Verify `auto-persist-learning.py` hook saves research outputs

### 🔧 Short-Term (This Week)

- [ ] Implement `semantic-retrieval.py` UserPromptSubmit hook
- [ ] Create `auto-cybersec-kb.py` security keyword hook
- [ ] Install MCP Memory Service (doobidoo)
- [ ] Configure unified-memory MCP server
- [ ] Add MCP tool usage examples to CLAUDE.md

### 🚀 Long-Term (This Month)

- [ ] Build custom unified-memory-mcp aggregator
- [ ] Implement memory usage analytics
- [ ] Create automated memory health reports
- [ ] Train LLM to prefer memory tools via few-shot examples
- [ ] Consider Mem0 API integration for cross-session persistence

---

## Success Metrics

### Quantitative

| Metric                            | Current | Target (1 Month) |
| --------------------------------- | ------- | ---------------- |
| Qdrant vectors                    | 6       | 500+             |
| Hook-triggered retrievals/session | 0       | 3-5              |
| Memory-sourced answers            | ~5%     | 40%+             |
| Repeat questions asked            | High    | Low              |
| Manual KB queries needed          | 100%    | 20%              |

### Qualitative

- [ ] Claude Code cites past learnings without prompting
- [ ] Security questions auto-query CybersecKB
- [ ] Session continuity across days/weeks
- [ ] Reduced context re-explanation overhead
- [ ] Natural memory-augmented conversations

---

## Related Research

### Sources Consulted

- [MCP Memory Service](https://github.com/doobidoo/mcp-memory-service) - Auto-capture with 5ms retrieval
- [MCP Memory Keeper](https://github.com/mkreyman/mcp-memory-keeper) - Session persistence
- [Claude Code Hooks Documentation](https://code.claude.com/docs/en/hooks) - Hook lifecycle
- [RAG Best Practices 2026](https://dev.to/pavanbelagatti/learn-how-to-build-reliable-rag-applications-in-2026-1b7p) - Agentic RAG patterns
- [CLAUDE.md Best Practices](https://www.humanlayer.dev/blog/writing-a-good-claude-md) - Effective instructions
- [Claude Code System Prompts](https://github.com/Piebald-AI/claude-code-system-prompts) - Prompt structure
- [MCP Tool Invocation Patterns](https://github.com/variablesoftware/mcp_tool_invocation) - Auto-invocation
- [Azure AI Agentic Retrieval](https://learn.microsoft.com/en-us/azure/search/retrieval-augmented-generation-overview) - RAG architecture

### Key Insights

1. **Hybrid Approach Required:** No single technique (hooks, MCP, CLAUDE.md) suffices. Combine all.

2. **Pre-Session Injection + Query-Time Retrieval:** Static context priming (fast) + dynamic semantic search (relevant).

3. **Bidirectional RAG:** Write-back via hooks creates self-improving memory system.

4. **Explicit Instructions Matter:** LLM won't use tools without clear CLAUDE.md guidance or high semantic relevance.

5. **Monitor Usage:** Analytics essential to prove memory systems are actually being used.

---

## Appendix: Example CLAUDE.md Template

````markdown
# Project: Claude Command Center

## Memory System Integration (CRITICAL)

### Pre-Session Context

Your memory systems have been primed with:

- Recent learnings from PostgreSQL (semantic + keyword)
- Latest session checkpoint from Memory-Keeper
- Active tasks from Beads issue tracker

### Automatic Retrieval Rules

**For Security/Pentesting Questions:**

1. **ALWAYS** query CybersecKB first (3M techniques):
   ```bash
   python3 /home/deploy/cybersec-kb/scripts/query_kb.py "<topic>" --limit 10
   ```
````

2. Check past learnings:
   ```bash
   sudo -u postgres psql -d claude_memory -c "SELECT topic, content FROM learnings WHERE topic ILIKE '%<keyword>%' LIMIT 5;"
   ```

**For Architecture/Project Questions:**

1. Search semantic memories (if MCP available):

   ```
   mcp__unified-memory__search_memories(query="<topic>")
   ```

2. Fallback to SQL:
   ```bash
   sudo -u postgres psql -d claude_memory -c "SELECT content FROM learnings WHERE category='architecture' AND topic ILIKE '%<keyword>%';"
   ```

**For Session Continuity:**

- Check latest checkpoint: `cat $(ls -t ~/mcp-data/memory-keeper/checkpoint-*.json | head -1)`

### Auto-Persist Enabled

- WebSearch/WebFetch/Task outputs automatically saved
- Categorized: security, architecture, technique, tool, learning, project
- Limit: 25 learnings/session
- No manual `/learn` needed

### Citation Required

When answering from memory, cite source:

- "[From PostgreSQL learnings, 2026-01-15] ..."
- "[CybersecKB: GTFOBins/curl] ..."
- "[Memory-Keeper checkpoint, 2026-01-14] ..."

```

---

## Next Steps

1. **Immediate:** Implement Phase 1 (CLAUDE.md instructions + Memgraph fix)
2. **This Week:** Deploy Phase 2 (semantic retrieval hooks)
3. **This Month:** Build Phase 3 (unified MCP server)
4. **Ongoing:** Monitor Phase 5 (analytics and optimization)

**Success Definition:** Claude Code instances automatically leverage memory systems 80%+ of the time without manual prompting.
```
