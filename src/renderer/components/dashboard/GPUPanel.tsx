import { useEffect, useState } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts'
import {
  Monitor,
  Thermometer,
  Zap,
  HardDrive,
  AlertTriangle,
  TrendingUp,
  Activity,
} from 'lucide-react'
import { cn, formatBytes } from '@/lib/utils'
import { useMetricsHistoryStore } from '@/stores/metricsHistory'
import type { GPUUsage } from '@shared/types'

interface GPUPanelProps {
  gpu?: GPUUsage
}

// Temperature thresholds for color coding
const TEMP_THRESHOLDS = {
  cool: 50,    // Green below this
  warm: 70,    // Yellow below this
  hot: 85,     // Orange below this
  critical: 90 // Red at or above
}

// Utilization thresholds
const UTIL_THRESHOLDS = {
  idle: 10,
  light: 30,
  moderate: 60,
  heavy: 85
}

function getTemperatureColor(temp: number): string {
  if (temp < TEMP_THRESHOLDS.cool) return 'text-accent-green'
  if (temp < TEMP_THRESHOLDS.warm) return 'text-accent-teal'
  if (temp < TEMP_THRESHOLDS.hot) return 'text-accent-yellow'
  if (temp < TEMP_THRESHOLDS.critical) return 'text-orange-400'
  return 'text-accent-red'
}

function getTemperatureBgColor(temp: number): string {
  if (temp < TEMP_THRESHOLDS.cool) return 'bg-accent-green'
  if (temp < TEMP_THRESHOLDS.warm) return 'bg-accent-teal'
  if (temp < TEMP_THRESHOLDS.hot) return 'bg-accent-yellow'
  if (temp < TEMP_THRESHOLDS.critical) return 'bg-orange-400'
  return 'bg-accent-red'
}

function getUtilizationStatus(util: number): { label: string; color: string } {
  if (util < UTIL_THRESHOLDS.idle) return { label: 'Idle', color: 'text-text-muted' }
  if (util < UTIL_THRESHOLDS.light) return { label: 'Light', color: 'text-accent-green' }
  if (util < UTIL_THRESHOLDS.moderate) return { label: 'Moderate', color: 'text-accent-blue' }
  if (util < UTIL_THRESHOLDS.heavy) return { label: 'Heavy', color: 'text-accent-yellow' }
  return { label: 'Maximum', color: 'text-accent-red' }
}

const formatTime = (timestamp: number) => {
  const date = new Date(timestamp)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

interface TooltipProps {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string; unit?: string }>
  label?: number
}

function GPUTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload || !label) return null

  return (
    <div className="bg-surface border border-border rounded-lg p-3 shadow-lg">
      <p className="text-xs text-text-muted mb-2">
        {new Date(label).toLocaleTimeString()}
      </p>
      {payload.map((entry, index) => (
        <p key={index} className="text-sm" style={{ color: entry.color }}>
          {entry.name}: {entry.value?.toFixed(1) ?? 'N/A'}
          {entry.name === 'Temperature' ? '°C' : '%'}
        </p>
      ))}
    </div>
  )
}

