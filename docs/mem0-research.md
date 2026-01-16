# Mem0 Research: Self-Hosted AI Memory Layer

**Date:** 2026-01-16
**Context:** Evaluating Mem0 for Memory Browser integration with existing Qdrant + Ollama infrastructure

## Overview

Mem0 is a self-improving memory layer for AI applications that provides:
- **26% accuracy improvement** over OpenAI's native memory (66.9% vs 52.9%)
- **80-90% token cost reduction** through intelligent memory compression
- **0.20s median latency** for memory retrieval
- Support for **24+ vector databases** including Qdrant

## Memory Types

Mem0 provides four memory categories:

1. **Conversation Memory** - In-flight messages within a single turn
2. **Session Memory** - Short-lived facts for current task/channel
3. **User Memory** - Long-term preferences tied to a person/account
4. **Organizational Memory** - Shared context for teams/multiple agents

## Current Infrastructure Compatibility

Your existing setup is already compatible:
- ✅ Qdrant running (localhost:6333)
- ✅ Collections: `claude_memories`, `mem0_memories`, `mem0migrations`
- ✅ Ollama with `nomic-embed-text` (768 dimensions)
- ✅ PostgreSQL for history storage

## Recommended Configuration

```python
from mem0 import Memory

config = {
    "vector_store": {
        "provider": "qdrant",
        "config": {
            "collection_name": "mem0_memories",
            "host": "localhost",
            "port": 6333,
            "embedding_model_dims": 768,  # For nomic-embed-text
        }
    },
    "llm": {
        "provider": "ollama",
        "config": {
            "model": "llama3.1:latest",
            "temperature": 0,
            "max_tokens": 2000,
            "ollama_base_url": "http://localhost:11434",
        }
    },
    "embedder": {
        "provider": "ollama",
        "config": {
            "model": "nomic-embed-text:latest",
            "ollama_base_url": "http://localhost:11434",
        }
    },
    "history_db": {
        "provider": "postgres",
        "config": {
            "host": "localhost",
            "port": 5433,
            "database": "claude_memory",
            "user": "deploy"
        }
    }
}

memory = Memory.from_config(config)
```

## Basic Operations

### Adding Memories
```python
# Add from conversation
messages = [
    {"role": "user", "content": "I prefer Python for backend development"},
    {"role": "assistant", "content": "Noted! I'll keep that in mind."}
]
memory.add(messages, user_id="user123", metadata={"category": "preferences"})

# Add single fact
memory.add("Learning penetration testing", user_id="user123", agent_id="coding_assistant")
```

### Searching Memories
```python
# Semantic search
results = memory.search(
    query="What programming languages does the user like?",
    user_id="user123",
    limit=5
)

# Get all memories
all_memories = memory.get_all(user_id="user123")
```

### Updating & Deleting
```python
# Update
memory.update(memory_id="mem_abc123", text="Updated preference")

# Delete specific
memory.delete(memory_id="mem_abc123")

# Delete all for user
memory.delete_all(user_id="user123")
```

## Integration with Memory Browser

### Phase 1: Direct Qdrant Integration (Current)
- Use existing Qdrant scroll API for browsing
- Add proper vector search with Ollama embeddings

### Phase 2: Mem0 Layer (Future)
- Install Mem0: `pip install mem0ai`
- Configure with existing Qdrant collection
- Use Mem0's semantic search for better results
- Automatic memory extraction from conversations

## Key Benefits

1. **Semantic Understanding** - Finds related concepts, not just keywords
2. **Automatic Extraction** - Extracts facts from conversations
3. **User Scoping** - Memories isolated per user/agent/session
4. **Cost Reduction** - 80-90% token savings through compression
5. **Local First** - Fully self-hosted with Qdrant + Ollama

## Sources

- [Mem0 Official Site](https://mem0.ai/)
- [Mem0 GitHub](https://github.com/mem0ai/mem0)
- [Qdrant Integration Guide](https://qdrant.tech/documentation/frameworks/mem0/)
- [Ollama Embeddings Guide](https://docs.mem0.ai/components/embedders/models/ollama)
