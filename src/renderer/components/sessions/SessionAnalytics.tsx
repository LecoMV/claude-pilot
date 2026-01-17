/**
 * Session Analytics Component
 * Provides insights into Claude Code usage patterns
 */

import { useState, useEffect, useMemo } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts'
import {
  TrendingUp,
  Clock,
  MessageSquare,
  Zap,
  DollarSign,
  Calendar,
  Activity,
  BarChart3,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSessionsStore } from '@/stores/sessions'
import type { ExternalSession } from '@shared/types'
import { calculateSessionCost } from '@shared/types'

// Color palette for charts
const COLORS = {
  purple: '#cba6f7',
  blue: '#89b4fa',
  green: '#a6e3a1',
  yellow: '#f9e2af',
  red: '#f38ba8',
  teal: '#94e2d5',
}

interface AnalyticsData {
  totalSessions: number
  totalMessages: number
  totalToolCalls: number
  totalInputTokens: number
  totalOutputTokens: number
  totalCachedTokens: number
  estimatedCost: number
  avgSessionDuration: number
  avgMessagesPerSession: number
  sessionsByDay: Array<{ date: string; count: number }>
  sessionsByModel: Array<{ model: string; count: number; tokens: number }>
  topProjects: Array<{ name: string; sessions: number; messages: number }>
  hourlyActivity: Array<{ hour: number; count: number }>
}