export function GPUPanel({ gpu }: GPUPanelProps) {
  const { history } = useMetricsHistoryStore()

  // Filter history to only include GPU data points
  const gpuHistory = history.filter(p => p.gpuUtilization !== undefined)

  // No GPU detected
  if (!gpu || !gpu.available) {
    return (
      <div className="card p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 rounded-xl bg-surface-hover">
            <Monitor className="w-6 h-6 text-text-muted" />
          </div>
          <div>
            <h3 className="font-semibold text-text-primary">GPU Monitor</h3>
            <p className="text-sm text-text-muted">No NVIDIA GPU detected</p>
          </div>
        </div>
        <p className="text-sm text-text-muted">
          Install NVIDIA drivers and ensure nvidia-smi is available for GPU monitoring.
        </p>
      </div>
    )
  }

  // GPU detected but limited info
  if (gpu.error || gpu.utilization === undefined) {
    return (
      <div className="card p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 rounded-xl bg-accent-yellow/10">
            <Monitor className="w-6 h-6 text-accent-yellow" />
          </div>
          <div>
            <h3 className="font-semibold text-text-primary">{gpu.name || 'NVIDIA GPU'}</h3>
            <p className="text-sm text-accent-yellow flex items-center gap-1">
              <AlertTriangle className="w-4 h-4" />
              {gpu.error || 'Limited monitoring available'}
            </p>
          </div>
        </div>
        {gpu.driverVersion && (
          <p className="text-sm text-text-muted">Driver: {gpu.driverVersion}</p>
        )}
      </div>
    )
  }

  const memUsagePercent = gpu.memoryUsed && gpu.memoryTotal
    ? (gpu.memoryUsed / gpu.memoryTotal) * 100
    : 0

  const utilizationStatus = getUtilizationStatus(gpu.utilization)
  const tempColor = gpu.temperature !== undefined ? getTemperatureColor(gpu.temperature) : 'text-text-muted'

  return (
    <div className="card p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-accent-green/10">
            <Monitor className="w-6 h-6 text-accent-green" />
          </div>
          <div>
            <h3 className="font-semibold text-text-primary">
              {gpu.name?.replace('NVIDIA ', '').replace('GeForce ', '') || 'GPU'}
            </h3>
            <p className="text-sm text-text-muted">Driver {gpu.driverVersion}</p>
          </div>
        </div>
        <div className={cn('px-3 py-1 rounded-full text-sm font-medium',
          utilizationStatus.color,
          utilizationStatus.label === 'Maximum' ? 'bg-accent-red/10' :
          utilizationStatus.label === 'Heavy' ? 'bg-accent-yellow/10' :
          utilizationStatus.label === 'Moderate' ? 'bg-accent-blue/10' :
          utilizationStatus.label === 'Light' ? 'bg-accent-green/10' : 'bg-surface-hover'
        )}>
          {utilizationStatus.label} Load
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Utilization */}
        <div className="bg-surface rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4 text-accent-purple" />
            <span className="text-sm text-text-muted">Utilization</span>
          </div>
          <p className="text-2xl font-bold text-text-primary">{gpu.utilization}%</p>
          <div className="w-full h-2 rounded-full bg-surface-hover overflow-hidden mt-2">
            <div
              className="h-full rounded-full bg-accent-purple transition-all duration-300"
              style={{ width: `${gpu.utilization}%` }}
            />
          </div>
        </div>

        {/* Temperature */}
        <div className="bg-surface rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Thermometer className="w-4 h-4 text-accent-red" />
            <span className="text-sm text-text-muted">Temperature</span>
          </div>
          <p className={cn('text-2xl font-bold', tempColor)}>
            {gpu.temperature !== undefined ? `${gpu.temperature}°C` : 'N/A'}
          </p>
          {gpu.temperature !== undefined && (
            <div className="w-full h-2 rounded-full bg-surface-hover overflow-hidden mt-2">
              <div
                className={cn('h-full rounded-full transition-all duration-300', getTemperatureBgColor(gpu.temperature))}
                style={{ width: `${Math.min((gpu.temperature / 100) * 100, 100)}%` }}
              />
            </div>
          )}
          {gpu.temperature !== undefined && gpu.temperature >= TEMP_THRESHOLDS.hot && (
            <p className="text-xs text-accent-yellow mt-1 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              High temperature
            </p>
          )}
        </div>

        {/* VRAM Used */}
        <div className="bg-surface rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <HardDrive className="w-4 h-4 text-accent-blue" />
            <span className="text-sm text-text-muted">VRAM Used</span>
          </div>
          <p className="text-2xl font-bold text-text-primary">
            {formatBytes(gpu.memoryUsed || 0)}
          </p>
          <div className="w-full h-2 rounded-full bg-surface-hover overflow-hidden mt-2">
            <div
              className="h-full rounded-full bg-accent-blue transition-all duration-300"
              style={{ width: `${memUsagePercent}%` }}
            />
          </div>
          <p className="text-xs text-text-muted mt-1">
            of {formatBytes(gpu.memoryTotal || 0)}
          </p>
        </div>

        {/* VRAM % */}
        <div className="bg-surface rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-4 h-4 text-accent-teal" />
            <span className="text-sm text-text-muted">VRAM %</span>
          </div>
          <p className="text-2xl font-bold text-text-primary">
            {memUsagePercent.toFixed(1)}%
          </p>
          <p className="text-xs text-text-muted mt-2">
            {formatBytes((gpu.memoryTotal || 0) - (gpu.memoryUsed || 0))} free
          </p>
        </div>
      </div>

      {/* GPU History Chart */}
      {gpuHistory.length >= 2 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-text-muted" />
            <h4 className="text-sm font-medium text-text-primary">Performance History</h4>
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={gpuHistory} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="gpuUtilGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#cba6f7" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#cba6f7" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gpuTempGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f38ba8" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f38ba8" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#3d3d5c" />
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={formatTime}
                  stroke="#6c7086"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                  minTickGap={50}
                />
                <YAxis
                  domain={[0, 100]}
                  stroke="#6c7086"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => `${value}`}
                  width={35}
                />
                <Tooltip content={<GPUTooltip />} />
                <Area
                  type="monotone"
                  dataKey="gpuUtilization"
                  name="Utilization"
                  stroke="#cba6f7"
                  strokeWidth={2}
                  fill="url(#gpuUtilGradient)"
                />
                <Area
                  type="monotone"
                  dataKey="gpuTemperature"
                  name="Temperature"
                  stroke="#f38ba8"
                  strokeWidth={2}
                  fill="url(#gpuTempGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  )
}
