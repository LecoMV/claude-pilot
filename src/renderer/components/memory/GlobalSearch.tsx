/**
 * Global Memory Search Component
 * Unified search across PostgreSQL, Memgraph, and Qdrant
 */

import { useState, useCallback, useEffect } from 'react'
import {
  Search,
  Database,
  Layers,
  Brain,
  Clock,
  Loader2,
  Copy,
  Check,
  Filter,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface SearchResult {
  id: string
  source: 'postgresql' | 'memgraph' | 'qdrant'
  title: string
  content: string
  score: number
  metadata: Record<string, unknown>
}

interface SearchStats {
  postgresql: number
  memgraph: number
  qdrant: number
  totalTime: number
}

interface SearchResponse {
  results: SearchResult[]
  stats: SearchStats
}

const SOURCE_CONFIG = {
  postgresql: {
    icon: Database,
    label: 'PostgreSQL',
    description: 'Learnings database',
    color: 'text-accent-blue',
    bgColor: 'bg-accent-blue/10',
  },
  memgraph: {
    icon: Layers,
    label: 'Memgraph',
    description: 'Knowledge graph',
    color: 'text-accent-purple',
    bgColor: 'bg-accent-purple/10',
  },
  qdrant: {
    icon: Brain,
    label: 'Qdrant',
    description: 'Vector memories',
    color: 'text-accent-green',
    bgColor: 'bg-accent-green/10',
  },
}

export function GlobalSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [stats, setStats] = useState<SearchStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedSources, setSelectedSources] = useState<Set<string>>(
    new Set(['postgresql', 'memgraph', 'qdrant'])
  )
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [recentSearches, setRecentSearches] = useState<string[]>([])

  // Load recent searches from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('claude-pilot-recent-searches')
    if (saved) {
      setRecentSearches(JSON.parse(saved))
    }
  }, [])

  const saveRecentSearch = (searchQuery: string) => {
    const updated = [searchQuery, ...recentSearches.filter((s) => s !== searchQuery)].slice(0, 5)
    setRecentSearches(updated)
    localStorage.setItem('claude-pilot-recent-searches', JSON.stringify(updated))
  }

  const handleSearch = useCallback(
    async (searchQuery?: string) => {
      const q = searchQuery || query
      if (!q.trim()) return

      setLoading(true)
      setError(null)

      try {
        const response = (await window.electron.invoke(
          'memory:unified-search',
          q,
          50
        )) as SearchResponse

        // Filter by selected sources
        const filtered = response.results.filter((r) => selectedSources.has(r.source))

        setResults(filtered)
        setStats(response.stats)
        saveRecentSearch(q)
      } catch (err) {
        setError((err as Error).message)
        setResults([])
        setStats(null)
      } finally {
        setLoading(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- saveRecentSearch is stable
    [query, selectedSources]
  )

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  const toggleSource = (source: string) => {
    const newSources = new Set(selectedSources)
    if (newSources.has(source)) {
      if (newSources.size > 1) {
        // Keep at least one source
        newSources.delete(source)
      }
    } else {
      newSources.add(source)
    }
    setSelectedSources(newSources)
  }

  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const clearSearch = () => {
    setQuery('')
    setResults([])
    setStats(null)
  }

  return (
    <div className="space-y-6 animate-in">
      {/* Search Header */}
      <div>
        <h2 className="text-lg font-semibold text-text-primary mb-2">Global Memory Search</h2>
        <p className="text-sm text-text-muted">
          Search across all memory systems: learnings, knowledge graph, and vector memories
        </p>
      </div>

      {/* Search Input */}
      <div className="relative">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search memories, learnings, and knowledge..."
            className="w-full pl-12 pr-24 py-3 bg-surface border border-border rounded-xl
                       text-text-primary placeholder:text-text-muted
                       focus:outline-none focus:border-accent-purple focus:ring-1 focus:ring-accent-purple"
          />
          {query && (
            <button
              onClick={clearSearch}
              className="absolute right-20 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-text-primary"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => handleSearch()}
            disabled={loading || !query.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-1.5
                       bg-accent-purple text-white rounded-lg text-sm font-medium
                       disabled:opacity-50 disabled:cursor-not-allowed
                       hover:bg-accent-purple/90 transition-colors"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
          </button>
        </div>

        {/* Source Filters */}
        <div className="flex items-center gap-2 mt-3">
          <Filter className="w-4 h-4 text-text-muted" />
          <span className="text-sm text-text-muted">Sources:</span>
          {Object.entries(SOURCE_CONFIG).map(([key, config]) => {
            const Icon = config.icon
            const isSelected = selectedSources.has(key)
            return (
              <button
                key={key}
                onClick={() => toggleSource(key)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1 rounded-full text-sm transition-colors',
                  isSelected
                    ? `${config.bgColor} ${config.color}`
                    : 'bg-surface-hover text-text-muted hover:text-text-primary'
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {config.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Recent Searches */}
      {!results.length && recentSearches.length > 0 && (
        <div>
          <p className="text-sm text-text-muted mb-2 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Recent searches
          </p>
          <div className="flex flex-wrap gap-2">
            {recentSearches.map((search, i) => (
              <button
                key={i}
                onClick={() => {
                  setQuery(search)
                  handleSearch(search)
                }}
                className="px-3 py-1 bg-surface-hover text-text-muted text-sm rounded-lg
                           hover:bg-surface hover:text-text-primary transition-colors"
              >
                {search}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-4 bg-accent-red/10 border border-accent-red/20 rounded-lg">
          <p className="text-accent-red text-sm">{error}</p>
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div className="flex items-center gap-4 text-sm">
          <span className="text-text-muted">
            Found {results.length} results in {stats.totalTime.toFixed(0)}ms
          </span>
          <div className="flex items-center gap-3">
            {Object.entries(SOURCE_CONFIG).map(([key, config]) => {
              const count = stats[key as keyof typeof stats]
              if (typeof count !== 'number') return null
              return (
                <span key={key} className={cn('flex items-center gap-1', config.color)}>
                  {config.label}: {count}
                </span>
              )
            })}
          </div>
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-3">
          {results.map((result) => {
            const config = SOURCE_CONFIG[result.source]
            const Icon = config.icon

            return (
              <div key={result.id} className="card p-4 hover:border-border-hover transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    {/* Header */}
                    <div className="flex items-center gap-2 mb-2">
                      <div className={cn('p-1.5 rounded-lg', config.bgColor)}>
                        <Icon className={cn('w-4 h-4', config.color)} />
                      </div>
                      <span className={cn('text-sm font-medium', config.color)}>
                        {config.label}
                      </span>
                      <span className="text-xs text-text-muted">
                        Score: {(result.score * 100).toFixed(0)}%
                      </span>
                    </div>

                    {/* Title */}
                    <h3 className="font-medium text-text-primary mb-1 truncate">{result.title}</h3>

                    {/* Content */}
                    <p className="text-sm text-text-muted line-clamp-3">{result.content}</p>

                    {/* Metadata */}
                    {result.metadata && Object.keys(result.metadata).length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {Object.entries(result.metadata)
                          .filter(([_, v]) => v && typeof v !== 'object')
                          .slice(0, 3)
                          .map(([key, value]) => (
                            <span
                              key={key}
                              className="px-2 py-0.5 bg-surface-hover rounded text-xs text-text-muted"
                            >
                              {key}: {String(value).slice(0, 30)}
                            </span>
                          ))}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <button
                    onClick={() => copyToClipboard(result.content, result.id)}
                    className="p-2 text-text-muted hover:text-text-primary hover:bg-surface-hover rounded-lg transition-colors"
                    title="Copy content"
                  >
                    {copiedId === result.id ? (
                      <Check className="w-4 h-4 text-accent-green" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && !results.length && query && (
        <div className="text-center py-12">
          <Search className="w-12 h-12 text-text-muted mx-auto mb-4" />
          <p className="text-text-muted">No results found for &ldquo;{query}&rdquo;</p>
          <p className="text-sm text-text-muted mt-1">Try different keywords or sources</p>
        </div>
      )}
    </div>
  )
}
