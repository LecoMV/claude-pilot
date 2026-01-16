import { useCallback, useEffect, useState, useMemo, useRef } from 'react'
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
  Zap,
  Activity,
  BarChart3,
  GitBranch,
  ArrowRight,
  Sparkles,
  MessageSquare,
  Command,
  Table,
  Eye,
  Download,
  MoreHorizontal,
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
  'CybersecKB',
  'Sector',
  'HSCode',
  'EmissionField',
  'BugBounty',
  'Security',
  'Lesson',
  'Pattern',
  'Technology',
  'DataSource',
  'Project',
  'Target',
  'Document',
  'Finding',
]

// View modes
type ViewMode = 'browse' | 'search' | 'raw' | 'natural'

interface QdrantPoint {
  id: string
  payload: Record<string, unknown>
  created_at?: string
  score?: number
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

  // View mode state
  const [viewMode, setViewMode] = useState<ViewMode>('browse')

  // Raw query state
  const [rawQuery, setRawQuery] = useState('')
  const [rawResult, setRawResult] = useState<RawQueryResult | null>(null)
  const [rawLoading, setRawLoading] = useState(false)

  // Natural language state
  const [naturalQuery, setNaturalQuery] = useState('')
  const [naturalResponse, setNaturalResponse] = useState<string | null>(null)
  const [naturalLoading, setNaturalLoading] = useState(false)

  // Qdrant state
  const [qdrantCollection, setQdrantCollection] = useState('mem0_memories')
  const [qdrantPoints, setQdrantPoints] = useState<QdrantPoint[]>([])
  const [qdrantNextOffset, setQdrantNextOffset] = useState<string | null>(null)
  const [qdrantLoading, setQdrantLoading] = useState(false)

  // Memgraph search state
  const [memgraphResults, setMemgraphResults] = useState<MemgraphSearchResult[]>([])
  const [memgraphNodeType, setMemgraphNodeType] = useState('all')
  const [memgraphSearching, setMemgraphSearching] = useState(false)

  // UI state
  const [copied, setCopied] = useState(false)
  const [showGraph, setShowGraph] = useState(false)
  const queryInputRef = useRef<HTMLTextAreaElement>(null)

  // Animated counter for stats
  const [animatedStats, setAnimatedStats] = useState({
    postgresql: 0,
    memgraphNodes: 0,
    memgraphEdges: 0,
    qdrant: 0,
  })

  // Load initial data and stats
  const loadStats = useCallback(async () => {
    try {
      setStatsLoading(true)
      const result = await window.electron.invoke('memory:stats')
      setStats(result)

      // Animate the stats
      animateStats(result)
    } catch (error) {
      console.error('Failed to load stats:', error)
    }
  }, [setStats, setStatsLoading])

  // Animate stats numbers
  const animateStats = (targetStats: typeof stats) => {
    if (!targetStats) return

    const duration = 1500
    const steps = 60
    const stepTime = duration / steps

    const targets = {
      postgresql: targetStats.postgresql.count,
      memgraphNodes: targetStats.memgraph.nodes,
      memgraphEdges: targetStats.memgraph.edges,
      qdrant: targetStats.qdrant.vectors,
    }

    let step = 0
    const interval = setInterval(() => {
      step++
      const progress = step / steps
      const easeOut = 1 - Math.pow(1 - progress, 3)

      setAnimatedStats({
        postgresql: Math.floor(targets.postgresql * easeOut),
        memgraphNodes: Math.floor(targets.memgraphNodes * easeOut),
        memgraphEdges: Math.floor(targets.memgraphEdges * easeOut),
        qdrant: Math.floor(targets.qdrant * easeOut),
      })

      if (step >= steps) {
        clearInterval(interval)
        setAnimatedStats(targets)
      }
    }, stepTime)
  }

