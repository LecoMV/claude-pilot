/**
 * GPU Detection Service for Ollama Auto-Setup
 *
 * Detects GPU capabilities and recommends optimal Ollama models.
 * Supports NVIDIA, AMD, and Intel integrated graphics.
 *
 * @module GPUDetection
 */

import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export interface GPUInfo {
  vendor: 'nvidia' | 'amd' | 'intel' | 'apple' | 'none'
  model: string
  vram: number // In MB
  type: 'discrete' | 'integrated'
  cudaVersion?: string
  rocmVersion?: string
  recommended: RecommendedModel
}

export interface RecommendedModel {
  name: string
  size: string
  description: string
  minVram: number
}

// Model recommendations based on VRAM availability
const MODEL_TIERS: RecommendedModel[] = [
  {
    name: 'qwen2.5:32b-instruct',
    size: '32B',
    description: 'Full quality CLAUDE.md generation',
    minVram: 24000,
  },
  {
    name: 'qwen2.5:14b-instruct',
    size: '14B',
    description: 'High quality optimization',
    minVram: 12000,
  },
  {
    name: 'qwen2.5:7b-instruct',
    size: '7B',
    description: 'Good quality suggestions',
    minVram: 8000,
  },
  {
    name: 'phi3:mini',
    size: '3.8B',
    description: 'Lightweight assistance',
    minVram: 4000,
  },
  {
    name: 'tinyllama',
    size: '1.1B',
    description: 'Minimal enhancements',
    minVram: 2000,
  },
]

// CPU-only fallback
const CPU_ONLY_MODEL: RecommendedModel = {
  name: 'tinyllama',
  size: '1.1B',
  description: 'CPU-only mode (slower)',
  minVram: 0,
}

/**
 * Select the best model based on available VRAM
 */
function selectModel(vramMB: number): RecommendedModel {
  for (const tier of MODEL_TIERS) {
    if (vramMB >= tier.minVram) {
      return tier
    }
  }
  return CPU_ONLY_MODEL
}

/**
 * Parse NVIDIA GPU information from nvidia-smi output
 */
function parseNvidiaOutput(output: string): { model: string; vram: number } {
  const lines = output.trim().split('\n')
  if (lines.length === 0) {
    return { model: 'Unknown NVIDIA GPU', vram: 0 }
  }

  const [name, memory] = lines[0].split(',').map((s) => s.trim())
  const vramMatch = memory?.match(/(\d+)\s*MiB/)
  const vram = vramMatch ? parseInt(vramMatch[1], 10) : 0

  return { model: name || 'Unknown NVIDIA GPU', vram }
}

/**
 * Parse AMD GPU information from rocm-smi output
 */
function parseAMDOutput(output: string): { model: string; vram: number } {
  const modelMatch = output.match(/Card series:\s*(.+)/i)
  const vramMatch = output.match(/VRAM Total Memory \(B\):\s*(\d+)/i)

  const model = modelMatch ? modelMatch[1].trim() : 'Unknown AMD GPU'
  const vramBytes = vramMatch ? parseInt(vramMatch[1], 10) : 0
  const vram = Math.round(vramBytes / (1024 * 1024)) // Convert to MB

  return { model, vram }
}

/**
 * Parse Intel GPU information from lspci output
 */
function parseIntelOutput(output: string): { model: string; vram: number } {
  const match = output.match(/Intel[^:]*:\s*(.+)/i)
  const model = match ? match[1].trim() : 'Intel Integrated Graphics'

  // Intel iGPU typically shares system RAM, estimate based on common configs
  // This is a rough estimate; actual available VRAM varies by system
  return { model, vram: 2000 } // Assume ~2GB for integrated graphics
}

/**
 * Parse Apple Silicon GPU information from system_profiler output
 */
function parseAppleSiliconOutput(output: string): { model: string; vram: number } {
  const chipMatch = output.match(/Chip Model:\s*(.+)/i)
  const model = chipMatch ? chipMatch[1].trim() : 'Apple Silicon'

  // Apple Silicon uses unified memory, estimate based on chip type
  let vram = 8000 // Base assumption

  if (model.includes('M1')) vram = 8000
  else if (model.includes('M2')) vram = 16000
  else if (model.includes('M3')) vram = 18000
  else if (model.includes('M4')) vram = 24000
  else if (model.includes('Pro')) vram = 16000
  else if (model.includes('Max')) vram = 32000
  else if (model.includes('Ultra')) vram = 64000

  return { model, vram }
}

/**
 * Detect GPU capabilities on the system
 */
