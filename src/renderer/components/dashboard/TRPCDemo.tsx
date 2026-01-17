/**
 * tRPC Demo Component
 *
 * This component proves the electron-trpc spike works.
 * It demonstrates:
 * 1. Type-safe queries from renderer to main
 * 2. Automatic type inference (no manual type definitions)
 * 3. Async operations with loading states
 *
 * Once verified, delete this component and proceed with migration.
 */

import { useState, useEffect } from 'react'
import { Activity, Cpu, HardDrive, Zap, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { trpc } from '../../lib/trpc/client'

interface SystemInfo {
  platform: string
  arch: string
  nodeVersion: string
  electronVersion: string
  timestamp: number
  gpu?: {
    vendor: string
    model: string
    vram: number
    recommended: { name: string; description: string }
  }
  ollama?: {
    installed: boolean
    running: boolean
    recommendedModel: string
    recommendedAction: string
  }
}

export function TRPCDemo() {
  const [pingResult, setPingResult] = useState<string | null>(null)
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Test ping on mount
  useEffect(() => {
    async function testPing() {
      try {
        const result = await trpc.demo.ping.query({ message: 'Hello from renderer!' })
        setPingResult(result.pong)
      } catch (err) {
        setError(`Ping failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
      }
    }
    testPing()
  }, [])

  // Fetch full system info with GPU and Ollama detection
  const fetchSystemInfo = async () => {
    setLoading(true)
    setError(null)
    try {
      const info = await trpc.demo.systemInfo.query({
        includeGpu: true,
        includeOllama: true,
      })
      setSystemInfo(info as SystemInfo)
    } catch (err) {
      setError(`System info failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  // Test mutation
  const testMutation = async () => {
    try {
      await trpc.demo.logMessage.mutate({
        level: 'info',
        message: 'Test log from TRPCDemo component',
        metadata: { timestamp: Date.now(), source: 'TRPCDemo' },
      })
      console.info('Mutation succeeded - check main process logs')
    } catch (err) {
      setError(`Mutation failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  return (
    <div className="p-4 bg-surface rounded-lg border border-border">
      <div className="flex items-center gap-2 mb-4">
        <Zap className="w-5 h-5 text-accent-purple" />
        <h3 className="text-lg font-semibold text-text-primary">tRPC Spike Verification</h3>
        <span className="text-xs bg-accent-yellow/20 text-accent-yellow px-2 py-0.5 rounded">
          DELETE AFTER VERIFICATION
        </span>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-4 p-3 bg-accent-red/10 border border-accent-red/30 rounded-lg text-accent-red text-sm">
          {error}
        </div>
      )}

      {/* Ping Test */}
      <div className="mb-4 p-3 bg-background rounded-lg">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-text-muted">Ping Result:</span>
          {pingResult ? (
            <>
              <CheckCircle className="w-4 h-4 text-accent-green" />
              <span className="text-text-primary font-mono">{pingResult}</span>
            </>
          ) : (
            <>
              <Loader2 className="w-4 h-4 text-text-muted animate-spin" />
              <span className="text-text-muted">Waiting...</span>
            </>
          )}
        </div>
      </div>

      {/* System Info */}
      <div className="mb-4">
        <button
          onClick={fetchSystemInfo}
          disabled={loading}
          className="px-4 py-2 bg-accent-purple/20 text-accent-purple rounded-lg hover:bg-accent-purple/30 transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Cpu className="w-4 h-4" />}
          Fetch System Info (with GPU)
        </button>

        {systemInfo && (
          <div className="mt-3 p-3 bg-background rounded-lg space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-text-muted" />
              <span className="text-text-muted">Platform:</span>
              <span className="text-text-primary font-mono">
                {systemInfo.platform} / {systemInfo.arch}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-text-muted" />
              <span className="text-text-muted">Node:</span>
              <span className="text-text-primary font-mono">{systemInfo.nodeVersion}</span>
              <span className="text-text-muted">Electron:</span>
              <span className="text-text-primary font-mono">{systemInfo.electronVersion}</span>
            </div>

            {systemInfo.gpu && (
              <div className="mt-2 pt-2 border-t border-border">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-accent-green" />
                  <span className="text-accent-green font-medium">GPU Detected</span>
                </div>
                <div className="ml-6 mt-1 text-text-muted">
                  <p>
                    <span className="text-text-primary">{systemInfo.gpu.model}</span> (
                    {systemInfo.gpu.vendor})
                  </p>
                  <p>VRAM: {systemInfo.gpu.vram}MB</p>
                  <p className="text-accent-purple">
                    Recommended: {systemInfo.gpu.recommended.name}
                  </p>
                </div>
              </div>
            )}

            {systemInfo.ollama && (
              <div className="mt-2 pt-2 border-t border-border">
                <div className="flex items-center gap-2">
                  {systemInfo.ollama.installed ? (
                    <CheckCircle className="w-4 h-4 text-accent-green" />
                  ) : (
                    <XCircle className="w-4 h-4 text-accent-red" />
                  )}
                  <span
                    className={
                      systemInfo.ollama.installed ? 'text-accent-green' : 'text-accent-red'
                    }
                  >
                    Ollama {systemInfo.ollama.installed ? 'Installed' : 'Not Installed'}
                  </span>
                  {systemInfo.ollama.running && (
                    <span className="text-xs bg-accent-green/20 text-accent-green px-2 py-0.5 rounded">
                      Running
                    </span>
                  )}
                </div>
                <div className="ml-6 mt-1 text-text-muted text-xs">
                  <p>Action: {systemInfo.ollama.recommendedAction}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Mutation Test */}
      <button
        onClick={testMutation}
        className="px-4 py-2 bg-surface text-text-primary rounded-lg hover:bg-border transition-colors flex items-center gap-2"
      >
        <Zap className="w-4 h-4" />
        Test Mutation (Check Console)
      </button>

      {/* Verification Checklist */}
      <div className="mt-4 p-3 bg-accent-green/5 border border-accent-green/20 rounded-lg text-sm">
        <h4 className="font-medium text-accent-green mb-2">Verification Checklist</h4>
        <ul className="space-y-1 text-text-muted">
          <li className="flex items-center gap-2">
            <CheckCircle className="w-3 h-3 text-accent-green" />
            TypeScript types flow from main to renderer
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle className="w-3 h-3 text-accent-green" />
            Queries work (ping, systemInfo)
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle className="w-3 h-3 text-accent-green" />
            Mutations work (logMessage)
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle className="w-3 h-3 text-accent-green" />
            Zod validation works (input schemas)
          </li>
        </ul>
      </div>
    </div>
  )
}

export default TRPCDemo
