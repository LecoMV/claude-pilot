/**
 * Ollama Services
 *
 * GPU detection and Ollama auto-setup for CLAUDE.md optimization.
 */

export {
  detectGPU,
  checkOllamaInstalled,
  checkModelAvailable,
  getAvailableModels,
  getOllamaStatus,
  performSystemCheck,
  type GPUInfo,
  type RecommendedModel,
} from './gpu-detection'
