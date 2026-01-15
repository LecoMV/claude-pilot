import { useCallback, useEffect, useState } from 'react'
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
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMemoryStore, type MemorySource } from '@/stores/memory'
import type { Learning } from '@shared/types'

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

  useEffect(() => {
    loadStats()
    if (activeSource === 'postgresql' && !initialLoaded) {
      loadInitialLearnings()
    }
  }, [loadStats, loadInitialLearnings, activeSource, initialLoaded])

  // Handle search
  const handleSearch = async () => {
    if (activeSource !== 'postgresql') return

    setSearching(true)
    try {
      const result = await window.electron.invoke('memory:learnings', searchQuery || undefined, 50)
      setLearnings(result)
    } catch (error) {
      console.error('Search failed:', error)
    } finally {
      setSearching(false)
    }
  }

  // Handle source change
  const handleSourceChange = (source: MemorySource) => {
    setActiveSource(source)
    clearResults()
    if (source === 'postgresql') {
      loadInitialLearnings()
    }
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
          description="Knowledge Graph"
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
      </div>

      {/* Search */}
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
            disabled={activeSource !== 'postgresql'}
          />
        </div>
        <button
          onClick={handleSearch}
          className="btn btn-primary"
          disabled={searching || activeSource !== 'postgresql'}
        >
          {searching ? (
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

      {/* Results */}
      <div className="card">
        <div className="card-header flex items-center justify-between">
          <h3 className="font-medium text-text-primary">
            {activeSource === 'postgresql' ? 'Learnings' : `${getSourceName(activeSource)} Browser`}
          </h3>
          {activeSource === 'postgresql' && learnings.length > 0 && (
            <span className="text-sm text-text-muted">{learnings.length} results</span>
          )}
        </div>
        <div className="card-body min-h-[300px] max-h-[500px] overflow-y-auto">
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
          ) : (
            <EmptyState
              icon={activeSource === 'memgraph' ? Layers : Brain}
              title={`${getSourceName(activeSource)} Browser`}
              description={`${getSourceName(activeSource)} querying coming soon. Use CLI for now.`}
            />
          )}
        </div>
      </div>

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
      return 'Cypher query (coming soon)...'
    case 'qdrant':
      return 'Semantic search (coming soon)...'
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
