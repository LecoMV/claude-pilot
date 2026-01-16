import { useCallback, useEffect, useState, useMemo } from 'react'
import {
  Database,
  Search,
  Brain,
  Layers,
  RefreshCw,
  Calendar,
  Tag,
  FileText,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Filter,
  X,
  Code,
  Terminal,
  User,
  Clock,
  ChevronRight,
  Copy,
  Check,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMemoryStore, type MemorySource } from '@/stores/memory'
import { GraphViewer } from './GraphViewer'
import type { Learning } from '@shared/types'

// Available categories for filtering
const CATEGORIES = ['all', 'bugbounty', 'project', 'architecture', 'security', 'general', 'htb', 'memory']

// Qdrant collections
const QDRANT_COLLECTIONS = ['mem0_memories', 'claude_memories']

// Memgraph node types (based on actual CybersecKB data)
const MEMGRAPH_NODE_TYPES = [
  'all',
  'CyberTechnique',
  'Technology',
  'DataSource',
  'Project',
  'Target',
  'Document',
  'Finding',
  'Pattern',
  'Security',
  'BugBounty',
]

interface QdrantPoint {
  id: string
  payload: Record<string, unknown>
  created_at?: string
}

interface MemgraphSearchResult {
  id: string
  label: string
  type: string
  properties: Record<string, unknown>
}

interface RawQueryResult {
  success: boolean
  data: unknown
  error?: string
  executionTime: number
}

