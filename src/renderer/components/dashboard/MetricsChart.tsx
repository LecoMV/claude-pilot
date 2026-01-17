import { useEffect } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { useMetricsHistoryStore } from '@/stores/metricsHistory'
import { useSystemStore } from '@/stores/system'

const formatTime = (timestamp: number) => {
  const date = new Date(timestamp)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

const formatTooltipTime = (timestamp: number) => {
  const date = new Date(timestamp)
  return date.toLocaleTimeString()
}

interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string }>
  label?: number
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || !label) return null

  return (
    <div className="bg-surface border border-border rounded-lg p-3 shadow-lg">
      <p className="text-xs text-text-muted mb-2">{formatTooltipTime(label)}</p>
      {payload.map((entry, index) => (
        <p key={index} className="text-sm" style={{ color: entry.color }}>
          {entry.name}: {entry.value.toFixed(1)}%
        </p>
      ))}
    </div>
  )
}

export function MetricsChart() {
  const { history, addDataPoint } = useMetricsHistoryStore()
  const status = useSystemStore((state) => state.status)

  // Add new data point whenever status changes
  useEffect(() => {
    if (status?.resources) {
      const gpu = status.resources.gpu
      addDataPoint({
        cpu: status.resources.cpu,
        memory: status.resources.memory,
        diskUsed: status.resources.disk.total
          ? (status.resources.disk.used / status.resources.disk.total) * 100
          : 0,
        // Include GPU metrics if available
        ...(gpu?.available && gpu?.utilization !== undefined ? {
          gpuUtilization: gpu.utilization,
          gpuMemoryUsed: gpu.memoryUsed,
          gpuMemoryTotal: gpu.memoryTotal,
          gpuTemperature: gpu.temperature,
        } : {}),
      })
    }
  }, [status, addDataPoint])

  if (history.length < 2) {
    return (
      <div className="card p-4">
        <h3 className="text-sm font-medium text-text-primary mb-4">Resource Metrics</h3>
        <div className="h-48 flex items-center justify-center text-text-muted">
          Collecting metrics data...
        </div>
      </div>
    )
  }

  return (
    <div className="card p-4">
      <h3 className="text-sm font-medium text-text-primary mb-4">Resource Metrics (Last 5 min)</h3>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={history}
            margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
          >
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
              tickFormatter={(value) => `${value}%`}
              width={45}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }}
              iconType="circle"
              iconSize={8}
            />
            <Line
              type="monotone"
              dataKey="cpu"
              name="CPU"
              stroke="#cba6f7"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: '#cba6f7' }}
            />
            <Line
              type="monotone"
              dataKey="memory"
              name="Memory"
              stroke="#89b4fa"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: '#89b4fa' }}
            />
            <Line
              type="monotone"
              dataKey="diskUsed"
              name="Disk"
              stroke="#94e2d5"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: '#94e2d5' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
