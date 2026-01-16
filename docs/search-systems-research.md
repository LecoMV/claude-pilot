# Memory Browser Search Systems Research

**Date:** 2026-01-16
**Context:** Improving search for Memory Browser querying PostgreSQL learnings (59 records), Memgraph knowledge graph (1.7M nodes), and Qdrant vector database

## Current Problems

1. **PostgreSQL**: Basic `ILIKE` queries are slow and lack fuzzy matching
2. **Memgraph**: `CONTAINS` is case-sensitive, exact match only, no relevance ranking
3. **Qdrant**: Not using vector embeddings properly, just keyword filtering

## Research Findings

### 1. Full-Text Search Options

#### PostgreSQL tsvector/tsquery

**Status**: Already has GIN trigram indexes on learnings table!

**Findings**:
- With GIN indexes, response times ~4ms (vs 200ms+ without)
- Works well for datasets under 400K records
- Native to PostgreSQL, zero infrastructure overhead
- Test query completed in 0.049s total time

**Pros**:
- Already implemented with GIN indexes
- Zero additional infrastructure
- ACID guarantees
- Data searchable immediately on commit

**Cons**:
- No typo tolerance without additional work
- COUNT(*) queries become slow at 400K+ records
- Limited semantic understanding
- No built-in relevance ranking beyond BM25

**Best for**: Small datasets (< 100K), simple requirements, minimal infrastructure

