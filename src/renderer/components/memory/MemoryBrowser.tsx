import { useState } from 'react'
import { Database, Search, Brain, Layers, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

type MemorySource = 'postgresql' | 'memgraph' | 'qdrant'

export function MemoryBrowser() {
  const [activeSource, setActiveSource] = useState<MemorySource>('postgresql')
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)

  const handleSearch = async () => {
    if (!searchQuery.trim()) return
    setSearching(true)
    // TODO: Implement search
    setTimeout(() => setSearching(false), 1000)
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
          onClick={() => setActiveSource('postgresql')}
        />
        <SourceTab
          id="memgraph"
          icon={Layers}
          label="Memgraph"
          description="Knowledge Graph"
          active={activeSource === 'memgraph'}
          onClick={() => setActiveSource('memgraph')}
        />
        <SourceTab
          id="qdrant"
          icon={Brain}
          label="Qdrant"
          description="Vector Memory"
          active={activeSource === 'qdrant'}
          onClick={() => setActiveSource('qdrant')}
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
          />
        </div>
        <button
          onClick={handleSearch}
          className="btn btn-primary"
          disabled={searching || !searchQuery.trim()}
        >
          {searching ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Search className="w-4 h-4" />
          )}
          Search
        </button>
      </div>

      {/* Results */}
      <div className="card">
        <div className="card-header">
          <h3 className="font-medium text-text-primary">Results</h3>
        </div>
        <div className="card-body min-h-[300px]">
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Database className="w-12 h-12 text-text-muted mb-4" />
            <h4 className="text-lg font-medium text-text-primary mb-2">
              Search {getSourceName(activeSource)}
            </h4>
            <p className="text-text-muted max-w-md">
              Enter a query to search through your {getSourceDescription(activeSource)}
            </p>
          </div>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <Database className="w-5 h-5 text-accent-blue" />
            <div>
              <p className="text-lg font-semibold text-text-primary">55</p>
              <p className="text-sm text-text-muted">Learnings</p>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <Layers className="w-5 h-5 text-accent-purple" />
            <div>
              <p className="text-lg font-semibold text-text-primary">1.77M</p>
              <p className="text-sm text-text-muted">Graph Nodes</p>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <Brain className="w-5 h-5 text-accent-green" />
            <div>
              <p className="text-lg font-semibold text-text-primary">19</p>
              <p className="text-sm text-text-muted">Vectors</p>
            </div>
          </div>
        </div>
      </div>
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

function getSearchPlaceholder(source: MemorySource): string {
  switch (source) {
    case 'postgresql':
      return 'Search learnings...'
    case 'memgraph':
      return 'Cypher query or keyword...'
    case 'qdrant':
      return 'Semantic search...'
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

function getSourceDescription(source: MemorySource): string {
  switch (source) {
    case 'postgresql':
      return 'learnings and project knowledge'
    case 'memgraph':
      return 'knowledge graph relationships'
    case 'qdrant':
      return 'vector memories'
  }
}
