import { useCallback, useEffect, useState } from 'react'
import {
  Box,
  Download,
  Trash2,
  RefreshCw,
  Play,
  Square,
  HardDrive,
  Clock,
  Cpu,
  Search,
  Plus,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useOllamaStore, type OllamaModel } from '@/stores/ollama'

const POPULAR_MODELS = [
  { name: 'llama3.2:latest', desc: 'Meta Llama 3.2 (3B)', size: '2GB' },
  { name: 'llama3.2:1b', desc: 'Meta Llama 3.2 (1B)', size: '1.3GB' },
  { name: 'mistral:latest', desc: 'Mistral 7B', size: '4.1GB' },
  { name: 'mixtral:latest', desc: 'Mixtral 8x7B MoE', size: '26GB' },
  { name: 'codellama:latest', desc: 'Code Llama 7B', size: '3.8GB' },
  { name: 'deepseek-coder:latest', desc: 'DeepSeek Coder', size: '4GB' },
  { name: 'phi3:latest', desc: 'Microsoft Phi-3', size: '2.2GB' },
  { name: 'qwen2.5:latest', desc: 'Alibaba Qwen 2.5', size: '4.4GB' },
]

export function OllamaManager() {
  const {
    models,
    runningModels,
    loading,
    pulling,
    pullProgress,
    selectedModel,
    ollamaOnline,
    setModels,
    setRunningModels,
    setLoading,
    setPulling,
    setPullProgress,
    setSelectedModel,
    setOllamaOnline,
  } = useOllamaStore()

  const [filter, setFilter] = useState('')
  const [customModel, setCustomModel] = useState('')
  const [showPullModal, setShowPullModal] = useState(false)

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const [modelList, running, status] = await Promise.all([
        window.electron.invoke('ollama:list'),
        window.electron.invoke('ollama:running'),
        window.electron.invoke('ollama:status'),
      ])
      setModels(modelList)
      setRunningModels(running)
      setOllamaOnline(status.online)
    } catch (error) {
      console.error('Failed to load Ollama data:', error)
      setOllamaOnline(false)
    } finally {
      setLoading(false)
    }
  }, [setModels, setRunningModels, setLoading, setOllamaOnline])

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 15000) // Refresh every 15s
    return () => clearInterval(interval)
  }, [loadData])

  // Listen for pull progress updates
  useEffect(() => {
    const unsubscribe = window.electron.on('ollama:pullProgress', (progress: unknown) => {
      setPullProgress(progress as typeof pullProgress)
    })
    return () => unsubscribe()
  }, [setPullProgress])

  const handlePull = async (modelName: string) => {
    setPulling(modelName)
    setPullProgress({ status: 'Starting...', percent: 0 })
    setShowPullModal(false)

    try {
      await window.electron.invoke('ollama:pull', modelName)
      loadData()
    } catch (error) {
      console.error('Failed to pull model:', error)
    } finally {
      setPulling(null)
      setPullProgress(null)
    }
  }

  const handleDelete = async (modelName: string) => {
    if (!confirm(`Delete model ${modelName}?`)) return

    try {
      await window.electron.invoke('ollama:delete', modelName)
      loadData()
    } catch (error) {
      console.error('Failed to delete model:', error)
    }
  }

  const handleRun = async (modelName: string) => {
    try {
      await window.electron.invoke('ollama:run', modelName)
      loadData()
    } catch (error) {
      console.error('Failed to run model:', error)
    }
  }

  const handleStop = async (modelName: string) => {
    try {
      await window.electron.invoke('ollama:stop', modelName)
      loadData()
    } catch (error) {
      console.error('Failed to stop model:', error)
    }
  }

  const filteredModels = models.filter(
    (m) => m.name.toLowerCase().includes(filter.toLowerCase())
  )

  const totalSize = models.reduce((sum, m) => sum + m.size, 0)

  const formatSize = (bytes: number) => {
    if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
    if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`
    return `${(bytes / 1e3).toFixed(0)} KB`
  }

  if (!ollamaOnline && !loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <XCircle className="w-16 h-16 text-accent-red mb-4" />
        <h2 className="text-xl font-semibold text-text-primary mb-2">Ollama Not Running</h2>
        <p className="text-text-muted mb-4">Start the Ollama service to manage models</p>
        <button onClick={loadData} className="btn btn-primary">
          <RefreshCw className="w-4 h-4 mr-2" />
          Retry Connection
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-in">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          icon={ollamaOnline ? CheckCircle : XCircle}
          value={ollamaOnline ? 'Online' : 'Offline'}
          label="Ollama Status"
          color={ollamaOnline ? 'text-accent-green' : 'text-accent-red'}
        />
        <StatCard
          icon={Box}
          value={models.length}
          label="Models"
          color="text-accent-blue"
        />
        <StatCard
          icon={Play}
          value={runningModels.length}
          label="Running"
          color="text-accent-green"
        />
        <StatCard
          icon={HardDrive}
          value={formatSize(totalSize)}
          label="Total Size"
          color="text-accent-purple"
        />
      </div>

      {/* Pull progress */}
      {pulling && pullProgress && (
        <div className="card p-4 bg-accent-blue/10 border-accent-blue">
          <div className="flex items-center gap-4">
            <Loader className="w-5 h-5 animate-spin text-accent-blue" />
            <div className="flex-1">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-text-primary font-medium">Pulling {pulling}</span>
                <span className="text-text-muted">{pullProgress.status}</span>
              </div>
              <div className="h-2 bg-surface rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent-blue transition-all duration-300"
                  style={{ width: `${pullProgress.percent}%` }}
                />
              </div>
            </div>
            <span className="text-sm text-text-muted">{pullProgress.percent.toFixed(0)}%</span>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder="Search models..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="input pl-10 w-full"
          />
        </div>

        <div className="flex-1" />

        <button
          onClick={() => setShowPullModal(true)}
          className="btn btn-primary"
          disabled={!!pulling}
        >
          <Plus className="w-4 h-4 mr-2" />
          Pull Model
        </button>

        <button onClick={loadData} className="btn btn-secondary">
          <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
        </button>
      </div>

      {/* Models List */}
      {loading && models.length === 0 ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin w-8 h-8 border-2 border-accent-purple border-t-transparent rounded-full" />
        </div>
      ) : filteredModels.length === 0 ? (
        <div className="card p-8 text-center">
          <Box className="w-12 h-12 mx-auto text-text-muted mb-4" />
          <p className="text-text-muted">
            {models.length === 0 ? 'No models installed' : 'No models match your search'}
          </p>
          {models.length === 0 && (
            <button
              onClick={() => setShowPullModal(true)}
              className="btn btn-primary mt-4"
            >
              <Download className="w-4 h-4 mr-2" />
              Pull Your First Model
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredModels.map((model) => (
            <ModelCard
              key={model.name}
              model={model}
              isRunning={runningModels.some((r) => r.name === model.name)}
              isSelected={selectedModel?.name === model.name}
              onSelect={() => setSelectedModel(selectedModel?.name === model.name ? null : model)}
              onRun={() => handleRun(model.name)}
              onStop={() => handleStop(model.name)}
              onDelete={() => handleDelete(model.name)}
              formatSize={formatSize}
            />
          ))}
        </div>
      )}

      {/* Pull Modal */}
      {showPullModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="card p-6 w-full max-w-lg max-h-[80vh] overflow-auto">
            <h2 className="text-lg font-semibold text-text-primary mb-4">Pull Model</h2>

            {/* Custom model input */}
            <div className="mb-6">
              <label className="text-sm text-text-muted mb-2 block">Custom Model</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g., llama3.2:latest"
                  value={customModel}
                  onChange={(e) => setCustomModel(e.target.value)}
                  className="input flex-1"
                />
                <button
                  onClick={() => customModel && handlePull(customModel)}
                  disabled={!customModel}
                  className="btn btn-primary"
                >
                  <Download className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Popular models */}
            <div>
              <label className="text-sm text-text-muted mb-2 block">Popular Models</label>
              <div className="space-y-2">
                {POPULAR_MODELS.map((m) => (
                  <button
                    key={m.name}
                    onClick={() => handlePull(m.name)}
                    disabled={models.some((installed) => installed.name === m.name)}
                    className={cn(
                      'w-full flex items-center justify-between p-3 rounded-lg text-left transition-colors',
                      models.some((installed) => installed.name === m.name)
                        ? 'bg-surface text-text-muted cursor-not-allowed'
                        : 'bg-surface hover:bg-surface-hover text-text-primary'
                    )}
                  >
                    <div>
                      <p className="font-medium">{m.name}</p>
                      <p className="text-sm text-text-muted">{m.desc}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-text-muted">{m.size}</span>
                      {models.some((installed) => installed.name === m.name) ? (
                        <CheckCircle className="w-4 h-4 text-accent-green" />
                      ) : (
                        <Download className="w-4 h-4" />
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end mt-6">
              <button onClick={() => setShowPullModal(false)} className="btn btn-secondary">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

interface StatCardProps {
  icon: typeof Box
  value: number | string
  label: string
  color: string
}

function StatCard({ icon: Icon, value, label, color }: StatCardProps) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-3">
        <Icon className={cn('w-5 h-5', color)} />
        <div>
          <p className="text-xl font-semibold text-text-primary">{value}</p>
          <p className="text-sm text-text-muted">{label}</p>
        </div>
      </div>
    </div>
  )
}

interface ModelCardProps {
  model: OllamaModel
  isRunning: boolean
  isSelected: boolean
  onSelect: () => void
  onRun: () => void
  onStop: () => void
  onDelete: () => void
  formatSize: (bytes: number) => string
}

function ModelCard({
  model,
  isRunning,
  isSelected,
  onSelect,
  onRun,
  onStop,
  onDelete,
  formatSize,
}: ModelCardProps) {
  return (
    <div
      className={cn(
        'card p-4 cursor-pointer transition-all hover:border-border-hover',
        isSelected && 'border-accent-purple',
        isRunning && 'bg-accent-green/5'
      )}
      onClick={onSelect}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {isRunning ? (
            <CheckCircle className="w-5 h-5 text-accent-green" />
          ) : (
            <Box className="w-5 h-5 text-text-muted" />
          )}
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-text-primary">{model.name}</span>
              {isRunning && (
                <span className="text-xs px-1.5 py-0.5 bg-accent-green/20 text-accent-green rounded">
                  running
                </span>
              )}
            </div>
            <div className="flex items-center gap-4 text-xs text-text-muted mt-1">
              <span className="flex items-center gap-1">
                <HardDrive className="w-3 h-3" />
                {formatSize(model.size)}
              </span>
              {model.details?.family && (
                <span className="flex items-center gap-1">
                  <Cpu className="w-3 h-3" />
                  {model.details.family}
                </span>
              )}
              {model.details?.parameterSize && (
                <span>{model.details.parameterSize}</span>
              )}
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {new Date(model.modifiedAt).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {isRunning ? (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onStop()
              }}
              className="p-2 rounded text-accent-red hover:bg-accent-red/10"
              title="Stop"
            >
              <Square className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onRun()
              }}
              className="p-2 rounded text-accent-green hover:bg-accent-green/10"
              title="Run"
            >
              <Play className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
            className="p-2 rounded text-accent-red hover:bg-accent-red/10"
            title="Delete"
            disabled={isRunning}
          >
            <Trash2 className={cn('w-4 h-4', isRunning && 'opacity-50')} />
          </button>
        </div>
      </div>

      {isSelected && model.details && (
        <div className="mt-4 pt-4 border-t border-border grid grid-cols-4 gap-4 text-sm">
          {model.details.format && (
            <div>
              <p className="text-text-muted">Format</p>
              <p className="text-text-primary">{model.details.format}</p>
            </div>
          )}
          {model.details.family && (
            <div>
              <p className="text-text-muted">Family</p>
              <p className="text-text-primary">{model.details.family}</p>
            </div>
          )}
          {model.details.parameterSize && (
            <div>
              <p className="text-text-muted">Parameters</p>
              <p className="text-text-primary">{model.details.parameterSize}</p>
            </div>
          )}
          {model.details.quantizationLevel && (
            <div>
              <p className="text-text-muted">Quantization</p>
              <p className="text-text-primary">{model.details.quantizationLevel}</p>
            </div>
          )}
          <div>
            <p className="text-text-muted">Digest</p>
            <p className="text-text-primary font-mono text-xs">{model.digest.slice(0, 12)}...</p>
          </div>
        </div>
      )}
    </div>
  )
}