  const loadInitialLearnings = useCallback(async () => {
    try {
      const result = await window.electron.invoke('memory:learnings', undefined, 50)
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
        50,
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
        const result = await window.electron.invoke('memory:learnings', searchQuery, 100)
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
          100
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
        const result = await window.electron.invoke('memory:qdrant:search', searchQuery, qdrantCollection, 50)
        setQdrantPoints(result.results.map((r: { id: string; payload: Record<string, unknown>; score?: number }) => ({
          id: r.id,
          payload: r.payload,
          score: r.score
        })))
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

  // Handle natural language search
  const handleNaturalSearch = async () => {
    if (!naturalQuery.trim()) return
    setNaturalLoading(true)
    setNaturalResponse(null)

    try {
      // Search all sources and compile response
      const results: string[] = []

      // PostgreSQL
      const learningsResult = await window.electron.invoke('memory:learnings', naturalQuery, 5)
      if (learningsResult.length > 0) {
        results.push('📚 **Learnings Found:**\n' + learningsResult.map((l: Learning, i: number) =>
          `${i + 1}. [${l.category}] ${l.content.slice(0, 200)}${l.content.length > 200 ? '...' : ''}`
        ).join('\n'))
      }

      // Memgraph
      const memgraphResult = await window.electron.invoke('memory:memgraph:search', naturalQuery, undefined, 5)
      if (memgraphResult.results.length > 0) {
        results.push('🔗 **Knowledge Graph Nodes:**\n' + memgraphResult.results.map((n: MemgraphSearchResult, i: number) =>
          `${i + 1}. [${n.type}] ${n.label}`
        ).join('\n'))
      }

      // Qdrant
      const qdrantResult = await window.electron.invoke('memory:qdrant:search', naturalQuery, 'mem0_memories', 5)
      if (qdrantResult.results.length > 0) {
        results.push('🧠 **Vector Memories:**\n' + qdrantResult.results.map((p: { id: string; payload: Record<string, unknown>; score: number }, i: number) => {
          const data = String(p.payload?.data || '').slice(0, 200)
          return `${i + 1}. ${data}${data.length >= 200 ? '...' : ''} (Score: ${(p.score * 100).toFixed(1)}%)`
        }).join('\n'))
      }

      if (results.length > 0) {
        setNaturalResponse(`### Search Results for: "${naturalQuery}"\n\n${results.join('\n\n---\n\n')}`)
      } else {
        setNaturalResponse(`### No results found for: "${naturalQuery}"\n\nTry different keywords or check the raw query mode for advanced searches.`)
      }
    } catch (error) {
      setNaturalResponse(`### Error\n\nFailed to search: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setNaturalLoading(false)
    }
  }

  // Handle source change
  const handleSourceChange = (source: MemorySource) => {
    setActiveSource(source)
    clearResults()
    setRawResult(null)
    setRawQuery('')
    setMemgraphResults([])
    setNaturalResponse(null)
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
    return num.toLocaleString()
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
        return 'SELECT * FROM learnings ORDER BY created_at DESC LIMIT 10'
      case 'memgraph':
        return 'MATCH (n) RETURN n.name, labels(n) LIMIT 10'
      case 'qdrant':
        return 'GET /collections/mem0_memories'
    }
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        if (viewMode === 'raw') handleRawQuery()
        else if (viewMode === 'natural') handleNaturalSearch()
        else handleSearch()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [viewMode, rawQuery, naturalQuery, searchQuery])

  return (
    <div className="space-y-6 animate-in">
      {/* Hero Stats Dashboard */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-surface via-surface to-background border border-border">
        {/* Background pattern */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-accent-purple/5 via-transparent to-transparent" />
        <div className="absolute top-0 right-0 w-96 h-96 bg-accent-purple/3 rounded-full blur-3xl" />

        <div className="relative p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-text-primary flex items-center gap-3">
                <Brain className="w-7 h-7 text-accent-purple" />
                Memory Systems
              </h1>
              <p className="text-text-muted mt-1">
                Unified access to learnings, knowledge graph, and vector memories
              </p>
            </div>
            <button
              onClick={loadStats}
              className="btn btn-secondary"
              disabled={statsLoading}
            >
              <RefreshCw className={cn('w-4 h-4', statsLoading && 'animate-spin')} />
              Refresh
            </button>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-4 gap-4">
            {/* PostgreSQL */}
            <StatCard
              icon={Database}
              label="Learnings"
              sublabel="PostgreSQL"
              value={animatedStats.postgresql}
              loading={statsLoading}
              color="blue"
              onClick={() => handleSourceChange('postgresql')}
              active={activeSource === 'postgresql'}
            />

            {/* Memgraph Nodes */}
            <StatCard
              icon={GitBranch}
              label="Graph Nodes"
              sublabel="CybersecKB"
              value={animatedStats.memgraphNodes}
              loading={statsLoading}
              color="purple"
              onClick={() => handleSourceChange('memgraph')}
              active={activeSource === 'memgraph'}
              highlight={animatedStats.memgraphNodes > 1000000}
            />

            {/* Memgraph Edges */}
            <StatCard
              icon={Activity}
              label="Relationships"
              sublabel="Graph Edges"
              value={animatedStats.memgraphEdges}
              loading={statsLoading}
              color="teal"
              onClick={() => handleSourceChange('memgraph')}
              active={activeSource === 'memgraph'}
            />

            {/* Qdrant */}
            <StatCard
              icon={Brain}
              label="Vectors"
              sublabel="Mem0 Memory"
              value={animatedStats.qdrant}
              loading={statsLoading}
              color="green"
              onClick={() => handleSourceChange('qdrant')}
              active={activeSource === 'qdrant'}
            />
          </div>
        </div>
      </div>

      {/* Source tabs & View Mode */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Source tabs */}
        <div className="flex items-center gap-1 p-1 bg-surface rounded-lg border border-border">
          <SourcePill
            icon={Database}
            label="PostgreSQL"
            active={activeSource === 'postgresql'}
            onClick={() => handleSourceChange('postgresql')}
          />
          <SourcePill
            icon={Layers}
            label="Memgraph"
            active={activeSource === 'memgraph'}
            onClick={() => handleSourceChange('memgraph')}
            badge={formatNumber(stats?.memgraph.nodes || 0)}
          />
          <SourcePill
            icon={Brain}
            label="Qdrant"
            active={activeSource === 'qdrant'}
            onClick={() => handleSourceChange('qdrant')}
          />
        </div>

        {/* View Mode tabs */}
        <div className="flex items-center gap-1 p-1 bg-surface rounded-lg border border-border ml-auto">
          <ViewModePill
            icon={Eye}
            label="Browse"
            active={viewMode === 'browse'}
            onClick={() => setViewMode('browse')}
          />
          <ViewModePill
            icon={Search}
            label="Search"
            active={viewMode === 'search'}
            onClick={() => setViewMode('search')}
          />
          <ViewModePill
            icon={Terminal}
            label="Raw Query"
            active={viewMode === 'raw'}
            onClick={() => setViewMode('raw')}
          />
          <ViewModePill
            icon={Sparkles}
            label="Natural"
            active={viewMode === 'natural'}
            onClick={() => setViewMode('natural')}
          />
        </div>
      </div>

      {/* Search Mode */}
      {viewMode === 'search' && (
        <SearchPanel
          activeSource={activeSource}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          handleSearch={handleSearch}
          searching={searching || memgraphSearching || qdrantLoading}
          selectedCategory={selectedCategory}
          setSelectedCategory={setSelectedCategory}
          availableCategories={availableCategories}
          memgraphNodeType={memgraphNodeType}
          setMemgraphNodeType={setMemgraphNodeType}
          qdrantCollection={qdrantCollection}
          setQdrantCollection={setQdrantCollection}
        />
      )}

      {/* Raw Query Mode */}
      {viewMode === 'raw' && (
        <RawQueryPanel
          activeSource={activeSource}
          rawQuery={rawQuery}
          setRawQuery={setRawQuery}
          handleRawQuery={handleRawQuery}
          rawLoading={rawLoading}
          rawResult={rawResult}
          getRawPlaceholder={getRawPlaceholder}
          handleCopy={handleCopy}
          copied={copied}
        />
      )}

      {/* Natural Language Mode */}
      {viewMode === 'natural' && (
        <NaturalQueryPanel
          naturalQuery={naturalQuery}
          setNaturalQuery={setNaturalQuery}
          handleNaturalSearch={handleNaturalSearch}
          naturalLoading={naturalLoading}
          naturalResponse={naturalResponse}
        />
      )}

      {/* Results */}
      {(viewMode === 'browse' || viewMode === 'search') && (
        <ResultsPanel
          activeSource={activeSource}
          learnings={filteredLearnings}
          memgraphResults={memgraphResults}
          qdrantPoints={qdrantPoints}
          qdrantLoading={qdrantLoading}
          qdrantNextOffset={qdrantNextOffset}
          loadQdrantMemories={loadQdrantMemories}
          expandedId={expandedId}
          setExpandedId={setExpandedId}
          selectedCategory={selectedCategory}
          formatDate={formatDate}
          showGraph={showGraph}
          setShowGraph={setShowGraph}
        />
      )}
    </div>
  )
}

// ============ Sub-components ============

interface StatCardProps {
  icon: typeof Database
  label: string
  sublabel: string
  value: number
  loading: boolean
  color: 'blue' | 'purple' | 'green' | 'teal' | 'yellow' | 'red'
  onClick: () => void
  active: boolean
  highlight?: boolean
}

function StatCard({ icon: Icon, label, sublabel, value, loading, color, onClick, active, highlight }: StatCardProps) {
  const colorClasses = {
    blue: 'text-accent-blue bg-accent-blue/10 border-accent-blue/30',
    purple: 'text-accent-purple bg-accent-purple/10 border-accent-purple/30',
    green: 'text-accent-green bg-accent-green/10 border-accent-green/30',
    teal: 'text-accent-teal bg-accent-teal/10 border-accent-teal/30',
    yellow: 'text-accent-yellow bg-accent-yellow/10 border-accent-yellow/30',
    red: 'text-accent-red bg-accent-red/10 border-accent-red/30',
  }

  const iconBgClasses = {
    blue: 'bg-accent-blue/20 text-accent-blue',
    purple: 'bg-accent-purple/20 text-accent-purple',
    green: 'bg-accent-green/20 text-accent-green',
    teal: 'bg-accent-teal/20 text-accent-teal',
    yellow: 'bg-accent-yellow/20 text-accent-yellow',
    red: 'bg-accent-red/20 text-accent-red',
  }

  const formatValue = (num: number) => {
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`
    if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`
    return num.toLocaleString()
  }

  return (
    <button
      onClick={onClick}
      className={cn(
        'relative p-4 rounded-xl border transition-all duration-300 text-left group',
        active
          ? colorClasses[color]
          : 'bg-surface/50 border-border hover:border-border-hover hover:bg-surface',
        highlight && 'ring-2 ring-accent-purple/20'
      )}
    >
      {highlight && (
        <div className="absolute -top-1 -right-1">
          <span className="flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-purple opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-accent-purple"></span>
          </span>
        </div>
      )}

      <div className="flex items-start justify-between">
        <div className={cn('p-2 rounded-lg', iconBgClasses[color])}>
          <Icon className="w-5 h-5" />
        </div>
        <ArrowRight className={cn(
          'w-4 h-4 text-text-muted opacity-0 transition-opacity',
          'group-hover:opacity-100'
        )} />
      </div>

      <div className="mt-3">
        <p className={cn(
          'text-2xl font-bold tabular-nums',
          active ? `text-${color === 'purple' ? 'accent-purple' : `accent-${color}`}` : 'text-text-primary'
        )}>
          {loading ? (
            <span className="inline-block w-16 h-7 bg-border/50 rounded animate-pulse" />
          ) : (
            formatValue(value)
          )}
        </p>
        <p className="text-sm text-text-muted mt-0.5">{label}</p>
        <p className="text-xs text-text-muted/60">{sublabel}</p>
      </div>
    </button>
  )
}

interface SourcePillProps {
  icon: typeof Database
  label: string
  active: boolean
  onClick: () => void
  badge?: string
}

function SourcePill({ icon: Icon, label, active, onClick, badge }: SourcePillProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all',
        active
          ? 'bg-accent-purple text-white shadow-sm'
          : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
      )}
    >
      <Icon className="w-4 h-4" />
      <span>{label}</span>
      {badge && (
        <span className={cn(
          'px-1.5 py-0.5 rounded text-xs',
          active ? 'bg-white/20' : 'bg-accent-purple/10 text-accent-purple'
        )}>
          {badge}
        </span>
      )}
    </button>
  )
}

interface ViewModePillProps {
  icon: typeof Eye
  label: string
  active: boolean
  onClick: () => void
}

function ViewModePill({ icon: Icon, label, active, onClick }: ViewModePillProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all',
        active
          ? 'bg-surface-hover text-text-primary'
          : 'text-text-muted hover:bg-surface-hover/50 hover:text-text-secondary'
      )}
    >
      <Icon className="w-4 h-4" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}

interface SearchPanelProps {
  activeSource: MemorySource
  searchQuery: string
  setSearchQuery: (query: string) => void
  handleSearch: () => void
  searching: boolean
  selectedCategory: string
  setSelectedCategory: (cat: string) => void
  availableCategories: string[]
  memgraphNodeType: string
  setMemgraphNodeType: (type: string) => void
  qdrantCollection: string
  setQdrantCollection: (col: string) => void
}

function SearchPanel({
  activeSource,
  searchQuery,
  setSearchQuery,
  handleSearch,
  searching,
  selectedCategory,
  setSelectedCategory,
  availableCategories,
  memgraphNodeType,
  setMemgraphNodeType,
  qdrantCollection,
  setQdrantCollection,
}: SearchPanelProps) {
  const placeholder = {
    postgresql: 'Search learnings by content, topic, or category...',
    memgraph: 'Search nodes by name, title, or description...',
    qdrant: 'Search memories by content similarity...',
  }

  return (
    <div className="card">
      <div className="card-body">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              type="text"
              placeholder={placeholder[activeSource]}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="input pl-10 text-base"
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
            </div>
          )}

          {/* Node type filter for Memgraph */}
          {activeSource === 'memgraph' && (
            <div className="relative">
              <Layers className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <select
                value={memgraphNodeType}
                onChange={(e) => setMemgraphNodeType(e.target.value)}
                className="input pl-10 pr-8 appearance-none cursor-pointer min-w-[160px]"
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
                className="input pl-10 pr-8 appearance-none cursor-pointer min-w-[170px]"
              >
                {QDRANT_COLLECTIONS.map((col) => (
                  <option key={col} value={col}>
                    {col}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button onClick={handleSearch} className="btn btn-primary" disabled={searching}>
            {searching ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Search
          </button>
        </div>

        <div className="flex items-center gap-2 mt-3 text-xs text-text-muted">
          <Command className="w-3 h-3" />
          <span>Press <kbd className="px-1.5 py-0.5 rounded bg-surface-hover font-mono">⌘</kbd> + <kbd className="px-1.5 py-0.5 rounded bg-surface-hover font-mono">Enter</kbd> to search</span>
        </div>
      </div>
    </div>
  )
}

interface RawQueryPanelProps {
  activeSource: MemorySource
  rawQuery: string
  setRawQuery: (query: string) => void
  handleRawQuery: () => void
  rawLoading: boolean
  rawResult: RawQueryResult | null
  getRawPlaceholder: () => string
  handleCopy: (text: string) => void
  copied: boolean
}

function RawQueryPanel({
  activeSource,
  rawQuery,
  setRawQuery,
  handleRawQuery,
  rawLoading,
  rawResult,
  getRawPlaceholder,
  handleCopy,
  copied,
}: RawQueryPanelProps) {
  const syntaxHints = {
    postgresql: 'SQL syntax • Tables: learnings (id, category, content, source, confidence, created_at, tags)',
    memgraph: 'Cypher syntax • Nodes: CyberTechnique, Security, BugBounty, Pattern, Technology...',
    qdrant: 'REST API • Methods: GET, POST, PUT, DELETE • Example: GET /collections',
  }

  return (
    <div className="card">
      <div className="card-header border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-accent-yellow" />
            <h3 className="font-medium text-text-primary">Raw Query Mode</h3>
            <span className={cn(
              'px-2 py-0.5 rounded text-xs font-medium',
              activeSource === 'postgresql' ? 'bg-accent-blue/20 text-accent-blue' :
              activeSource === 'memgraph' ? 'bg-accent-purple/20 text-accent-purple' :
              'bg-accent-green/20 text-accent-green'
            )}>
              {activeSource.toUpperCase()}
            </span>
          </div>
          <span className="text-xs text-text-muted">{syntaxHints[activeSource]}</span>
        </div>
      </div>

      <div className="card-body space-y-4">
        <div className="relative">
          <textarea
            value={rawQuery}
            onChange={(e) => setRawQuery(e.target.value)}
            placeholder={getRawPlaceholder()}
            className={cn(
              'w-full font-mono text-sm rounded-lg bg-background border border-border',
              'p-4 min-h-[120px] resize-y',
              'focus:outline-none focus:ring-2 focus:ring-accent-purple/50 focus:border-accent-purple',
              'placeholder:text-text-muted/50'
            )}
            spellCheck={false}
          />
          <div className="absolute bottom-3 right-3 flex items-center gap-2">
            <button
              onClick={handleRawQuery}
              disabled={rawLoading || !rawQuery.trim()}
              className="btn btn-primary btn-sm"
            >
              {rawLoading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Zap className="w-4 h-4" />
              )}
              Execute
            </button>
          </div>
        </div>

        {rawResult && (
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-3">
                {rawResult.success ? (
                  <span className="flex items-center gap-1.5 text-sm text-accent-green">
                    <Check className="w-4 h-4" />
                    Success
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-sm text-accent-red">
                    <AlertCircle className="w-4 h-4" />
                    Error
                  </span>
                )}
                <span className="text-xs text-text-muted">
                  Executed in {rawResult.executionTime}ms
                </span>
                {rawResult.success && Array.isArray(rawResult.data) && (
                  <span className="text-xs text-text-muted">
                    • {rawResult.data.length} results
                  </span>
                )}
              </div>
              <button
                onClick={() => handleCopy(JSON.stringify(rawResult.data, null, 2))}
                className="btn btn-secondary btn-sm"
              >
                {copied ? <Check className="w-4 h-4 text-accent-green" /> : <Copy className="w-4 h-4" />}
                Copy
              </button>
            </div>

            <div className="relative rounded-lg bg-background border border-border overflow-hidden">
              <pre className="p-4 text-sm font-mono overflow-x-auto max-h-[400px] overflow-y-auto text-text-primary">
                {rawResult.error || JSON.stringify(rawResult.data, null, 2)}
              </pre>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 text-xs text-text-muted">
          <Command className="w-3 h-3" />
          <span>Press <kbd className="px-1.5 py-0.5 rounded bg-surface-hover font-mono">⌘</kbd> + <kbd className="px-1.5 py-0.5 rounded bg-surface-hover font-mono">Enter</kbd> to execute</span>
        </div>
      </div>
    </div>
  )
}

interface NaturalQueryPanelProps {
  naturalQuery: string
  setNaturalQuery: (query: string) => void
  handleNaturalSearch: () => void
  naturalLoading: boolean
  naturalResponse: string | null
}

function NaturalQueryPanel({
  naturalQuery,
  setNaturalQuery,
  handleNaturalSearch,
  naturalLoading,
  naturalResponse,
}: NaturalQueryPanelProps) {
  return (
    <div className="card">
      <div className="card-header border-b border-border">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-accent-purple" />
          <h3 className="font-medium text-text-primary">Natural Language Search</h3>
          <span className="px-2 py-0.5 rounded bg-accent-purple/10 text-accent-purple text-xs font-medium">
            All Sources
          </span>
        </div>
      </div>

      <div className="card-body space-y-4">
        <div className="relative">
          <MessageSquare className="absolute left-4 top-4 w-5 h-5 text-text-muted" />
          <textarea
            value={naturalQuery}
            onChange={(e) => setNaturalQuery(e.target.value)}
            placeholder="Ask anything about your memories... e.g., 'What do I know about privilege escalation?' or 'Show me recent bug bounty learnings'"
            className={cn(
              'w-full rounded-lg bg-background border border-border',
              'pl-12 pr-4 py-4 min-h-[100px] resize-y text-base',
              'focus:outline-none focus:ring-2 focus:ring-accent-purple/50 focus:border-accent-purple',
              'placeholder:text-text-muted/50'
            )}
          />
          <div className="absolute bottom-3 right-3">
            <button
              onClick={handleNaturalSearch}
              disabled={naturalLoading || !naturalQuery.trim()}
              className="btn btn-primary"
            >
              {naturalLoading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              Search All
            </button>
          </div>
        </div>

        {naturalResponse && (
          <div className="prose prose-invert prose-sm max-w-none">
            <div className="p-4 rounded-lg bg-background border border-border">
              {naturalResponse.split('\n').map((line, i) => {
                if (line.startsWith('### ')) {
                  return <h3 key={i} className="text-lg font-semibold text-text-primary mt-0 mb-3">{line.replace('### ', '')}</h3>
                }
                if (line.startsWith('**') && line.endsWith('**')) {
                  return <p key={i} className="font-semibold text-accent-purple my-2">{line.replace(/\*\*/g, '')}</p>
                }
                if (line.startsWith('---')) {
                  return <hr key={i} className="border-border my-4" />
                }
                if (line.match(/^\d+\./)) {
                  return <p key={i} className="text-text-secondary ml-4 my-1">{line}</p>
                }
                return line ? <p key={i} className="text-text-secondary my-1">{line}</p> : null
              })}
            </div>
          </div>
        )}

        {!naturalResponse && !naturalLoading && (
          <div className="flex items-center justify-center py-8 text-text-muted">
            <div className="text-center">
              <Sparkles className="w-8 h-8 mx-auto mb-3 opacity-50" />
              <p className="text-sm">Search across all memory systems with natural language</p>
              <p className="text-xs mt-1 opacity-70">Results from PostgreSQL, Memgraph, and Qdrant combined</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

interface ResultsPanelProps {
  activeSource: MemorySource
  learnings: Learning[]
  memgraphResults: MemgraphSearchResult[]
  qdrantPoints: QdrantPoint[]
  qdrantLoading: boolean
  qdrantNextOffset: string | null
  loadQdrantMemories: (reset: boolean) => void
  expandedId: number | null
  setExpandedId: (id: number | null) => void
  selectedCategory: string
  formatDate: (date: string) => string
  showGraph: boolean
  setShowGraph: (show: boolean) => void
}

function ResultsPanel({
  activeSource,
  learnings,
  memgraphResults,
  qdrantPoints,
  qdrantLoading,
  qdrantNextOffset,
  loadQdrantMemories,
  expandedId,
  setExpandedId,
  selectedCategory,
  formatDate,
  showGraph,
  setShowGraph,
}: ResultsPanelProps) {
  return (
    <div className="card">
      <div className="card-header flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-3">
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
            <span className="text-sm text-text-muted bg-surface-hover px-2 py-0.5 rounded">
              {selectedCategory !== 'all'
                ? `${learnings.length} in ${selectedCategory}`
                : `${learnings.length} total`}
            </span>
          )}
          {activeSource === 'memgraph' && memgraphResults.length > 0 && (
            <span className="text-sm text-text-muted bg-surface-hover px-2 py-0.5 rounded">
              {memgraphResults.length} results
            </span>
          )}
          {activeSource === 'qdrant' && qdrantPoints.length > 0 && (
            <span className="text-sm text-text-muted bg-surface-hover px-2 py-0.5 rounded">
              {qdrantPoints.length} memories
            </span>
          )}
        </div>

        {activeSource === 'memgraph' && (
          <button
            onClick={() => setShowGraph(!showGraph)}
            className={cn(
              'btn btn-sm',
              showGraph ? 'btn-primary' : 'btn-secondary'
            )}
          >
            <GitBranch className="w-4 h-4" />
            {showGraph ? 'Hide Graph' : 'Show Graph'}
          </button>
        )}
      </div>

      <div className={cn(
        'card-body overflow-y-auto',
        activeSource === 'memgraph' && showGraph ? 'min-h-[500px] h-[600px]' : 'min-h-[300px] max-h-[600px]'
      )}>
        {activeSource === 'postgresql' ? (
          learnings.length > 0 ? (
            <div className="space-y-2">
              {learnings.map((learning) => (
                <LearningCard
                  key={learning.id}
                  learning={learning}
                  expanded={expandedId === learning.id}
                  onToggle={() => setExpandedId(expandedId === learning.id ? null : learning.id)}
                  formatDate={formatDate}
                />
              ))}
            </div>
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
          ) : showGraph ? (
            <GraphViewer />
          ) : (
            <EmptyState
              icon={Layers}
              title="Search the Knowledge Graph"
              description="Enter a search term or click 'Show Graph' to visualize the graph"
            />
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
                  className="w-full py-3 text-sm font-medium text-accent-purple hover:bg-accent-purple/10 rounded-lg transition-colors border border-dashed border-accent-purple/30"
                >
                  {qdrantLoading ? 'Loading...' : 'Load More Memories'}
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
  )
}

// ============ Card Components ============

interface LearningCardProps {
  learning: Learning
  expanded: boolean
  onToggle: () => void
  formatDate: (date: string) => string
}

function LearningCard({ learning, expanded, onToggle, formatDate }: LearningCardProps) {
  const categoryColors: Record<string, string> = {
    bugbounty: 'bg-accent-red/20 text-accent-red border-accent-red/30',
    project: 'bg-accent-blue/20 text-accent-blue border-accent-blue/30',
    architecture: 'bg-accent-purple/20 text-accent-purple border-accent-purple/30',
    security: 'bg-accent-yellow/20 text-accent-yellow border-accent-yellow/30',
    general: 'bg-text-muted/20 text-text-muted border-text-muted/30',
    htb: 'bg-accent-green/20 text-accent-green border-accent-green/30',
    memory: 'bg-accent-teal/20 text-accent-teal border-accent-teal/30',
  }

  const color = categoryColors[learning.category] || categoryColors.general

  return (
    <div
      className={cn(
        'border rounded-lg transition-all duration-200',
        expanded
          ? 'border-accent-purple bg-accent-purple/5'
          : 'border-border hover:border-border-hover hover:bg-surface/50'
      )}
    >
      <button
        onClick={onToggle}
        className="w-full p-4 flex items-start justify-between gap-3 text-left"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className={cn('px-2 py-0.5 rounded border text-xs font-medium', color)}>
              {learning.category}
            </span>
            {learning.source && (
              <span className="text-xs text-text-muted flex items-center gap-1">
                <Tag className="w-3 h-3" />
                {learning.source}
              </span>
            )}
            <span className="text-xs text-text-muted/60">
              #{learning.id}
            </span>
          </div>
          <p className={cn('text-sm text-text-primary leading-relaxed', !expanded && 'line-clamp-2')}>
            {learning.content}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-xs text-text-muted flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {formatDate(learning.createdAt)}
          </span>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-accent-purple" />
          ) : (
            <ChevronDown className="w-4 h-4 text-text-muted" />
          )}
        </div>
      </button>
      {expanded && (
        <div className="px-4 pb-4 border-t border-border/50">
          <div className="mt-3 p-3 bg-background rounded-lg">
            <div className="flex items-center gap-2 text-xs text-text-muted mb-2">
              <FileText className="w-3 h-3" />
              Full content
            </div>
            <p className="text-sm text-text-primary whitespace-pre-wrap leading-relaxed">
              {learning.content}
            </p>
          </div>
          <div className="mt-3 flex items-center gap-4 text-xs text-text-muted">
            <span className="flex items-center gap-1">
              <BarChart3 className="w-3 h-3" />
              Confidence: {(learning.confidence * 100).toFixed(0)}%
            </span>
            {learning.tags && learning.tags.length > 0 && (
              <span className="flex items-center gap-1">
                <Tag className="w-3 h-3" />
                {learning.tags.join(', ')}
              </span>
            )}
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
    CyberTechnique: 'bg-accent-purple/20 text-accent-purple border-accent-purple/30',
    Security: 'bg-accent-yellow/20 text-accent-yellow border-accent-yellow/30',
    BugBounty: 'bg-accent-red/20 text-accent-red border-accent-red/30',
    Pattern: 'bg-accent-blue/20 text-accent-blue border-accent-blue/30',
    Technology: 'bg-accent-teal/20 text-accent-teal border-accent-teal/30',
    Project: 'bg-accent-green/20 text-accent-green border-accent-green/30',
    Target: 'bg-accent-yellow/20 text-accent-yellow border-accent-yellow/30',
  }

  const color = typeColors[node.type] || 'bg-text-muted/20 text-text-muted border-text-muted/30'

  return (
    <div className={cn(
      'border rounded-lg transition-all duration-200',
      expanded
        ? 'border-accent-purple bg-accent-purple/5'
        : 'border-border hover:border-border-hover hover:bg-surface/50'
    )}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-center justify-between gap-3 text-left"
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <span className={cn('px-2 py-0.5 rounded border text-xs font-medium flex-shrink-0', color)}>
            {node.type}
          </span>
          <span className="text-sm text-text-primary truncate font-medium">{node.label}</span>
        </div>
        <ChevronRight
          className={cn(
            'w-4 h-4 text-text-muted transition-transform duration-200',
            expanded && 'rotate-90 text-accent-purple'
          )}
        />
      </button>
      {expanded && (
        <div className="px-4 pb-4 border-t border-border/50">
          <div className="mt-3 p-3 bg-background rounded-lg">
            <div className="text-xs text-text-muted mb-2 flex items-center gap-2">
              <Table className="w-3 h-3" />
              Properties
            </div>
            <div className="space-y-1.5 text-sm">
              {Object.entries(node.properties).slice(0, 12).map(([key, value]) => (
                <div key={key} className="flex gap-2">
                  <span className="text-text-muted font-mono text-xs min-w-[100px]">{key}:</span>
                  <span className="text-text-primary text-sm truncate flex-1">
                    {String(value).slice(0, 300)}
                  </span>
                </div>
              ))}
              {Object.keys(node.properties).length > 12 && (
                <div className="text-xs text-text-muted pt-1">
                  +{Object.keys(node.properties).length - 12} more properties
                </div>
              )}
            </div>
          </div>
          <div className="mt-2 text-xs text-text-muted font-mono">
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
    <div className={cn(
      'border rounded-lg transition-all duration-200',
      expanded
        ? 'border-accent-green bg-accent-green/5'
        : 'border-border hover:border-border-hover hover:bg-surface/50'
    )}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-start justify-between gap-3 text-left"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2 py-0.5 rounded border border-accent-green/30 text-xs font-medium bg-accent-green/20 text-accent-green flex items-center gap-1">
              <User className="w-3 h-3" />
              {userId}
            </span>
            {createdAt && (
              <span className="text-xs text-text-muted flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatDate(createdAt)}
              </span>
            )}
            {point.score !== undefined && (
              <span className="text-xs text-accent-purple font-medium">
                {(point.score * 100).toFixed(1)}% match
              </span>
            )}
          </div>
          <p className={cn('text-sm text-text-primary leading-relaxed', !expanded && 'line-clamp-2')}>
            {data}
          </p>
        </div>
        <ChevronRight
          className={cn(
            'w-4 h-4 text-text-muted flex-shrink-0 transition-transform duration-200',
            expanded && 'rotate-90 text-accent-green'
          )}
        />
      </button>
      {expanded && (
        <div className="px-4 pb-4 border-t border-border/50">
          <div className="mt-3 p-3 bg-background rounded-lg">
            <div className="text-xs text-text-muted mb-2 flex items-center gap-2">
              <Brain className="w-3 h-3" />
              Full Memory
            </div>
            <p className="text-sm text-text-primary whitespace-pre-wrap leading-relaxed">{data}</p>
          </div>
          <div className="mt-2 p-2 bg-surface rounded text-xs font-mono text-text-muted flex items-center gap-2">
            <span>ID: {point.id}</span>
            {point.score !== undefined && (
              <>
                <span className="text-border">•</span>
                <span>Similarity: {(point.score * 100).toFixed(2)}%</span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

interface EmptyStateProps {
  icon: typeof Database
  title: string
  description: string
}

function EmptyState({ icon: Icon, title, description }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="p-4 rounded-full bg-surface-hover mb-4">
        <Icon className="w-10 h-10 text-text-muted" />
      </div>
      <h4 className="text-lg font-medium text-text-primary mb-2">{title}</h4>
      <p className="text-text-muted max-w-md text-sm">{description}</p>
    </div>
  )
}
