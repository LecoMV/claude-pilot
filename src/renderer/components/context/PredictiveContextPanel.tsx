import { useCallback, useEffect, useState } from 'react'
import {
  Brain,
  Search,
  RefreshCw,
  Settings2,
  FileText,
  TrendingUp,
  History,
  Zap,
  CheckCircle2,
  XCircle,
  Loader2,
  BarChart3,
  Trash2,
  Eye,
  Target,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { trpc } from '@/lib/trpc/react'
import type {
  FilePrediction,
  FileAccessPattern,
  PredictiveContextStats,
  PredictiveContextConfig,
} from '@shared/types'

// Confidence color based on score
function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.8) return 'text-green-400'
  if (confidence >= 0.6) return 'text-yellow-400'
  if (confidence >= 0.4) return 'text-orange-400'
  return 'text-red-400'
}

// Source badge colors
const sourceColors: Record<string, string> = {
  keyword: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  pattern: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  cooccurrence: 'bg-green-500/20 text-green-400 border-green-500/30',
  recent: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
}

interface PredictiveContextPanelProps {
  projectPath?: string
}

export function PredictiveContextPanel({ projectPath }: PredictiveContextPanelProps) {
  // State
  const [predictions, setPredictions] = useState<FilePrediction[]>([])
  const [patterns, setPatterns] = useState<FileAccessPattern[]>([])
  const [stats, setStats] = useState<PredictiveContextStats | null>(null)
  const [config, setConfig] = useState<PredictiveContextConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [testPrompt, setTestPrompt] = useState('')
  const [predicting, setPredicting] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [activeTab, setActiveTab] = useState<'predict' | 'patterns' | 'stats'>('predict')

  // tRPC utils for fetching in callbacks
  const utils = trpc.useUtils()

  // tRPC mutations
  const setConfigMutation = trpc.context.setConfig.useMutation()
  const clearCacheMutation = trpc.context.clearCache.useMutation()

  // Load data
  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [statsData, configData, patternsData] = await Promise.all([
        utils.context.stats.fetch(),
        utils.context.getConfig.fetch(),
        projectPath ? utils.context.patterns.fetch({ projectPath }) : Promise.resolve([]),
      ])
      setStats(statsData)
      setConfig(configData)
      setPatterns(patternsData)
    } catch (error) {
      console.error('Failed to load predictive context data:', error)
    } finally {
      setLoading(false)
    }
  }, [projectPath, utils])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Test prediction
  const handlePredict = useCallback(async () => {
    if (!testPrompt.trim() || !projectPath) return

    setPredicting(true)
    try {
      const results = await utils.context.predict.fetch({ prompt: testPrompt, projectPath })
      setPredictions(results)
    } catch (error) {
      console.error('Prediction failed:', error)
    } finally {
      setPredicting(false)
    }
  }, [testPrompt, projectPath, utils])

  // Save config
  const saveConfig = useCallback(
    async (newConfig: PredictiveContextConfig) => {
      try {
        await setConfigMutation.mutateAsync(newConfig)
        setConfig(newConfig)
      } catch (error) {
        console.error('Failed to save config:', error)
      }
    },
    [setConfigMutation]
  )

  // Clear cache
  const handleClearCache = useCallback(async () => {
    try {
      await clearCacheMutation.mutateAsync()
      loadData()
    } catch (error) {
      console.error('Failed to clear cache:', error)
    }
  }, [loadData, clearCacheMutation])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-accent-purple" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={cn('p-2 rounded-lg', config?.enabled ? 'bg-green-500/20' : 'bg-surface')}>
            <Brain
              className={cn('w-5 h-5', config?.enabled ? 'text-green-400' : 'text-text-muted')}
            />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
              Predictive Context
              {config?.enabled ? (
                <span className="flex items-center gap-1 text-sm text-green-400">
                  <CheckCircle2 className="w-4 h-4" /> Active
                </span>
              ) : (
                <span className="flex items-center gap-1 text-sm text-text-muted">
                  <XCircle className="w-4 h-4" /> Disabled
                </span>
              )}
            </h2>
            <p className="text-sm text-text-muted">
              Predicts files Claude will need based on prompts and access patterns
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
            onClick={loadData}
            className="p-2 hover:bg-surface rounded-lg transition-colors text-text-muted hover:text-text-primary"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Settings panel */}
      {showSettings && config && (
        <div className="p-4 bg-surface rounded-lg border border-border space-y-4">
          <h3 className="font-medium text-text-primary flex items-center gap-2">
            <Zap className="w-4 h-4 text-accent-yellow" />
            Configuration
          </h3>

          <div className="grid grid-cols-2 gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={(e) => saveConfig({ ...config, enabled: e.target.checked })}
                className="rounded border-border bg-background"
              />
              <span className="text-sm text-text-primary">Enable Predictions</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.trackHistory}
                onChange={(e) => saveConfig({ ...config, trackHistory: e.target.checked })}
                className="rounded border-border bg-background"
              />
              <span className="text-sm text-text-primary">Track Access History</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.preloadEnabled}
                onChange={(e) => saveConfig({ ...config, preloadEnabled: e.target.checked })}
                className="rounded border-border bg-background"
              />
              <span className="text-sm text-text-primary">Pre-load Predicted Files</span>
            </label>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-text-muted mb-1 block">Max Predictions</label>
              <input
                type="number"
                value={config.maxPredictions}
                onChange={(e) =>
                  saveConfig({ ...config, maxPredictions: parseInt(e.target.value) || 10 })
                }
                className="w-full px-3 py-1.5 rounded-lg bg-background border border-border text-sm text-text-primary"
                min={1}
                max={50}
              />
            </div>

            <div>
              <label className="text-xs text-text-muted mb-1 block">Min Confidence</label>
              <input
                type="number"
                value={config.minConfidence}
                onChange={(e) =>
                  saveConfig({ ...config, minConfidence: parseFloat(e.target.value) || 0.3 })
                }
                className="w-full px-3 py-1.5 rounded-lg bg-background border border-border text-sm text-text-primary"
                min={0}
                max={1}
                step={0.1}
              />
            </div>

            <div>
              <label className="text-xs text-text-muted mb-1 block">Cache Size</label>
              <input
                type="number"
                value={config.cacheSize}
                onChange={(e) =>
                  saveConfig({ ...config, cacheSize: parseInt(e.target.value) || 1000 })
                }
                className="w-full px-3 py-1.5 rounded-lg bg-background border border-border text-sm text-text-primary"
                min={100}
                max={10000}
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleClearCache}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Clear Cache
            </button>
          </div>
        </div>
      )}

      {/* Stats summary */}
      {stats && (
        <div className="grid grid-cols-4 gap-4">
          <div className="p-3 bg-surface rounded-lg border border-border">
            <div className="flex items-center gap-2 mb-1">
              <Target className="w-4 h-4 text-accent-purple" />
              <span className="text-xs text-text-muted">Total Predictions</span>
            </div>
            <span className="text-xl font-semibold text-text-primary">
              {stats.totalPredictions}
            </span>
          </div>

          <div className="p-3 bg-surface rounded-lg border border-border">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-green-400" />
              <span className="text-xs text-text-muted">Accuracy</span>
            </div>
            <span className="text-xl font-semibold text-text-primary">
              {(stats.accuracy * 100).toFixed(1)}%
            </span>
          </div>

          <div className="p-3 bg-surface rounded-lg border border-border">
            <div className="flex items-center gap-2 mb-1">
              <FileText className="w-4 h-4 text-accent-blue" />
              <span className="text-xs text-text-muted">Tracked Files</span>
            </div>
            <span className="text-xl font-semibold text-text-primary">{stats.trackedFiles}</span>
          </div>

          <div className="p-3 bg-surface rounded-lg border border-border">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="w-4 h-4 text-yellow-400" />
              <span className="text-xs text-text-muted">Cache Hit Rate</span>
            </div>
            <span className="text-xl font-semibold text-text-primary">
              {(stats.cacheHitRate * 100).toFixed(1)}%
            </span>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border">
        <button
          onClick={() => setActiveTab('predict')}
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
            activeTab === 'predict'
              ? 'border-accent-purple text-accent-purple'
              : 'border-transparent text-text-muted hover:text-text-primary'
          )}
        >
          <span className="flex items-center gap-2">
            <Search className="w-4 h-4" />
            Test Predictions
          </span>
        </button>
        <button
          onClick={() => setActiveTab('patterns')}
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
            activeTab === 'patterns'
              ? 'border-accent-purple text-accent-purple'
              : 'border-transparent text-text-muted hover:text-text-primary'
          )}
        >
          <span className="flex items-center gap-2">
            <History className="w-4 h-4" />
            Access Patterns
          </span>
        </button>
      </div>

      {/* Predict tab */}
      {activeTab === 'predict' && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <input
                type="text"
                value={testPrompt}
                onChange={(e) => setTestPrompt(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handlePredict()}
                placeholder="Enter a prompt to test predictions..."
                className="w-full pl-10 pr-4 py-2 rounded-lg bg-surface border border-border text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-purple"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            </div>

            <button
              onClick={handlePredict}
              disabled={predicting || !testPrompt.trim() || !projectPath}
              className={cn(
                'px-4 py-2 rounded-lg font-medium transition-colors',
                predicting || !testPrompt.trim() || !projectPath
                  ? 'bg-surface text-text-muted cursor-not-allowed'
                  : 'bg-accent-purple text-white hover:bg-accent-purple/80'
              )}
            >
              {predicting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Predict'}
            </button>
          </div>

          {!projectPath && (
            <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-yellow-400 text-sm">
              Select a project to test predictions
            </div>
          )}

          {/* Prediction results */}
          {predictions.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm text-text-muted">{predictions.length} predicted files</p>

              {predictions.map((prediction, index) => (
                <div
                  key={`${prediction.path}-${index}`}
                  className="p-3 bg-surface rounded-lg border border-border hover:border-accent-purple/50 transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-text-muted" />
                      <span className="font-mono text-sm text-text-primary">{prediction.path}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'px-2 py-0.5 rounded-md text-xs border',
                          sourceColors[prediction.source]
                        )}
                      >
                        {prediction.source}
                      </span>
                      <div className="flex items-center gap-1">
                        <BarChart3 className="w-3 h-3 text-accent-purple" />
                        <span
                          className={cn(
                            'text-sm font-medium',
                            getConfidenceColor(prediction.confidence)
                          )}
                        >
                          {(prediction.confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-text-muted">{prediction.reason}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Patterns tab */}
      {activeTab === 'patterns' && (
        <div className="space-y-2">
          {patterns.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <History className="w-12 h-12 text-text-muted/50 mb-3" />
              <p className="text-text-muted">No access patterns recorded yet</p>
              <p className="text-sm text-text-muted/70 mt-1">
                Patterns are learned as files are accessed during Claude sessions
              </p>
            </div>
          ) : (
            patterns.map((pattern, index) => (
              <div
                key={`${pattern.path}-${index}`}
                className="p-3 bg-surface rounded-lg border border-border"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-text-muted" />
                    <span className="font-mono text-sm text-text-primary">{pattern.path}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-text-muted">
                    <span className="flex items-center gap-1">
                      <Eye className="w-3 h-3" />
                      {pattern.accessCount} accesses
                    </span>
                    <span>{new Date(pattern.lastAccessed).toLocaleDateString()}</span>
                  </div>
                </div>

                {pattern.keywords.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {pattern.keywords.slice(0, 5).map((keyword) => (
                      <span
                        key={keyword}
                        className="px-1.5 py-0.5 bg-accent-purple/20 text-accent-purple text-xs rounded"
                      >
                        {keyword}
                      </span>
                    ))}
                    {pattern.keywords.length > 5 && (
                      <span className="text-xs text-text-muted">
                        +{pattern.keywords.length - 5} more
                      </span>
                    )}
                  </div>
                )}

                {pattern.cooccurringFiles.length > 0 && (
                  <div className="text-xs text-text-muted">
                    Often with: {pattern.cooccurringFiles.slice(0, 3).join(', ')}
                    {pattern.cooccurringFiles.length > 3 &&
                      ` +${pattern.cooccurringFiles.length - 3} more`}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
