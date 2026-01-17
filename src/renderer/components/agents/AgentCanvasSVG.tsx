/**
 * Agent Canvas SVG Visualization Component
 * Extracted from AgentCanvas.tsx (deploy-9mtg refactor)
 */

import { Brain } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Agent } from '@/stores/agents'
import { agentIcons, statusBgColors } from './constants'

export interface CanvasNode {
  id: string
  type: 'agent' | 'queen' | 'swarm-center'
  x: number
  y: number
  agent?: Agent
}

export interface Connection {
  from: string
  to: string
  type: 'swarm' | 'hive'
}

interface AgentCanvasSVGProps {
  nodes: CanvasNode[]
  connections: Connection[]
  selectedAgentId?: string | null
  onSelectAgent: (agent: Agent | null) => void
}

export function AgentCanvasSVG({
  nodes,
  connections,
  selectedAgentId,
  onSelectAgent,
}: AgentCanvasSVGProps) {
  return (
    <svg className="w-full h-full">
      {/* Connection lines */}
      {connections.map((conn, i) => {
        const from = nodes.find((n) => n.id === conn.from)
        const to = nodes.find((n) => n.id === conn.to)
        if (!from || !to) return null

        return (
          <line
            key={i}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            stroke={conn.type === 'hive' ? '#cba6f7' : '#89b4fa'}
            strokeWidth={2}
            strokeDasharray={conn.type === 'swarm' ? '5,5' : undefined}
            opacity={0.5}
          />
        )
      })}

      {/* Swarm center */}
      {nodes
        .filter((n) => n.type === 'swarm-center')
        .map((node) => (
          <g key={node.id} transform={`translate(${node.x}, ${node.y})`}>
            <circle r={30} fill="#89b4fa" opacity={0.2} />
            <circle r={20} fill="#89b4fa" opacity={0.4} />
            <circle r={10} fill="#89b4fa" />
          </g>
        ))}

      {/* Agent nodes */}
      {nodes
        .filter((n) => n.type === 'agent' || n.type === 'queen')
        .map((node) => {
          const agent = node.agent
          if (!agent) return null

          const Icon = agentIcons[agent.type] || Brain
          const isQueen = node.type === 'queen'
          const isSelected = selectedAgentId === agent.id

          return (
            <g
              key={node.id}
              transform={`translate(${node.x}, ${node.y})`}
              className="cursor-pointer"
              onClick={() => onSelectAgent(isSelected ? null : agent)}
            >
              {/* Selection ring */}
              {isSelected && (
                <circle r={45} fill="none" stroke="#cba6f7" strokeWidth={2} strokeDasharray="5,5" />
              )}

              {/* Queen crown */}
              {isQueen && <circle r={38} fill="#cba6f7" opacity={0.3} />}

              {/* Agent circle */}
              <circle
                r={30}
                className={cn('transition-colors', statusBgColors[agent.status])}
                fill="currentColor"
                stroke={
                  agent.status === 'active'
                    ? '#a6e3a1'
                    : agent.status === 'busy'
                      ? '#f9e2af'
                      : agent.status === 'error'
                        ? '#f38ba8'
                        : '#6c7086'
                }
                strokeWidth={3}
              />

              {/* Agent icon - rendered as foreignObject */}
              <foreignObject x={-12} y={-12} width={24} height={24}>
                <div className="w-full h-full flex items-center justify-center text-text-primary">
                  {isQueen ? '👑' : <Icon className="w-5 h-5" />}
                </div>
              </foreignObject>

              {/* Agent name */}
              <text y={45} textAnchor="middle" className="fill-text-primary text-xs font-medium">
                {agent.name || agent.id.slice(0, 8)}
              </text>

              {/* Status indicator */}
              {agent.status === 'busy' && (
                <circle cx={22} cy={-22} r={6} fill="#f9e2af" className="animate-pulse" />
              )}
              {agent.status === 'error' && <circle cx={22} cy={-22} r={6} fill="#f38ba8" />}
            </g>
          )
        })}
    </svg>
  )
}