export async function detectGPU(): Promise<GPUInfo> {
  // Try NVIDIA first (most common for ML workloads)
  try {
    const { stdout: nvidiaSmi } = await execAsync(
      'nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits'
    )
    if (nvidiaSmi.trim()) {
      const { model, vram } = parseNvidiaOutput(nvidiaSmi)

      // Get CUDA version
      let cudaVersion: string | undefined
      try {
        const { stdout: nvccOut } = await execAsync('nvcc --version')
        const versionMatch = nvccOut.match(/release (\d+\.\d+)/)
        cudaVersion = versionMatch ? versionMatch[1] : undefined
      } catch {
        // nvcc not installed, try alternative
        try {
          const { stdout: nvSmiVersion } = await execAsync(
            'nvidia-smi --query-gpu=driver_version --format=csv,noheader'
          )
          cudaVersion = `driver ${nvSmiVersion.trim()}`
        } catch {
          // Ignore
        }
      }

      return {
        vendor: 'nvidia',
        model,
        vram,
        type: 'discrete',
        cudaVersion,
        recommended: selectModel(vram),
      }
    }
  } catch {
    // NVIDIA not available
  }

  // Try AMD with ROCm
  try {
    const { stdout: rocmSmi } = await execAsync('rocm-smi --showproductname --showmeminfo vram')
    if (rocmSmi.trim()) {
      const { model, vram } = parseAMDOutput(rocmSmi)

      // Get ROCm version
      let rocmVersion: string | undefined
      try {
        const { stdout: rocmVer } = await execAsync('cat /opt/rocm/.info/version')
        rocmVersion = rocmVer.trim()
      } catch {
        // Ignore
      }

      return {
        vendor: 'amd',
        model,
        vram,
        type: 'discrete',
        rocmVersion,
        recommended: selectModel(vram),
      }
    }
  } catch {
    // AMD/ROCm not available
  }

  // Try Apple Silicon
  try {
    const { stdout: systemProfiler } = await execAsync('system_profiler SPDisplaysDataType')
    if (systemProfiler.includes('Apple')) {
      const { model, vram } = parseAppleSiliconOutput(systemProfiler)
      return {
        vendor: 'apple',
        model,
        vram,
        type: 'integrated', // Unified memory architecture
        recommended: selectModel(vram),
      }
    }
  } catch {
    // macOS system_profiler not available
  }

  // Try Intel integrated graphics
  try {
    const { stdout: lspci } = await execAsync('lspci | grep -i vga')
    if (lspci.toLowerCase().includes('intel')) {
      const { model, vram } = parseIntelOutput(lspci)
      return {
        vendor: 'intel',
        model,
        vram,
        type: 'integrated',
        recommended: selectModel(vram),
      }
    }
  } catch {
    // lspci not available or no Intel GPU
  }

  // No GPU detected - CPU only
  return {
    vendor: 'none',
    model: 'CPU Only',
    vram: 0,
    type: 'integrated',
    recommended: CPU_ONLY_MODEL,
  }
}

/**
 * Check if Ollama is installed and get version
 */
export async function checkOllamaInstalled(): Promise<{
  installed: boolean
  version?: string
  path?: string
}> {
  try {
    const { stdout } = await execAsync('ollama --version')
    const versionMatch = stdout.match(/ollama version (\d+\.\d+\.\d+)/i)

    // Also find the path
    let path: string | undefined
    try {
      const { stdout: whichOut } = await execAsync('which ollama')
      path = whichOut.trim()
    } catch {
      // Ignore
    }

    return {
      installed: true,
      version: versionMatch ? versionMatch[1] : 'unknown',
      path,
    }
  } catch {
    return { installed: false }
  }
}

/**
 * Check if a specific Ollama model is available
 */
export async function checkModelAvailable(modelName: string): Promise<boolean> {
  try {
    const { stdout } = await execAsync('ollama list')
    return stdout.toLowerCase().includes(modelName.toLowerCase().split(':')[0])
  } catch {
    return false
  }
}

/**
 * Get list of available Ollama models
 */
export async function getAvailableModels(): Promise<string[]> {
  try {
    const { stdout } = await execAsync('ollama list')
    const lines = stdout.trim().split('\n').slice(1) // Skip header
    return lines
      .map((line) => {
        const parts = line.split(/\s+/)
        return parts[0] // Model name is first column
      })
      .filter(Boolean)
  } catch {
    return []
  }
}

/**
 * Pull an Ollama model (returns command to run, doesn't execute directly)
 */
export function getPullCommand(modelName: string): string {
  return `ollama pull ${modelName}`
}

/**
 * Get Ollama service status
 */
export async function getOllamaStatus(): Promise<{
  running: boolean
  endpoint?: string
  error?: string
}> {
  try {
    const response = await fetch('http://localhost:11434/api/version')
    if (response.ok) {
      return {
        running: true,
        endpoint: 'http://localhost:11434',
      }
    }
    return { running: false, error: `HTTP ${response.status}` }
  } catch (error) {
    return {
      running: false,
      error: error instanceof Error ? error.message : 'Connection failed',
    }
  }
}

/**
 * Full system check for Ollama setup
 */
export async function performSystemCheck(): Promise<{
  gpu: GPUInfo
  ollama: { installed: boolean; version?: string; running: boolean; endpoint?: string }
  availableModels: string[]
  recommendedAction: 'ready' | 'install_ollama' | 'pull_model' | 'start_service'
  actionCommand?: string
}> {
  const [gpu, ollamaCheck, ollamaStatus, models] = await Promise.all([
    detectGPU(),
    checkOllamaInstalled(),
    getOllamaStatus(),
    getAvailableModels(),
  ])

  const ollama = {
    ...ollamaCheck,
    ...ollamaStatus,
  }

  // Determine recommended action
  let recommendedAction: 'ready' | 'install_ollama' | 'pull_model' | 'start_service'
  let actionCommand: string | undefined

  if (!ollama.installed) {
    recommendedAction = 'install_ollama'
    actionCommand = 'curl -fsSL https://ollama.com/install.sh | sh'
  } else if (!ollama.running) {
    recommendedAction = 'start_service'
    actionCommand = 'ollama serve'
  } else if (!models.includes(gpu.recommended.name.split(':')[0])) {
    recommendedAction = 'pull_model'
    actionCommand = getPullCommand(gpu.recommended.name)
  } else {
    recommendedAction = 'ready'
  }

  return {
    gpu,
    ollama,
    availableModels: models,
    recommendedAction,
    actionCommand,
  }
}

export default {
  detectGPU,
  checkOllamaInstalled,
  checkModelAvailable,
  getAvailableModels,
  getOllamaStatus,
  performSystemCheck,
}