function calculateAnalytics(sessions: ExternalSession[]): AnalyticsData {
  const now = Date.now()
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000

  // Filter to last 30 days
  const recentSessions = sessions.filter(s => s.startTime > thirtyDaysAgo)

  // Basic totals
  let totalMessages = 0
  let totalToolCalls = 0
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let totalCachedTokens = 0
  let estimatedCost = 0
  let totalDuration = 0

  // Group by day
  const byDay = new Map<string, number>()
  // Group by model
  const byModel = new Map<string, { count: number; tokens: number }>()
  // Group by project
  const byProject = new Map<string, { sessions: number; messages: number }>()
  // Hourly activity
  const byHour = new Array(24).fill(0)

  for (const session of recentSessions) {
    const stats = session.stats

    totalMessages += stats.messageCount
    totalToolCalls += stats.toolCalls
    totalInputTokens += stats.inputTokens
    totalOutputTokens += stats.outputTokens
    totalCachedTokens += stats.cachedTokens

    // Calculate cost
    if (session.model) {
      const cost = calculateSessionCost(
        stats.inputTokens,
        stats.outputTokens,
        stats.cachedTokens,
        session.model
      )
      estimatedCost += cost
    }

    // Duration
    const duration = (session.lastActivity || now) - session.startTime
    totalDuration += duration

    // By day
    const day = new Date(session.startTime).toISOString().split('T')[0]
    byDay.set(day, (byDay.get(day) || 0) + 1)

    // By model
    const model = session.model || 'unknown'
    const modelData = byModel.get(model) || { count: 0, tokens: 0 }
    modelData.count++
    modelData.tokens += stats.inputTokens + stats.outputTokens
    byModel.set(model, modelData)

    // By project
    const project = session.projectName
    const projectData = byProject.get(project) || { sessions: 0, messages: 0 }
    projectData.sessions++
    projectData.messages += stats.messageCount
    byProject.set(project, projectData)

    // By hour
    const hour = new Date(session.startTime).getHours()
    byHour[hour]++
  }

  // Format day data
  const sessionsByDay: AnalyticsData['sessionsByDay'] = []
  const sortedDays = Array.from(byDay.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  for (const [date, count] of sortedDays.slice(-14)) { // Last 14 days
    sessionsByDay.push({ date: date.slice(5), count }) // MM-DD format
  }

  // Format model data
  const sessionsByModel = Array.from(byModel.entries())
    .map(([model, data]) => ({
      model: model.replace('claude-', '').replace(/-\d+$/, ''),
      count: data.count,
      tokens: data.tokens,
    }))
    .sort((a, b) => b.count - a.count)

  // Format project data
  const topProjects = Array.from(byProject.entries())
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 5)

  // Format hourly data
  const hourlyActivity = byHour.map((count, hour) => ({ hour, count }))

  return {
    totalSessions: recentSessions.length,
    totalMessages,
    totalToolCalls,
    totalInputTokens,
    totalOutputTokens,
    totalCachedTokens,
    estimatedCost,
    avgSessionDuration: recentSessions.length > 0 ? totalDuration / recentSessions.length : 0,
    avgMessagesPerSession: recentSessions.length > 0 ? totalMessages / recentSessions.length : 0,
    sessionsByDay,
    sessionsByModel,
    topProjects,
    hourlyActivity,
  }
}

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000)
  const hours = Math.floor(minutes / 60)
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`
  }
  return `${minutes}m`
}

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return n.toFixed(0)
}

export function SessionAnalytics() {
  const { sessions, loading, discoverSessions } = useSessionsStore()
  const [timeRange, setTimeRange] = useState<'7d' | '14d' | '30d'>('30d')

  useEffect(() => {
    discoverSessions()
  }, [discoverSessions])

  const analytics = useMemo(() => calculateAnalytics(sessions), [sessions])

  if (loading && sessions.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-accent-purple" />
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Session Analytics</h2>
          <p className="text-sm text-text-muted">Last 30 days of Claude Code usage</p>
        </div>
        <div className="flex items-center gap-2">
          {(['7d', '14d', '30d'] as const).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={cn(
                'px-3 py-1.5 text-sm rounded-lg transition-colors',
                timeRange === range
                  ? 'bg-accent-purple text-white'
                  : 'text-text-muted hover:bg-surface-hover'
              )}
            >
              {range}
            </button>
          ))}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={MessageSquare}
          label="Total Sessions"
          value={analytics.totalSessions.toString()}
          color="purple"
        />
        <StatCard
          icon={Activity}
          label="Total Messages"
          value={formatNumber(analytics.totalMessages)}
          color="blue"
        />
        <StatCard
          icon={Zap}
          label="Tool Calls"
          value={formatNumber(analytics.totalToolCalls)}
          color="green"
        />
        <StatCard
          icon={DollarSign}
          label="Est. Cost"
          value={`$${analytics.estimatedCost.toFixed(2)}`}
          color="yellow"
        />
      </div>

      {/* Token Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card p-4">
          <p className="text-sm text-text-muted mb-1">Input Tokens</p>
          <p className="text-xl font-semibold text-text-primary">
            {formatNumber(analytics.totalInputTokens)}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-text-muted mb-1">Output Tokens</p>
          <p className="text-xl font-semibold text-text-primary">
            {formatNumber(analytics.totalOutputTokens)}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-text-muted mb-1">Cached Tokens</p>
          <p className="text-xl font-semibold text-accent-green">
            {formatNumber(analytics.totalCachedTokens)}
          </p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sessions by Day */}
        <div className="card p-4">
          <h3 className="text-sm font-medium text-text-primary mb-4 flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Daily Sessions
          </h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={analytics.sessionsByDay}>
                <defs>
                  <linearGradient id="sessionGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.purple} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={COLORS.purple} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#3d3d5c" />
                <XAxis dataKey="date" stroke="#6c7086" fontSize={11} />
                <YAxis stroke="#6c7086" fontSize={11} />
                <Tooltip
                  contentStyle={{ background: '#2a2a3d', border: '1px solid #3d3d5c', borderRadius: '8px' }}
                  labelStyle={{ color: '#cdd6f4' }}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke={COLORS.purple}
                  strokeWidth={2}
                  fill="url(#sessionGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Hourly Activity */}
        <div className="card p-4">
          <h3 className="text-sm font-medium text-text-primary mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Hourly Activity
          </h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.hourlyActivity}>
                <CartesianGrid strokeDasharray="3 3" stroke="#3d3d5c" />
                <XAxis
                  dataKey="hour"
                  stroke="#6c7086"
                  fontSize={11}
                  tickFormatter={(h) => `${h}:00`}
                />
                <YAxis stroke="#6c7086" fontSize={11} />
                <Tooltip
                  contentStyle={{ background: '#2a2a3d', border: '1px solid #3d3d5c', borderRadius: '8px' }}
                  labelFormatter={(h) => `${h}:00 - ${h}:59`}
                />
                <Bar dataKey="count" fill={COLORS.blue} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Model Distribution & Top Projects */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Model Distribution */}
        <div className="card p-4">
          <h3 className="text-sm font-medium text-text-primary mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Sessions by Model
          </h3>
          <div className="space-y-3">
            {analytics.sessionsByModel.slice(0, 5).map((item, i) => {
              const colors = [COLORS.purple, COLORS.blue, COLORS.green, COLORS.yellow, COLORS.teal]
              const maxCount = Math.max(...analytics.sessionsByModel.map(m => m.count))
              const percent = (item.count / maxCount) * 100

              return (
                <div key={item.model}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-text-primary">{item.model}</span>
                    <span className="text-text-muted">{item.count} sessions</span>
                  </div>
                  <div className="h-2 bg-surface-hover rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${percent}%`, backgroundColor: colors[i % colors.length] }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Top Projects */}
        <div className="card p-4">
          <h3 className="text-sm font-medium text-text-primary mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Top Projects
          </h3>
          <div className="space-y-3">
            {analytics.topProjects.map((project, i) => (
              <div key={project.name} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 flex items-center justify-center rounded bg-surface-hover text-xs text-text-muted">
                    {i + 1}
                  </span>
                  <span className="text-sm text-text-primary truncate max-w-[200px]">
                    {project.name}
                  </span>
                </div>
                <div className="text-right">
                  <p className="text-sm text-text-primary">{project.sessions} sessions</p>
                  <p className="text-xs text-text-muted">{project.messages} messages</p>
                </div>
              </div>
            ))}
            {analytics.topProjects.length === 0 && (
              <p className="text-sm text-text-muted text-center py-4">No session data yet</p>
            )}
          </div>
        </div>
      </div>

      {/* Averages */}
      <div className="grid grid-cols-2 gap-4">
        <div className="card p-4">
          <p className="text-sm text-text-muted mb-1">Avg. Session Duration</p>
          <p className="text-xl font-semibold text-text-primary">
            {formatDuration(analytics.avgSessionDuration)}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-text-muted mb-1">Avg. Messages/Session</p>
          <p className="text-xl font-semibold text-text-primary">
            {analytics.avgMessagesPerSession.toFixed(1)}
          </p>
        </div>
      </div>
    </div>
  )
}

interface StatCardProps {
  icon: typeof Activity
  label: string
  value: string
  color: 'purple' | 'blue' | 'green' | 'yellow' | 'red' | 'teal'
}

function StatCard({ icon: Icon, label, value, color }: StatCardProps) {
  const colorClasses = {
    purple: 'bg-accent-purple/10 text-accent-purple',
    blue: 'bg-accent-blue/10 text-accent-blue',
    green: 'bg-accent-green/10 text-accent-green',
    yellow: 'bg-accent-yellow/10 text-accent-yellow',
    red: 'bg-accent-red/10 text-accent-red',
    teal: 'bg-accent-teal/10 text-accent-teal',
  }

  return (
    <div className="card p-4">
      <div className="flex items-center gap-3 mb-2">
        <div className={cn('p-2 rounded-lg', colorClasses[color])}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <p className="text-2xl font-bold text-text-primary">{value}</p>
      <p className="text-sm text-text-muted">{label}</p>
    </div>
  )
}
