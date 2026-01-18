import { useEffect, useCallback } from 'react'
import {
  DollarSign,
  TrendingUp,
  AlertTriangle,
  ChevronRight,
  Wallet,
  Zap,
  Activity,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useBudgetStore, selectBudgetPercentage } from '@/stores/budget'
import { useSessionsStore } from '@/stores/sessions'
import { MODEL_CAPABILITIES } from '@shared/types'

interface CostTrackerProps {
  onNavigate?: (view: string) => void
}

export function CostTracker({ onNavigate }: CostTrackerProps) {
  const {
    budgetSettings,
    currentMonthCost,
    todayCost,
    activeSessions,
    costByModel,
    lastUpdate,
    budgetWarning,
    budgetExceeded,
    calculateCosts,
    loadBudgetSettings,
  } = useBudgetStore()

  const budgetPercentage = useBudgetStore(selectBudgetPercentage)
  const sessions = useSessionsStore((s) => s.sessions)
  const fetchSessions = useSessionsStore((s) => s.fetchSessions)

  // Initial load
  useEffect(() => {
    loadBudgetSettings()
    fetchSessions()
  }, [loadBudgetSettings, fetchSessions])

  // Recalculate costs when sessions change
  useEffect(() => {
    if (sessions.length > 0) {
      calculateCosts(sessions)
    }
  }, [sessions, calculateCosts])

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchSessions()
    }, 30000)
    return () => clearInterval(interval)
  }, [fetchSessions])

  const formatCost = useCallback((cost: number) => {
    return `$${cost.toFixed(2)}`
  }, [])

  const formatNumber = useCallback((num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
    return num.toString()
  }, [])

  const getBudgetColor = () => {
    if (budgetExceeded) return 'red'
    if (budgetWarning) return 'yellow'
    return 'green'
  }

  const budgetColor = getBudgetColor()

  return (
    <div className="space-y-4">
      {/* Main cost cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Current Month Cost - links to budget settings */}
        <CostCard
          icon={Wallet}
          label="This Month"
          value={formatCost(currentMonthCost)}
          subtext={`of ${formatCost(budgetSettings.monthlyLimit)} budget`}
          color={budgetColor}
          percentage={budgetPercentage}
          showProgress
          onClick={() => onNavigate?.('settings')}
        />

        {/* Today's Cost - links to sessions */}
        <CostCard
          icon={DollarSign}
          label="Today"
          value={formatCost(todayCost)}
          subtext={`${
            sessions.filter(
              (s) =>
                new Date(s.startTime).toISOString().split('T')[0] ===
                new Date().toISOString().split('T')[0]
            ).length
          } sessions`}
          color="blue"
          onClick={() => onNavigate?.('sessions')}
        />

        {/* Active Sessions Cost - links to context dashboard */}
        <CostCard
          icon={Activity}
          label="Active Sessions"
          value={formatCost(activeSessions.reduce((sum, s) => sum + s.cost, 0))}
          subtext={`${activeSessions.length} session${activeSessions.length !== 1 ? 's' : ''} running`}
          color="purple"
          pulse={activeSessions.length > 0}
          onClick={() => onNavigate?.('context')}
        />

        {/* Estimated Monthly - no navigation */}
        <CostCard
          icon={TrendingUp}
          label="Projected Monthly"
          value={formatCost(calculateProjectedCost(todayCost))}
          subtext="Based on today's rate"
          color="teal"
        />
      </div>

      {/* Budget warning banner - only show for API billing users */}
      {budgetSettings.alertsEnabled &&
        budgetSettings.billingType === 'api' &&
        (budgetWarning || budgetExceeded) && (
          <div
            className={cn(
              'flex items-center gap-3 p-4 rounded-lg border',
              budgetExceeded
                ? 'bg-accent-red/10 border-accent-red/30 text-accent-red'
                : 'bg-accent-yellow/10 border-accent-yellow/30 text-accent-yellow'
            )}
          >
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-medium">
                {budgetExceeded
                  ? 'Budget exceeded!'
                  : `Approaching budget limit (${budgetPercentage.toFixed(0)}%)`}
              </p>
              <p className="text-sm opacity-80">
                {budgetExceeded
                  ? `You've spent ${formatCost(currentMonthCost)} of your ${formatCost(budgetSettings.monthlyLimit)} monthly budget.`
                  : `You've used ${budgetPercentage.toFixed(0)}% of your monthly budget.`}
              </p>
            </div>
            <button
              onClick={() => onNavigate?.('settings')}
              className="text-sm underline underline-offset-2 hover:opacity-80"
            >
              Adjust budget
            </button>
          </div>
        )}

      {/* Cost by model breakdown */}
      {costByModel.length > 0 && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-text-primary">Cost by Model</h3>
            <button
              onClick={() => onNavigate?.('sessions')}
              className="text-xs text-text-muted hover:text-text-primary flex items-center gap-1"
            >
              View all sessions
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <div className="space-y-3">
            {costByModel.slice(0, 4).map((model) => {
              const caps = MODEL_CAPABILITIES[model.modelId]
              const percentage = currentMonthCost > 0 ? (model.cost / currentMonthCost) * 100 : 0

              return (
                <div key={model.modelId} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <Zap className="w-3.5 h-3.5 text-accent-purple" />
                      <span className="text-text-primary font-medium">{model.modelName}</span>
                      {caps?.recommended && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-hover text-text-muted">
                          {caps.recommended}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-text-muted text-xs">{model.sessionCount} sessions</span>
                      <span className="text-text-primary font-medium">
                        {formatCost(model.cost)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-surface-hover overflow-hidden">
                      <div
                        className="h-full rounded-full bg-accent-purple transition-all duration-500"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-text-muted w-8 text-right">
                      {percentage.toFixed(0)}%
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-[10px] text-text-muted">
                    <span>Input: {formatNumber(model.inputTokens)} tokens</span>
                    <span>Output: {formatNumber(model.outputTokens)} tokens</span>
                    {model.cachedTokens > 0 && (
                      <span>Cached: {formatNumber(model.cachedTokens)} tokens</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Active sessions detail */}
      {activeSessions.length > 0 && (
        <div className="card p-4">
          <h3 className="font-medium text-text-primary mb-3">Live Sessions</h3>
          <div className="space-y-2">
            {activeSessions.map((session) => (
              <div
                key={session.sessionId}
                className="flex items-center justify-between p-2 rounded-lg bg-surface-hover"
              >
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-green opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-accent-green"></span>
                  </span>
                  <span className="text-sm text-text-primary truncate max-w-[200px]">
                    {session.projectName}
                  </span>
                  <span className="text-xs text-text-muted">
                    ({MODEL_CAPABILITIES[session.model]?.name || session.model})
                  </span>
                </div>
                <span className="text-sm font-medium text-accent-yellow">
                  {formatCost(session.cost)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Last update indicator */}
      <div className="text-xs text-text-muted text-right">
        Last updated: {lastUpdate ? formatTimeAgo(lastUpdate) : 'Loading...'}
      </div>
    </div>
  )
}

interface CostCardProps {
  icon: typeof DollarSign
  label: string
  value: string
  subtext: string
  color: 'green' | 'yellow' | 'red' | 'blue' | 'purple' | 'teal'
  percentage?: number
  showProgress?: boolean
  pulse?: boolean
  onClick?: () => void
}

function CostCard({
  icon: Icon,
  label,
  value,
  subtext,
  color,
  percentage,
  showProgress,
  pulse,
  onClick,
}: CostCardProps) {
  const colorClasses = {
    green: {
      bg: 'bg-accent-green/10',
      text: 'text-accent-green',
      bar: 'bg-accent-green',
    },
    yellow: {
      bg: 'bg-accent-yellow/10',
      text: 'text-accent-yellow',
      bar: 'bg-accent-yellow',
    },
    red: {
      bg: 'bg-accent-red/10',
      text: 'text-accent-red',
      bar: 'bg-accent-red',
    },
    blue: {
      bg: 'bg-accent-blue/10',
      text: 'text-accent-blue',
      bar: 'bg-accent-blue',
    },
    purple: {
      bg: 'bg-accent-purple/10',
      text: 'text-accent-purple',
      bar: 'bg-accent-purple',
    },
    teal: {
      bg: 'bg-accent-teal/10',
      text: 'text-accent-teal',
      bar: 'bg-accent-teal',
    },
  }

  const colors = colorClasses[color]

  return (
    <div
      className={cn(
        'card p-4',
        onClick && 'cursor-pointer hover:border-border-hover transition-colors'
      )}
      onClick={onClick}
    >
      <div className="flex items-center gap-3 mb-3">
        <div className={cn('inline-flex p-2 rounded-lg', colors.bg, colors.text)}>
          <Icon className={cn('w-5 h-5', pulse && 'animate-pulse')} />
        </div>
        <span className="text-sm text-text-muted">{label}</span>
      </div>
      <p className="text-2xl font-semibold text-text-primary">{value}</p>
      <p className="text-xs text-text-muted mt-1">{subtext}</p>
      {showProgress && percentage !== undefined && (
        <div className="mt-3">
          <div className="w-full h-2 rounded-full bg-surface-hover overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all duration-500', colors.bar)}
              style={{ width: `${Math.min(percentage, 100)}%` }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-text-muted">0%</span>
            <span className={cn('text-[10px] font-medium', colors.text)}>
              {percentage.toFixed(0)}%
            </span>
            <span className="text-[10px] text-text-muted">100%</span>
          </div>
        </div>
      )}
    </div>
  )
}

function calculateProjectedCost(todayCost: number): number {
  const now = new Date()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()

  // Simple projection: today's cost × days in month
  // This is a rough estimate assuming consistent daily usage
  return todayCost * daysInMonth
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)

  if (seconds < 5) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}
