/**
 * Agent Details Panel Component
 * Extracted from AgentCanvas.tsx (deploy-9mtg refactor)
 */

import { Brain, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Agent } from '@/stores/agents'
import { agentIcons, statusColors, statusBgColors } from './constants'

interface AgentDetailsProps {
  agent: Agent
  onTerminate: () => void
}

export function AgentDetails({ agent, onTerminate }: AgentDetailsProps) {
  const Icon = agentIcons[agent.type] || Brain

  return (
    <div className="card p-4 space-y-4">
      <div className="flex items-center gap-3">
        <div className={cn('p-3 rounded-lg', statusBgColors[agent.status])}>
          <Icon className="w-6 h-6 text-text-primary" />
        </div>
        <div>
          <p className="font-semibold text-text-primary">{agent.name || agent.id}</p>
          <p className="text-sm text-text-muted capitalize">{agent.type}</p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-text-muted">Status</span>
          <span
            className={cn('capitalize', statusColors[agent.status].replace('border-', 'text-'))}
          >
            {agent.status}
          </span>
        </div>

        <div className="flex justify-between text-sm">
          <span className="text-text-muted">Health</span>
          <span className="text-text-primary">{(agent.health * 100).toFixed(0)}%</span>
        </div>

        <div className="flex justify-between text-sm">
          <span className="text-text-muted">Tasks</span>
          <span className="text-text-primary">{agent.taskCount}</span>
        </div>

        {agent.domain && (
          <div className="flex justify-between text-sm">
            <span className="text-text-muted">Domain</span>
            <span className="text-text-primary">{agent.domain}</span>
          </div>
        )}
      </div>

      {/* Health bar */}
      <div>
        <p className="text-xs text-text-muted mb-1">Health</p>
        <div className="h-2 bg-surface rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full transition-all',
              agent.health > 0.7
                ? 'bg-accent-green'
                : agent.health > 0.3
                  ? 'bg-accent-yellow'
                  : 'bg-accent-red'
            )}
            style={{ width: `${agent.health * 100}%` }}
          />
        </div>
      </div>

      <button
        onClick={onTerminate}
        className="w-full btn btn-secondary text-accent-red"
        disabled={agent.status === 'terminated'}
      >
        <Trash2 className="w-4 h-4 mr-2" />
        Terminate
      </button>
    </div>
  )
}
