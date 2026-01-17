import { useCallback, useEffect, useState } from 'react'
import {
  Database,
  Search,
  RefreshCw,
  Settings2,
  Layers,
  Sparkles,
  BarChart3,
  CheckCircle2,
  XCircle,
  Loader2,
  TableIcon,
  Index,
  AlertTriangle,
  Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type {
  PgVectorStatus,
  PgVectorCollection,
  PgVectorSearchResult,
  PgVectorAutoEmbedConfig,
  PgVectorIndexConfig,
  VectorIndexType,
} from '@shared/types'

// Format bytes to human-readable
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

// Index type badge colors
const indexTypeColors: Record<VectorIndexType, string> = {
  hnsw: 'bg-green-500/20 text-green-400 border-green-500/30',
  ivfflat: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  none: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
}

export function PgVectorPanel() {
  // State
  const [status, setStatus] = useState<PgVectorStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<PgVectorSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedTable, setSelectedTable] = useState<string>('')
  const [threshold, setThreshold] = useState(0.5)
  const [showSettings, setShowSettings] = useState(false)
  const [autoConfig, setAutoConfig] = useState<PgVectorAutoEmbedConfig | null>(null)
  const [selectedCollection, setSelectedCollection] = useState<PgVectorCollection | null>(null)
  const [indexModalOpen, setIndexModalOpen] = useState(false)
  const [indexConfig, setIndexConfig] = useState<PgVectorIndexConfig>({
    type: 'hnsw',
    m: 16,
    efConstruction: 64,
  })

  // Load status
  const loadStatus = useCallback(async () => {
    setLoading(true)
    try {
      const data = await window.electron.invoke('pgvector:status')
      setStatus(data)
    } catch (error) {
      console.error('Failed to load pgvector status:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  // Load auto-embed config
  const loadAutoConfig = useCallback(async () => {
    try {
      const config = await window.electron.invoke('pgvector:getAutoConfig')
      setAutoConfig(config)
    } catch (error) {
      console.error('Failed to load auto-embed config:', error)
    }
  }, [])

  useEffect(() => {
    loadStatus()
    loadAutoConfig()
  }, [loadStatus, loadAutoConfig])

  // Search vectors
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return

    setSearching(true)
    try {
      const results = await window.electron.invoke(
        'pgvector:search',
        searchQuery,
        selectedTable || undefined,
        20,
        threshold
      )
      setSearchResults(results)
    } catch (error) {
      console.error('Search failed:', error)
    } finally {
      setSearching(false)
    }
  }, [searchQuery, selectedTable, threshold])

  // Save auto-embed config
  const saveAutoConfig = useCallback(async (config: PgVectorAutoEmbedConfig) => {
    try {
      await window.electron.invoke('pgvector:setAutoConfig', config)
      setAutoConfig(config)
    } catch (error) {
      console.error('Failed to save config:', error)
    }
  }, [])

  // Create/rebuild index
  const handleCreateIndex = useCallback(async () => {
    if (!selectedCollection) return

    try {
      await window.electron.invoke(
        'pgvector:createIndex',
        selectedCollection.tableName,
        indexConfig
      )
      setIndexModalOpen(false)
      loadStatus()
    } catch (error) {
      console.error('Failed to create index:', error)
    }
  }, [selectedCollection, indexConfig, loadStatus])

  // Vacuum table
  const handleVacuum = useCallback(
    async (table: string) => {
      try {
        await window.electron.invoke('pgvector:vacuum', table)
        loadStatus()
      } catch (error) {
        console.error('Failed to vacuum table:', error)
      }
    },
    [loadStatus]
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-accent-purple" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header with status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={cn('p-2 rounded-lg', status?.enabled ? 'bg-green-500/20' : 'bg-red-500/20')}
          >
            <Database
              className={cn('w-5 h-5', status?.enabled ? 'text-green-400' : 'text-red-400')}
            />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
              pgvector Embeddings
              {status?.enabled ? (
                <span className="flex items-center gap-1 text-sm text-green-400">
                  <CheckCircle2 className="w-4 h-4" /> v{status.version}
                </span>
              ) : (
                <span className="flex items-center gap-1 text-sm text-red-400">
                  <XCircle className="w-4 h-4" /> Not installed
                </span>
              )}
            </h2>
            <p className="text-sm text-text-muted">
              Model:{' '}
              <span className="text-accent-blue">
                {status?.embeddingModel || 'nomic-embed-text'}
              </span>
              {' | '}
              Dimensions:{' '}
              <span className="text-accent-purple">{status?.defaultDimensions || 768}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={cn(
              'p-2 rounded-lg transition-colors',
              showSettings
                ? 'bg-accent-purple/20 text-accent-purple'
                : 'hover:bg-surface text-text-muted hover:text-text-primary'
            )}
          >
            <Settings2 className="w-5 h-5" />
          </button>
          <button
            onClick={loadStatus}
            className="p-2 hover:bg-surface rounded-lg transition-colors text-text-muted hover:text-text-primary"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Auto-embed settings panel */}
      {showSettings && autoConfig && (
        <div className="p-4 bg-surface rounded-lg border border-border space-y-4">
          <h3 className="font-medium text-text-primary flex items-center gap-2">
            <Zap className="w-4 h-4 text-accent-yellow" />
            Auto-Embedding Configuration
          </h3>

          <div className="grid grid-cols-2 gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoConfig.enableLearnings}
                onChange={(e) =>
                  saveAutoConfig({ ...autoConfig, enableLearnings: e.target.checked })
                }
                className="rounded border-border bg-background"
              />
              <span className="text-sm text-text-primary">Embed Learnings</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoConfig.enableSessions}
                onChange={(e) =>
                  saveAutoConfig({ ...autoConfig, enableSessions: e.target.checked })
                }
                className="rounded border-border bg-background"
              />
              <span className="text-sm text-text-primary">Embed Sessions</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoConfig.enableCode}
                onChange={(e) => saveAutoConfig({ ...autoConfig, enableCode: e.target.checked })}
                className="rounded border-border bg-background"
              />
              <span className="text-sm text-text-primary">Embed Code</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoConfig.enableCommits}
                onChange={(e) => saveAutoConfig({ ...autoConfig, enableCommits: e.target.checked })}
                className="rounded border-border bg-background"
              />
              <span className="text-sm text-text-primary">Embed Commits</span>
            </label>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-text-muted mb-1 block">Batch Size</label>
              <input
                type="number"
                value={autoConfig.batchSize}
                onChange={(e) =>
                  saveAutoConfig({ ...autoConfig, batchSize: parseInt(e.target.value) || 10 })
                }
                className="w-full px-3 py-1.5 rounded-lg bg-background border border-border text-sm text-text-primary"
                min={1}
                max={100}
              />
            </div>

            <div>
              <label className="text-xs text-text-muted mb-1 block">Concurrent Requests</label>
              <input
                type="number"
                value={autoConfig.concurrentRequests}
                onChange={(e) =>
                  saveAutoConfig({
                    ...autoConfig,
                    concurrentRequests: parseInt(e.target.value) || 2,
                  })
                }
                className="w-full px-3 py-1.5 rounded-lg bg-background border border-border text-sm text-text-primary"
                min={1}
                max={10}
              />
            </div>

            <div>
              <label className="text-xs text-text-muted mb-1 block">Rate Limit (req/min)</label>
              <input
                type="number"
                value={autoConfig.rateLimit}
                onChange={(e) =>
                  saveAutoConfig({ ...autoConfig, rateLimit: parseInt(e.target.value) || 100 })
                }
                className="w-full px-3 py-1.5 rounded-lg bg-background border border-border text-sm text-text-primary"
                min={10}
                max={1000}
              />
            </div>
          </div>
        </div>
      )}

      {/* Collections table */}
      {status?.enabled && status.collections.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-medium text-text-primary flex items-center gap-2">
            <Layers className="w-4 h-4 text-accent-blue" />
            Vector Collections
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="py-2 px-3 text-text-muted font-medium">Table</th>
                  <th className="py-2 px-3 text-text-muted font-medium">Vectors</th>
                  <th className="py-2 px-3 text-text-muted font-medium">Dims</th>
                  <th className="py-2 px-3 text-text-muted font-medium">Index</th>
                  <th className="py-2 px-3 text-text-muted font-medium">Size</th>
                  <th className="py-2 px-3 text-text-muted font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {status.collections.map((collection) => (
                  <tr
                    key={collection.tableName}
                    className="border-b border-border/50 hover:bg-surface/50 transition-colors"
                  >
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-2">
                        <TableIcon className="w-4 h-4 text-text-muted" />
                        <span className="text-text-primary font-mono">{collection.tableName}</span>
                      </div>
                    </td>
                    <td className="py-2 px-3 text-accent-purple font-medium">
                      {collection.vectorCount.toLocaleString()}
                    </td>
                    <td className="py-2 px-3 text-text-muted">{collection.dimensions}</td>
                    <td className="py-2 px-3">
                      <span
                        className={cn(
                          'px-2 py-0.5 rounded-md text-xs border',
                          indexTypeColors[collection.indexType]
                        )}
                      >
                        {collection.indexType === 'none'
                          ? 'No Index'
                          : collection.indexType.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-text-muted">
                      {formatBytes(collection.sizeBytes)}
                    </td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            setSelectedCollection(collection)
                            setIndexModalOpen(true)
                          }}
                          className="p-1.5 hover:bg-surface rounded transition-colors text-text-muted hover:text-accent-blue"
                          title="Configure Index"
                        >
                          <Index className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleVacuum(collection.tableName)}
                          className="p-1.5 hover:bg-surface rounded transition-colors text-text-muted hover:text-accent-green"
                          title="Vacuum Table"
                        >
                          <Sparkles className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* No collections message */}
      {status?.enabled && status.collections.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Database className="w-12 h-12 text-text-muted/50 mb-3" />
          <p className="text-text-muted">No vector tables found</p>
          <p className="text-sm text-text-muted/70 mt-1">
            Create a table with a vector column to get started
          </p>
        </div>
      )}

      {/* Not enabled message */}
      {!status?.enabled && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <AlertTriangle className="w-12 h-12 text-yellow-500/50 mb-3" />
          <p className="text-text-muted">pgvector extension not installed</p>
          <p className="text-sm text-text-muted/70 mt-1">
            Run <code className="px-1 py-0.5 bg-surface rounded">CREATE EXTENSION vector;</code> to
            enable
          </p>
        </div>
      )}

      {/* Semantic search */}
      {status?.enabled && (
        <div className="space-y-4">
          <h3 className="font-medium text-text-primary flex items-center gap-2">
            <Search className="w-4 h-4 text-accent-purple" />
            Semantic Search
          </h3>

          <div className="flex gap-2">
            <div className="flex-1 relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Search vectors semantically..."
                className="w-full pl-10 pr-4 py-2 rounded-lg bg-surface border border-border text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-purple"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            </div>

            <select
              value={selectedTable}
              onChange={(e) => setSelectedTable(e.target.value)}
              className="px-3 py-2 rounded-lg bg-surface border border-border text-text-primary text-sm"
            >
              <option value="">All Tables</option>
              {status.collections.map((c) => (
                <option key={c.tableName} value={c.tableName}>
                  {c.tableName}
                </option>
              ))}
            </select>

            <div className="flex items-center gap-2">
              <label className="text-xs text-text-muted">Min:</label>
              <input
                type="number"
                value={threshold}
                onChange={(e) => setThreshold(parseFloat(e.target.value) || 0.5)}
                min={0}
                max={1}
                step={0.1}
                className="w-16 px-2 py-2 rounded-lg bg-surface border border-border text-text-primary text-sm"
              />
            </div>

            <button
              onClick={handleSearch}
              disabled={searching || !searchQuery.trim()}
              className={cn(
                'px-4 py-2 rounded-lg font-medium transition-colors',
                searching || !searchQuery.trim()
                  ? 'bg-surface text-text-muted cursor-not-allowed'
                  : 'bg-accent-purple text-white hover:bg-accent-purple/80'
              )}
            >
              {searching ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Search'}
            </button>
          </div>

          {/* Search results */}
          {searchResults.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm text-text-muted">Found {searchResults.length} results</p>

              {searchResults.map((result, index) => (
                <div
                  key={`${result.tableName}-${result.id}-${index}`}
                  className="p-3 bg-surface rounded-lg border border-border"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-text-muted">{result.tableName}</span>
                      <span className="text-xs text-text-muted">ID: {String(result.id)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <BarChart3 className="w-3 h-3 text-accent-purple" />
                      <span
                        className={cn(
                          'text-sm font-medium',
                          result.similarity >= 0.8
                            ? 'text-green-400'
                            : result.similarity >= 0.6
                              ? 'text-yellow-400'
                              : 'text-red-400'
                        )}
                      >
                        {(result.similarity * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  <p className="text-sm text-text-primary line-clamp-3">{result.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Index configuration modal */}
      {indexModalOpen && selectedCollection && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background border border-border rounded-xl p-6 w-[400px] space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-text-primary">Configure Index</h3>
              <button
                onClick={() => setIndexModalOpen(false)}
                className="p-1 hover:bg-surface rounded"
              >
                <XCircle className="w-5 h-5 text-text-muted" />
              </button>
            </div>

            <p className="text-sm text-text-muted">
              Table:{' '}
              <span className="font-mono text-text-primary">{selectedCollection.tableName}</span>
            </p>

            <div>
              <label className="text-sm text-text-muted mb-2 block">Index Type</label>
              <div className="grid grid-cols-3 gap-2">
                {(['hnsw', 'ivfflat', 'none'] as VectorIndexType[]).map((type) => (
                  <button
                    key={type}
                    onClick={() => setIndexConfig({ ...indexConfig, type })}
                    className={cn(
                      'px-3 py-2 rounded-lg border text-sm font-medium transition-colors',
                      indexConfig.type === type
                        ? 'border-accent-purple bg-accent-purple/20 text-accent-purple'
                        : 'border-border text-text-muted hover:border-accent-purple/50'
                    )}
                  >
                    {type === 'none' ? 'None' : type.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {indexConfig.type === 'hnsw' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-text-muted mb-1 block">M (connections)</label>
                  <input
                    type="number"
                    value={indexConfig.m || 16}
                    onChange={(e) =>
                      setIndexConfig({ ...indexConfig, m: parseInt(e.target.value) || 16 })
                    }
                    className="w-full px-3 py-1.5 rounded-lg bg-surface border border-border text-sm text-text-primary"
                    min={4}
                    max={64}
                  />
                </div>
                <div>
                  <label className="text-xs text-text-muted mb-1 block">ef_construction</label>
                  <input
                    type="number"
                    value={indexConfig.efConstruction || 64}
                    onChange={(e) =>
                      setIndexConfig({
                        ...indexConfig,
                        efConstruction: parseInt(e.target.value) || 64,
                      })
                    }
                    className="w-full px-3 py-1.5 rounded-lg bg-surface border border-border text-sm text-text-primary"
                    min={16}
                    max={512}
                  />
                </div>
              </div>
            )}

            {indexConfig.type === 'ivfflat' && (
              <div>
                <label className="text-xs text-text-muted mb-1 block">Lists (clusters)</label>
                <input
                  type="number"
                  value={indexConfig.lists || 100}
                  onChange={(e) =>
                    setIndexConfig({ ...indexConfig, lists: parseInt(e.target.value) || 100 })
                  }
                  className="w-full px-3 py-1.5 rounded-lg bg-surface border border-border text-sm text-text-primary"
                  min={10}
                  max={1000}
                />
                <p className="text-xs text-text-muted mt-1">
                  Recommended: sqrt(vectorCount) = ~
                  {Math.round(Math.sqrt(selectedCollection.vectorCount))}
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4 border-t border-border">
              <button
                onClick={() => setIndexModalOpen(false)}
                className="px-4 py-2 rounded-lg text-text-muted hover:bg-surface transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateIndex}
                className="px-4 py-2 rounded-lg bg-accent-purple text-white hover:bg-accent-purple/80 transition-colors"
              >
                {indexConfig.type === 'none' ? 'Remove Index' : 'Create Index'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