export function MemoryBrowser() {
  const {
    activeSource,
    searchQuery,
    searching,
    learnings,
    stats,
    statsLoading,
    setActiveSource,
    setSearchQuery,
    setSearching,
    setLearnings,
    setStats,
    setStatsLoading,
    clearResults,
  } = useMemoryStore()

  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [initialLoaded, setInitialLoaded] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<string>('all')

  // New state for enhanced features
  const [rawMode, setRawMode] = useState(false)
  const [rawQuery, setRawQuery] = useState('')
  const [rawResult, setRawResult] = useState<RawQueryResult | null>(null)
  const [rawLoading, setRawLoading] = useState(false)

  // Qdrant state
  const [qdrantCollection, setQdrantCollection] = useState('mem0_memories')
  const [qdrantPoints, setQdrantPoints] = useState<QdrantPoint[]>([])
  const [qdrantNextOffset, setQdrantNextOffset] = useState<string | null>(null)
  const [qdrantLoading, setQdrantLoading] = useState(false)

  // Memgraph search state
  const [memgraphResults, setMemgraphResults] = useState<MemgraphSearchResult[]>([])
  const [memgraphNodeType, setMemgraphNodeType] = useState('all')
  const [memgraphSearching, setMemgraphSearching] = useState(false)

  // Clipboard state
  const [copied, setCopied] = useState(false)

  // Load initial data and stats
  const loadStats = useCallback(async () => {
    try {
      setStatsLoading(true)
      const result = await window.electron.invoke('memory:stats')
      setStats(result)
    } catch (error) {
      console.error('Failed to load stats:', error)
    }
  }, [setStats, setStatsLoading])

  const loadInitialLearnings = useCallback(async () => {
    try {
      const result = await window.electron.invoke('memory:learnings', undefined, 20)
      setLearnings(result)
      setInitialLoaded(true)
    } catch (error) {
      console.error('Failed to load learnings:', error)
    }
  }, [setLearnings])

  // Load Qdrant memories
  const loadQdrantMemories = useCallback(async (reset = true) => {
    setQdrantLoading(true)
    try {
      const result = await window.electron.invoke(
        'memory:qdrant:browse',
        qdrantCollection,
        30,
        reset ? undefined : qdrantNextOffset || undefined
      )
      if (reset) {
        setQdrantPoints(result.points)
      } else {
        setQdrantPoints((prev) => [...prev, ...result.points])
      }
      setQdrantNextOffset(result.nextOffset)
    } catch (error) {
      console.error('Failed to load Qdrant memories:', error)
    } finally {
      setQdrantLoading(false)
    }
  }, [qdrantCollection, qdrantNextOffset])

  useEffect(() => {
    loadStats()
    if (activeSource === 'postgresql' && !initialLoaded) {
      loadInitialLearnings()
    }
  }, [loadStats, loadInitialLearnings, activeSource, initialLoaded])

  // Load Qdrant when switching to it
  useEffect(() => {
    if (activeSource === 'qdrant' && qdrantPoints.length === 0) {
      loadQdrantMemories(true)
    }
  }, [activeSource, qdrantPoints.length, loadQdrantMemories])

  // Reload Qdrant when collection changes
  useEffect(() => {
    if (activeSource === 'qdrant') {
      loadQdrantMemories(true)
    }
  }, [qdrantCollection])

  // Handle search based on source
  const handleSearch = async () => {
    if (!searchQuery.trim()) return

    if (activeSource === 'postgresql') {
      setSearching(true)
      try {
        const result = await window.electron.invoke('memory:learnings', searchQuery, 50)
        setLearnings(result)
      } catch (error) {
        console.error('Search failed:', error)
      } finally {
        setSearching(false)
      }
    } else if (activeSource === 'memgraph') {
      setMemgraphSearching(true)
      try {
        const result = await window.electron.invoke(
          'memory:memgraph:search',
          searchQuery,
          memgraphNodeType === 'all' ? undefined : memgraphNodeType,
          50
        )
        setMemgraphResults(result.results)
      } catch (error) {
        console.error('Memgraph search failed:', error)
      } finally {
        setMemgraphSearching(false)
      }
    } else if (activeSource === 'qdrant') {
      setQdrantLoading(true)
      try {
        const result = await window.electron.invoke('memory:qdrant:search', searchQuery, qdrantCollection, 30)
        setQdrantPoints(result.results.map((r) => ({ id: r.id, payload: r.payload })))
        setQdrantNextOffset(null)
      } catch (error) {
        console.error('Qdrant search failed:', error)
      } finally {
        setQdrantLoading(false)
      }
    }
  }

  // Handle raw query execution
  const handleRawQuery = async () => {
    if (!rawQuery.trim()) return
    setRawLoading(true)
    try {
      const result = await window.electron.invoke('memory:raw', activeSource, rawQuery)
      setRawResult(result)
    } catch (error) {
      setRawResult({
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Unknown error',
        executionTime: 0,
      })
    } finally {
      setRawLoading(false)
    }
  }

  // Handle source change
  const handleSourceChange = (source: MemorySource) => {
    setActiveSource(source)
    clearResults()
    setRawResult(null)
    setRawQuery('')
    setMemgraphResults([])
    if (source === 'postgresql') {
      loadInitialLearnings()
    } else if (source === 'qdrant') {
      loadQdrantMemories(true)
    }
  }

  // Copy to clipboard
  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Format date
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // Format large numbers
  const formatNumber = (num: number) => {
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`
    if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`
    return num.toString()
  }

  // Filter learnings by category
  const filteredLearnings = useMemo(() => {
    if (selectedCategory === 'all') return learnings
    return learnings.filter((l) => l.category === selectedCategory)
  }, [learnings, selectedCategory])

  // Get unique categories from current data
  const availableCategories = useMemo(() => {
    const cats = new Set(learnings.map((l) => l.category))
    return ['all', ...Array.from(cats).sort()]
  }, [learnings])

  // Get raw query placeholder
  const getRawPlaceholder = () => {
    switch (activeSource) {
      case 'postgresql':
        return 'SELECT * FROM learnings LIMIT 10'
      case 'memgraph':
        return 'MATCH (n) RETURN n LIMIT 10'
      case 'qdrant':
        return 'GET /collections/mem0_memories'
    }
  }

  return (
    <div className="space-y-6 animate-in">
      {/* Source tabs */}
      <div className="flex items-center gap-2">
        <SourceTab
          id="postgresql"
          icon={Database}
          label="PostgreSQL"
          description="Learnings"
          active={activeSource === 'postgresql'}
          onClick={() => handleSourceChange('postgresql')}
        />
        <SourceTab
          id="memgraph"
          icon={Layers}
          label="Memgraph"
          description="CybersecKB"
          active={activeSource === 'memgraph'}
          onClick={() => handleSourceChange('memgraph')}
        />
        <SourceTab
          id="qdrant"
          icon={Brain}
          label="Qdrant"
          description="Vector Memory"
          active={activeSource === 'qdrant'}
          onClick={() => handleSourceChange('qdrant')}
        />

        {/* Raw mode toggle */}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setRawMode(!rawMode)}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors',
              rawMode
                ? 'bg-accent-yellow/10 border-accent-yellow text-accent-yellow'
                : 'bg-surface border-border text-text-muted hover:bg-surface-hover'
            )}
          >
            <Terminal className="w-4 h-4" />
            <span className="text-sm">Raw</span>
          </button>
        </div>
      </div>

      {/* Raw query mode */}
      {rawMode && (
        <div className="card">
          <div className="card-header">
            <h3 className="font-medium text-text-primary flex items-center gap-2">
              <Code className="w-4 h-4" />
              Raw Query Mode
            </h3>
          </div>
          <div className="card-body space-y-4">
            <div className="flex items-start gap-2">
              <textarea
                value={rawQuery}
                onChange={(e) => setRawQuery(e.target.value)}
                placeholder={getRawPlaceholder()}
                className="input flex-1 font-mono text-sm min-h-[80px]"
                onKeyDown={(e) => e.key === 'Enter' && e.ctrlKey && handleRawQuery()}
              />
              <button
                onClick={handleRawQuery}
                disabled={rawLoading}
                className="btn btn-primary"
              >
                {rawLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                Run
              </button>
            </div>

            {rawResult && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-text-muted">
                  <span className={rawResult.success ? 'text-accent-green' : 'text-accent-red'}>
                    {rawResult.success ? 'Success' : 'Error'}
                  </span>
                  <span>{rawResult.executionTime}ms</span>
                </div>
                <div className="relative">
                  <button
                    onClick={() => handleCopy(JSON.stringify(rawResult.data, null, 2))}
                    className="absolute top-2 right-2 p-1.5 bg-surface-hover rounded hover:bg-border"
                    title="Copy"
                  >
                    {copied ? <Check className="w-4 h-4 text-accent-green" /> : <Copy className="w-4 h-4" />}
                  </button>
                  <pre className="p-3 bg-background rounded-lg text-xs font-mono overflow-x-auto max-h-[300px] overflow-y-auto">
                    {rawResult.error || JSON.stringify(rawResult.data, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Search */}
      {!rawMode && (
        <div className="flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              type="text"
              placeholder={getSearchPlaceholder(activeSource)}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="input pl-10"
            />
          </div>

          {/* Category filter for PostgreSQL */}
          {activeSource === 'postgresql' && (
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="input pl-10 pr-8 appearance-none cursor-pointer min-w-[150px]"
              >
                {availableCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat === 'all' ? 'All Categories' : cat}
                  </option>
                ))}
              </select>
              {selectedCategory !== 'all' && (
                <button
                  onClick={() => setSelectedCategory('all')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-surface-hover rounded"
                  title="Clear filter"
                >
                  <X className="w-3 h-3 text-text-muted" />
                </button>
              )}
            </div>
          )}

          {/* Node type filter for Memgraph */}
          {activeSource === 'memgraph' && (
            <div className="relative">
              <Layers className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <select
                value={memgraphNodeType}
                onChange={(e) => setMemgraphNodeType(e.target.value)}
                className="input pl-10 pr-8 appearance-none cursor-pointer min-w-[130px]"
              >
                {MEMGRAPH_NODE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type === 'all' ? 'All Types' : type}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Collection selector for Qdrant */}
          {activeSource === 'qdrant' && (
            <div className="relative">
              <Brain className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <select
                value={qdrantCollection}
                onChange={(e) => setQdrantCollection(e.target.value)}
                className="input pl-10 pr-8 appearance-none cursor-pointer min-w-[160px]"
              >
                {QDRANT_COLLECTIONS.map((col) => (
                  <option key={col} value={col}>
                    {col}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={handleSearch}
            className="btn btn-primary"
            disabled={searching || memgraphSearching || qdrantLoading}
          >
            {(searching || memgraphSearching || qdrantLoading) ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
            Search
          </button>
          <button onClick={loadStats} className="btn btn-secondary" title="Refresh stats">
            <RefreshCw className={cn('w-4 h-4', statsLoading && 'animate-spin')} />
          </button>
        </div>
      )}

      {/* Results */}
      {!rawMode && (
        <div className="card">
          <div className="card-header flex items-center justify-between">
            <h3 className="font-medium text-text-primary">
              {activeSource === 'postgresql'
                ? 'Learnings'
                : activeSource === 'memgraph'
                  ? memgraphResults.length > 0
                    ? 'Search Results'
                    : 'Knowledge Graph'
                  : 'Vector Memories'}
            </h3>
            {activeSource === 'postgresql' && learnings.length > 0 && (
              <span className="text-sm text-text-muted">
                {selectedCategory !== 'all'
                  ? `${filteredLearnings.length} of ${learnings.length} (${selectedCategory})`
                  : `${learnings.length} results`}
              </span>
            )}
            {activeSource === 'memgraph' && memgraphResults.length > 0 && (
              <span className="text-sm text-text-muted">{memgraphResults.length} results</span>
            )}
            {activeSource === 'qdrant' && qdrantPoints.length > 0 && (
              <span className="text-sm text-text-muted">{qdrantPoints.length} memories</span>
            )}
          </div>
          <div
            className={cn(
              'card-body overflow-y-auto',
              activeSource === 'memgraph' && memgraphResults.length === 0
                ? 'min-h-[400px] h-[500px]'
                : 'min-h-[300px] max-h-[500px]'
            )}
          >
            {activeSource === 'postgresql' ? (
              filteredLearnings.length > 0 ? (
                <div className="space-y-2">
                  {filteredLearnings.map((learning) => (
                    <LearningCard
                      key={learning.id}
                      learning={learning}
                      expanded={expandedId === learning.id}
                      onToggle={() => setExpandedId(expandedId === learning.id ? null : learning.id)}
                      formatDate={formatDate}
                    />
                  ))}
                </div>
              ) : learnings.length > 0 ? (
                <EmptyState
                  icon={Filter}
                  title="No learnings in this category"
                  description={`No learnings found with category "${selectedCategory}". Try selecting a different filter.`}
                />
              ) : (
                <EmptyState
                  icon={Database}
                  title="No learnings found"
                  description="Try adjusting your search query or browse all learnings"
                />
              )
            ) : activeSource === 'memgraph' ? (
              memgraphResults.length > 0 ? (
                <div className="space-y-2">
                  {memgraphResults.map((node) => (
                    <MemgraphNodeCard key={node.id} node={node} />
                  ))}
                </div>
              ) : (
                <GraphViewer />
              )
            ) : (
              // Qdrant browser
              qdrantLoading && qdrantPoints.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="w-8 h-8 animate-spin text-accent-purple" />
                </div>
              ) : qdrantPoints.length > 0 ? (
                <div className="space-y-2">
                  {qdrantPoints.map((point) => (
                    <QdrantMemoryCard key={point.id} point={point} formatDate={formatDate} />
                  ))}
                  {qdrantNextOffset && (
                    <button
                      onClick={() => loadQdrantMemories(false)}
                      disabled={qdrantLoading}
                      className="w-full py-2 text-sm text-accent-purple hover:bg-accent-purple/10 rounded-lg transition-colors"
                    >
                      {qdrantLoading ? 'Loading...' : 'Load More'}
                    </button>
                  )}
                </div>
              ) : (
                <EmptyState
                  icon={Brain}
                  title="No memories found"
                  description="This collection is empty or try searching for specific content"
                />
              )
            )}
          </div>
        </div>
      )}

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <Database className="w-5 h-5 text-accent-blue" />
            <div>
              <p className="text-lg font-semibold text-text-primary">
                {statsLoading ? '...' : formatNumber(stats?.postgresql.count || 0)}
              </p>
              <p className="text-sm text-text-muted">Learnings</p>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <Layers className="w-5 h-5 text-accent-purple" />
            <div>
              <p className="text-lg font-semibold text-text-primary">
                {statsLoading ? '...' : formatNumber(stats?.memgraph.nodes || 0)}
              </p>
              <p className="text-sm text-text-muted">
                Graph Nodes
                {stats?.memgraph.edges ? ` / ${formatNumber(stats.memgraph.edges)} edges` : ''}
              </p>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <Brain className="w-5 h-5 text-accent-green" />
            <div>
              <p className="text-lg font-semibold text-text-primary">
                {statsLoading ? '...' : formatNumber(stats?.qdrant.vectors || 0)}
              </p>
              <p className="text-sm text-text-muted">Vectors</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Play icon component
function Play({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  )
}

interface LearningCardProps {
  learning: Learning
  expanded: boolean
  onToggle: () => void
  formatDate: (date: string) => string
}

function LearningCard({ learning, expanded, onToggle, formatDate }: LearningCardProps) {
  const categoryColors: Record<string, string> = {
    bugbounty: 'bg-accent-red/20 text-accent-red',
    project: 'bg-accent-blue/20 text-accent-blue',
    architecture: 'bg-accent-purple/20 text-accent-purple',
    security: 'bg-accent-yellow/20 text-accent-yellow',
    general: 'bg-text-muted/20 text-text-muted',
    htb: 'bg-accent-green/20 text-accent-green',
    memory: 'bg-accent-teal/20 text-accent-teal',
  }

  const color = categoryColors[learning.category] || categoryColors.general

  return (
    <div
      className={cn(
        'border border-border rounded-lg transition-all hover:border-border-hover',
        expanded && 'border-accent-purple'
      )}
    >
      <button
        onClick={onToggle}
        className="w-full p-3 flex items-start justify-between gap-3 text-left"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={cn('px-2 py-0.5 rounded text-xs font-medium', color)}>
              {learning.category}
            </span>
            {learning.source && (
              <span className="text-xs text-text-muted flex items-center gap-1">
                <Tag className="w-3 h-3" />
                {learning.source}
              </span>
            )}
          </div>
          <p className={cn('text-sm text-text-primary', !expanded && 'line-clamp-2')}>
            {learning.content}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-text-muted flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {formatDate(learning.createdAt)}
          </span>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-text-muted" />
          ) : (
            <ChevronDown className="w-4 h-4 text-text-muted" />
          )}
        </div>
      </button>
      {expanded && (
        <div className="px-3 pb-3 pt-0 border-t border-border">
          <div className="mt-3 p-3 bg-background rounded-lg">
            <div className="flex items-center gap-2 text-xs text-text-muted mb-2">
              <FileText className="w-3 h-3" />
              Full content
            </div>
            <p className="text-sm text-text-primary whitespace-pre-wrap">{learning.content}</p>
          </div>
          <div className="mt-2 flex items-center gap-4 text-xs text-text-muted">
            <span>ID: {learning.id}</span>
            <span>Confidence: {(learning.confidence * 100).toFixed(0)}%</span>
          </div>
        </div>
      )}
    </div>
  )
}

interface MemgraphNodeCardProps {
  node: MemgraphSearchResult
}

function MemgraphNodeCard({ node }: MemgraphNodeCardProps) {
  const [expanded, setExpanded] = useState(false)

  const typeColors: Record<string, string> = {
    Technique: 'bg-accent-purple/20 text-accent-purple',
    CVE: 'bg-accent-red/20 text-accent-red',
    Tool: 'bg-accent-blue/20 text-accent-blue',
    Target: 'bg-accent-green/20 text-accent-green',
    Attack: 'bg-accent-yellow/20 text-accent-yellow',
    Defense: 'bg-accent-teal/20 text-accent-teal',
  }

  const color = typeColors[node.type] || 'bg-text-muted/20 text-text-muted'

  return (
    <div className="border border-border rounded-lg hover:border-border-hover transition-colors">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-3 flex items-center justify-between gap-3 text-left"
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <span className={cn('px-2 py-0.5 rounded text-xs font-medium flex-shrink-0', color)}>
            {node.type}
          </span>
          <span className="text-sm text-text-primary truncate">{node.label}</span>
        </div>
        <ChevronRight
          className={cn(
            'w-4 h-4 text-text-muted transition-transform',
            expanded && 'rotate-90'
          )}
        />
      </button>
      {expanded && (
        <div className="px-3 pb-3 border-t border-border">
          <div className="mt-3 p-3 bg-background rounded-lg">
            <div className="text-xs text-text-muted mb-2">Properties</div>
            <div className="space-y-1 text-sm">
              {Object.entries(node.properties).slice(0, 10).map(([key, value]) => (
                <div key={key} className="flex gap-2">
                  <span className="text-text-secondary font-medium">{key}:</span>
                  <span className="text-text-primary truncate">
                    {String(value).slice(0, 200)}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-2 text-xs text-text-muted">
            ID: {node.id}
          </div>
        </div>
      )}
    </div>
  )
}

interface QdrantMemoryCardProps {
  point: QdrantPoint
  formatDate: (date: string) => string
}

function QdrantMemoryCard({ point, formatDate }: QdrantMemoryCardProps) {
  const [expanded, setExpanded] = useState(false)
  const data = String(point.payload?.data || '')
  const userId = String(point.payload?.user_id || 'unknown')
  const createdAt = point.payload?.created_at as string | undefined

  return (
    <div className="border border-border rounded-lg hover:border-border-hover transition-colors">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-3 flex items-start justify-between gap-3 text-left"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded text-xs font-medium bg-accent-green/20 text-accent-green flex items-center gap-1">
              <User className="w-3 h-3" />
              {userId}
            </span>
            {createdAt && (
              <span className="text-xs text-text-muted flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatDate(createdAt)}
              </span>
            )}
          </div>
          <p className={cn('text-sm text-text-primary', !expanded && 'line-clamp-2')}>
            {data}
          </p>
        </div>
        <ChevronRight
          className={cn(
            'w-4 h-4 text-text-muted flex-shrink-0 transition-transform',
            expanded && 'rotate-90'
          )}
        />
      </button>
      {expanded && (
        <div className="px-3 pb-3 border-t border-border">
          <div className="mt-3 p-3 bg-background rounded-lg">
            <div className="text-xs text-text-muted mb-2">Full Memory</div>
            <p className="text-sm text-text-primary whitespace-pre-wrap">{data}</p>
          </div>
          <div className="mt-2 p-2 bg-surface rounded text-xs font-mono text-text-muted">
            ID: {point.id}
          </div>
        </div>
      )}
    </div>
  )
}

interface SourceTabProps {
  id: MemorySource
  icon: typeof Database
  label: string
  description: string
  active: boolean
  onClick: () => void
}

function SourceTab({ id, icon: Icon, label, description, active, onClick }: SourceTabProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors',
        active
          ? 'bg-accent-purple/10 border-accent-purple text-accent-purple'
          : 'bg-surface border-border text-text-secondary hover:bg-surface-hover'
      )}
    >
      <Icon className="w-5 h-5" />
      <div className="text-left">
        <p className="font-medium">{label}</p>
        <p className="text-xs text-text-muted">{description}</p>
      </div>
    </button>
  )
}

interface EmptyStateProps {
  icon: typeof Database
  title: string
  description: string
}

function EmptyState({ icon: Icon, title, description }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Icon className="w-12 h-12 text-text-muted mb-4" />
      <h4 className="text-lg font-medium text-text-primary mb-2">{title}</h4>
      <p className="text-text-muted max-w-md">{description}</p>
    </div>
  )
}

function getSearchPlaceholder(source: MemorySource): string {
  switch (source) {
    case 'postgresql':
      return 'Search learnings by content, topic, or category...'
    case 'memgraph':
      return 'Search nodes by name, title, or description...'
    case 'qdrant':
      return 'Search memories by content...'
  }
}

function getSourceName(source: MemorySource): string {
  switch (source) {
    case 'postgresql':
      return 'PostgreSQL'
    case 'memgraph':
      return 'Memgraph'
    case 'qdrant':
      return 'Qdrant'
  }
}
