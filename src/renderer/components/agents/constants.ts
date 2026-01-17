/**
 * Agent Canvas Constants and Configuration
 * Extracted from AgentCanvas.tsx (deploy-9mtg refactor)
 */

import {
  Brain,
  Code,
  Search,
  TestTube,
  Building,
  Users,
  Shield,
  LayoutGrid,
  GitBranch,
  Target,
  Zap,
} from 'lucide-react'
import type { AgentType, AgentStatus } from '@/stores/agents'

export type SwarmTopology = 'mesh' | 'hierarchical' | 'ring' | 'star'

export interface AgentTemplate {
  name: string
  description: string
  agents: { type: AgentType; name: string }[]
  topology: SwarmTopology
}

export const topologyOptions: {
  value: SwarmTopology
  label: string
  description: string
  icon: typeof LayoutGrid
}[] = [
  {
    value: 'mesh',
    label: 'Mesh',
    description: 'All agents connected to each other',
    icon: LayoutGrid,
  },
  {
    value: 'hierarchical',
    label: 'Hierarchical',
    description: 'Tree structure with coordinators',
    icon: GitBranch,
  },
  { value: 'ring', label: 'Ring', description: 'Sequential message passing', icon: Target },
  { value: 'star', label: 'Star', description: 'Central coordinator hub', icon: Zap },
]

export const agentTemplates: AgentTemplate[] = [
  {
    name: 'Development Team',
    description: 'Full-stack dev squad with testing',
    agents: [
      { type: 'architect', name: 'sys-architect' },
      { type: 'coder', name: 'frontend-dev' },
      { type: 'coder', name: 'backend-dev' },
      { type: 'tester', name: 'qa-engineer' },
    ],
    topology: 'hierarchical',
  },
  {
    name: 'Research Squad',
    description: 'Deep research and analysis team',
    agents: [
      { type: 'researcher', name: 'lead-researcher' },
      { type: 'researcher', name: 'data-analyst' },
      { type: 'coordinator', name: 'research-coordinator' },
    ],
    topology: 'star',
  },
  {
    name: 'Security Audit',
    description: 'Security-focused review team',
    agents: [
      { type: 'security', name: 'security-lead' },
      { type: 'security', name: 'vuln-scanner' },
      { type: 'coder', name: 'patch-developer' },
      { type: 'tester', name: 'pentest-validator' },
    ],
    topology: 'mesh',
  },
  {
    name: 'Code Review',
    description: 'Pair programming and review',
    agents: [
      { type: 'coder', name: 'reviewer-1' },
      { type: 'coder', name: 'reviewer-2' },
    ],
    topology: 'ring',
  },
]

export const agentIcons: Record<AgentType, typeof Brain> = {
  coder: Code,
  researcher: Search,
  tester: TestTube,
  architect: Building,
  coordinator: Users,
  security: Shield,
}

export const statusColors: Record<AgentStatus, string> = {
  idle: 'border-text-muted',
  active: 'border-accent-green',
  busy: 'border-accent-yellow',
  error: 'border-accent-red',
  terminated: 'border-text-muted opacity-50',
}

export const statusBgColors: Record<AgentStatus, string> = {
  idle: 'bg-surface',
  active: 'bg-accent-green/10',
  busy: 'bg-accent-yellow/10',
  error: 'bg-accent-red/10',
  terminated: 'bg-surface opacity-50',
}
