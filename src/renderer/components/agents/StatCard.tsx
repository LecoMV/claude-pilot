/**
 * Stat Card Component for Agent Canvas
 * Extracted from AgentCanvas.tsx (deploy-9mtg refactor)
 */

import { Brain } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StatCardProps {
  icon: typeof Brain
  value: number | string
  label: string
  color: string
}

export function StatCard({ icon: Icon, value, label, color }: StatCardProps) {
  return (
    <div className="card p-3">
      <div className="flex items-center gap-3">
        <Icon className={cn('w-5 h-5', color)} />
        <div>
          <p className="text-lg font-semibold text-text-primary">{value}</p>
          <p className="text-xs text-text-muted">{label}</p>
        </div>
      </div>
    </div>
  )
}