**Sources**:
- [PostgreSQL Full-Text Search vs Dedicated Search Engines](https://nomadz.pl/en/blog/postgres-full-text-search-or-meilisearch-vs-typesense)
- [Create an advanced search engine with PostgreSQL](https://xata.io/blog/postgres-full-text-search-engine)
- [Postgres Full Text Search vs Meilisearch vs Elasticsearch](https://medium.com/@simbatmotsi/postgres-full-text-search-vs-meilisearch-vs-elasticsearch-choosing-a-search-stack-that-scales-fcf17ef40a1b)

#### Meilisearch

**Architecture**: Lightning Memory-Mapped Database (LMDB) - combines in-memory performance with disk persistence

**Performance**:
- Sub-millisecond response times
- Built-in typo tolerance
- Small memory footprint (Rust-based)
- Maximum index size: 80TiB on Linux (best under 2TiB)

**Pros**:
- Excellent typo tolerance and relevance
- Memory-efficient (LMDB memory-mapped storage)
- Easy setup and maintenance
- REST API for integration
- Good for Electron apps (doesn't require entire index in RAM)

**Cons**:
- Additional service to run
- Synchronization complexity with PostgreSQL
- Eventual consistency issues

**Best for**: User-facing search requiring typo tolerance and great UX

**Sources**:
- [Meilisearch vs Typesense](https://www.meilisearch.com/blog/meilisearch-vs-typesense)
- [Elasticsearch vs Typesense comparison](https://www.meilisearch.com/blog/elasticsearch-vs-typesense)

#### Typesense

**Architecture**: Entire index kept in RAM for maximum speed

**Performance**:
- Sub-50ms response times
- Built-in typo tolerance
- Excellent relevance ranking

**Pros**:
- Extremely fast (everything in RAM)
- Great typo tolerance
- Good relevance out of the box

**Cons**:
- Keeps entire index in RAM (expensive for large datasets)
- Memory costs scale directly with dataset size
- Not ideal for resource-constrained Electron apps
- 1.7M nodes would require significant RAM

**Best for**: Applications where RAM is not a constraint and speed is critical

**Sources**:
- [Typesense Review 2025](https://www.meilisearch.com/blog/typesense-review)
- [Comparison with Alternatives](https://typesense.org/docs/overview/comparison-with-alternatives.html)

### 2. Semantic/Vector Search Options

#### Qdrant with Proper Vector Embeddings

**Current State**: Qdrant is running but not using embeddings properly

**Tested Setup**:
- Collection: `claude_memories`
- Vector size: 768
- Distance: Cosine
- HNSW index configured (m=16, ef_construct=100)
- Only 1 point indexed (not being used!)

**Ollama Models Available**:
- `nomic-embed-text:latest` (274 MB) - **RECOMMENDED**
- `qwen2.5:3b` (1.9 GB)

**Integration Path**:
1. Generate embeddings using Ollama's `nomic-embed-text` model
2. Store in Qdrant collections with metadata
3. Use semantic similarity search
4. Combine with keyword filtering

**Pros**:
- Already installed and configured
- Local embeddings via Ollama (privacy-first)
- Excellent for semantic/conceptual searches
- HNSW indexing for fast similarity search

**Cons**:
- Requires embedding generation overhead
- Less effective for exact keyword matches
- Cold start time for embedding model

**Best for**: Conceptual queries, finding similar content, semantic understanding

**Sources**:
- [Ollama - Qdrant Documentation](https://qdrant.tech/documentation/embeddings/ollama/)
- [Qdrant + Ollama: Local AI Memory](https://www.markus-schall.de/en/2025/08/ollama-meets-qdrant-a-local-memory-for-your-ki-on-the-mac/)
- [Using OLLAMA with QDRANT for privacy](https://medium.com/@venergiac/using-ollama-with-vector-db-qdrant-for-the-best-privacy-of-your-data-implementing-as-simple-rag-a23d577450ea)

#### pgvector for PostgreSQL

**Status**: NOT currently installed, but highly viable option

**Performance at Scale**:
- Works well up to 10M vectors with <100ms latency
- HNSW index build 30x faster in recent versions
- Scalar quantization saves 50% memory/storage
- Instacart: 80% cost savings migrating from Elasticsearch

**Integration**:
- Stores vectors alongside relational data
- No data silos or synchronization issues
- ACID guarantees maintained
- Can combine vector + keyword search in single query

**Real-World Success**:
- Instacart migrated from Elasticsearch in May 2025
- 80% cost savings
- 6% reduction in zero-result searches
- Simpler architecture

**Pros**:
- Unified storage (vectors + relational data)
- No synchronization complexity
- ACID compliance
- Cost-effective for <10M vectors
- Hybrid search in single SQL query

**Cons**:
- Performance drops above 10M vectors
- Requires PostgreSQL extension installation
- Embedding generation still needed

**Best for**: Unified storage, avoiding data silos, hybrid search needs

**Sources**:
- [PostgreSQL as Vector Database Complete Guide](https://airbyte.com/data-engineering-resources/postgresql-as-a-vector-database)
- [PostgreSQL + pgvector benchmarks](https://medium.com/@DataCraft-Innovations/postgres-vector-search-with-pgvector-benchmarks-costs-and-reality-check-f839a4d2b66f)
- [pgvector Installation Guide 2025](https://dbadataverse.com/tech/postgresql/2025/12/pgvector-postgresql-vector-database-guide/)

### 3. Memgraph Full-Text Search

**Current State**: Using basic `CONTAINS` (case-sensitive, exact match)

**Native Capabilities**: Memgraph now has **production-ready text search** powered by Tantivy!

**Features**:
- Text indexes on node/edge properties
- Boolean logic support
- Regex pattern matching
- Aggregations (count, avg, min, max)
- Relevance scoring
- Replication-aware (synchronizes across replicas)

**Index Creation**:
```cypher
CREATE TEXT INDEX index_name ON :Label(prop1, prop2, prop3)
```

**Supported Types**: String, Integer, Float, Boolean

**Status**: Removed from experimental features → Production ready

**Pros**:
- Native to Memgraph (no external service)
- Tantivy-powered (Rust, high performance)
- Integrated with graph queries
- Relevance scoring built-in
- Replication support

**Cons**:
- Limited documentation vs dedicated search engines
- Less mature than Elasticsearch/Meilisearch
- Requires index creation upfront
- 1.7M nodes may require tuning

**Best for**: Graph-centric search, keeping everything in Memgraph

**Sources**:
- [Text Search in Memgraph](https://memgraph.com/blog/text-search-in-memgraph)
- [Text Search Documentation](https://memgraph.com/docs/querying/text-search)
- [Memgraph 3.4 Release](https://memgraph.com/blog/memgraph-3-4-release-announcement)

### 4. Hybrid Search Strategies

**Definition**: Combining keyword/lexical search with semantic/vector search

**Key Techniques**:

#### Reciprocal Rank Fusion (RRF)
- Merges rankings from multiple search methods
- No manual score calibration needed
- Position-based scoring (not raw scores)

#### Linear Combination
- Weighted scoring of normalized results
- Requires score normalization (BM25 vs cosine similarity)

**Use Cases**:
- Product codes, jargon, dates → Keyword search wins
- Conceptual queries, synonyms → Semantic search wins
- **Best of both worlds** → Hybrid search

**Performance Tradeoffs**:
- 2x search operations (keyword + vector)
- Fusion adds minimal latency (<5ms)
- Can cache common queries

**2025 Platform Support**:
- Elasticsearch, OpenSearch, Azure AI Search all have native hybrid search
- Can implement manually with any combo of systems

**Pros**:
- Best accuracy (combines exact + semantic)
- Handles typos, synonyms, exact matches
- Future-proof for diverse query types

**Cons**:
- More complex implementation
- 2x search latency (can parallelize)
- Requires both systems running

**Best for**: Production search requiring high accuracy across query types

**Sources**:
- [Comprehensive Hybrid Search Guide](https://www.elastic.co/what-is/hybrid-search)
- [Azure Hybrid Search Overview](https://learn.microsoft.com/en-us/azure/search/hybrid-search-overview)
- [Building Effective Hybrid Search](https://opensearch.org/blog/building-effective-hybrid-search-in-opensearch-techniques-and-best-practices/)
- [Optimizing RAG with Hybrid Search](https://superlinked.com/vectorhub/articles/optimizing-rag-with-hybrid-search-reranking)

### 5. Unified Search Architectures

**Challenge**: Searching across 3 different systems (PostgreSQL, Memgraph, Qdrant)

**Option A: Unified Query Layer**
- Single API aggregates results from all sources
- Federated search pattern
- Results merged and re-ranked

**Option B: Centralized Index**
- Sync all data to single search system (Meilisearch)
- Simpler querying
- Complex synchronization

**Option C: PostgreSQL as Hub**
- Use pgvector extension
- Store graph references + embeddings
- Hybrid search in single query

**Emerging Solutions**:
- **TigerVector** (integrated in TigerGraph v4.2, Dec 2024): Native vector + graph support
- **PuppyGraph**: Unified graph query across multiple databases
- **pgvector**: 60-80% cost reduction vs dedicated vector DBs

**Pros**:
- Single search interface
- Unified relevance ranking
- Simpler UX

**Cons**:
- Complex implementation
- Data synchronization challenges
- Potential staleness

**Best for**: Large-scale production systems, consistent UX

**Sources**:
- [PostgreSQL as Vector Database](https://airbyte.com/data-engineering-resources/postgresql-as-a-vector-database)
- [TigerVector Paper](https://arxiv.org/html/2501.11216v3)
- [PuppyGraph PostgreSQL Guide](https://www.puppygraph.com/blog/postgresql-graph-database)

---

## Recommendations

### 🎯 Recommended Approach: **Hybrid Search with Staged Implementation**

Given your specific context (Electron app, 59 PostgreSQL records, 1.7M Memgraph nodes, existing Qdrant):

### Phase 1: Quick Wins (1-2 days)

**PostgreSQL**:
- ✅ **Use existing tsvector with GIN indexes** - already implemented!
- Add fuzzy matching with `pg_trgm` similarity
- Test showed 0.049s total query time - good enough for 59 records

```sql
-- Already has GIN indexes on topic, content, category
SELECT topic, content,
       similarity(content, 'search term') as score
FROM learnings
WHERE content % 'search term'  -- % operator for similarity
ORDER BY score DESC
LIMIT 10;
```

**Memgraph**:
- ✅ **Implement native Memgraph text search** - production ready!
- Create text indexes on CyberTechnique nodes

```cypher
CREATE TEXT INDEX cyber_idx ON :CyberTechnique(instruction, output);

CALL text_search.search('cyber_idx', 'privilege escalation')
YIELD node, score
RETURN node.instruction, score
ORDER BY score DESC
LIMIT 10;
```

**Qdrant**:
- ✅ **Start using existing Qdrant properly** with Ollama embeddings
- Use `nomic-embed-text:latest` (274 MB, already installed)

### Phase 2: Semantic Search (3-5 days)

**Add Vector Search**:
1. Generate embeddings for PostgreSQL learnings using Ollama
2. Store in Qdrant `claude_memories` collection
3. Implement semantic search for conceptual queries

**Hybrid PostgreSQL** (optional):
- Install pgvector extension
- Store embeddings alongside learnings
- Enable hybrid keyword + vector search in single query

### Phase 3: Unified Search (1-2 weeks)

**Federated Search Layer**:
- Single search endpoint in Electron app
- Query all 3 systems in parallel
- Merge results with Reciprocal Rank Fusion (RRF)
- Present unified results with source indicators

```typescript
// Pseudocode
async function unifiedSearch(query: string) {
  const [pgResults, memgraphResults, qdrantResults] = await Promise.all([
    searchPostgreSQL(query),      // tsvector + similarity
    searchMemgraph(query),          // text_search.search()
    searchQdrant(query)             // vector similarity
  ]);

  return reciprocalRankFusion([pgResults, memgraphResults, qdrantResults]);
}
```

### Alternative: Meilisearch for All (If budget allows)

**If you want simplest UX with typo tolerance**:
1. Run Meilisearch service (lightweight, LMDB-based)
2. Sync all 3 data sources to Meilisearch
3. Single search interface with excellent UX

**Tradeoffs**:
- +1 service to run (but lightweight)
- +Synchronization logic
- +Best typo tolerance and relevance
- +Sub-millisecond searches
- +Memory-efficient (good for Electron)

---

## Performance Comparison

| Solution | Setup Time | Query Speed | Memory Usage | Typo Tolerance | Semantic Search | Resource Efficient |
|----------|------------|-------------|--------------|----------------|-----------------|-------------------|
| **PostgreSQL tsvector** | ✅ Done | 4-50ms | Minimal | ❌ | ❌ | ⭐⭐⭐⭐⭐ |
| **Memgraph Text Search** | 1 hour | <10ms | Low | ⚠️ Limited | ❌ | ⭐⭐⭐⭐⭐ |
| **Qdrant + Ollama** | 1 day | 10-50ms | Medium | ❌ | ✅ | ⭐⭐⭐⭐ |
| **pgvector** | 2 days | 10-100ms | Medium | ❌ | ✅ | ⭐⭐⭐⭐ |
| **Meilisearch** | 3 days | <5ms | Medium | ✅ | ❌ | ⭐⭐⭐⭐ |
| **Hybrid (All Above)** | 1-2 weeks | 20-100ms | Medium | ✅ | ✅ | ⭐⭐⭐ |

---

## Immediate Action Items

### For Memory Browser MVP:

1. **PostgreSQL** (10 minutes):
   ```sql
   -- Test fuzzy matching (pg_trgm already installed based on GIN indexes)
   SELECT topic, content,
          similarity(content, 'memory browser') as score
   FROM learnings
   WHERE content % 'memory browser'
   ORDER BY score DESC;
   ```

2. **Memgraph** (1 hour):
   ```cypher
   -- Create text index
   CREATE TEXT INDEX cyber_full_text ON :CyberTechnique(instruction, output, category);

   -- Test search
   CALL text_search.search('cyber_full_text', 'linux privilege escalation')
   YIELD node, score
   RETURN node.instruction, node.category, score
   ORDER BY score DESC
   LIMIT 20;
   ```

3. **Qdrant** (1 day):
   ```python
   # Generate embeddings with Ollama
   import ollama
   from qdrant_client import QdrantClient

   response = ollama.embeddings(model='nomic-embed-text', prompt='search query')
   embedding = response['embedding']

   # Search Qdrant
   qdrant.search(
       collection_name='claude_memories',
       query_vector=embedding,
       limit=10
   )
   ```

---

## Conclusion

**Best path forward for Memory Browser**:

1. ✅ **Use PostgreSQL tsvector** - already working, add fuzzy matching
2. ✅ **Add Memgraph text search** - production-ready Tantivy engine, 1 hour setup
3. ✅ **Properly use Qdrant** with Ollama embeddings for semantic search
4. 🔄 **Build federated search** to unify all three sources
5. 🎯 **Optional**: Add Meilisearch if user-facing typo tolerance becomes critical

This approach:
- Leverages existing infrastructure
- Minimal new dependencies
- Staged implementation (working search in hours, excellent search in weeks)
- Local/self-hosted (privacy-first)
- Resource-efficient for Electron app

The 1.7M Memgraph nodes are the biggest challenge, but Memgraph's native text search (Tantivy-powered) should handle this well with proper indexing.

**Key insight**: You don't need to choose one approach. Use keyword search for exact matches (PostgreSQL tsvector, Memgraph text search) and semantic search for conceptual queries (Qdrant), then merge results with RRF for best accuracy.
