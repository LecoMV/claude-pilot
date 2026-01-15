import { describe, it, expect, beforeEach } from 'vitest'
import { useOllamaStore } from '@/stores/ollama'

describe('Ollama Store', () => {
  const mockModel = {
    name: 'llama3:latest',
    size: 4500000000,
    digest: 'sha256:abc123',
    modifiedAt: '2024-01-01T00:00:00Z',
    details: {
      format: 'gguf',
      family: 'llama',
      parameterSize: '7B',
      quantizationLevel: 'Q4_K_M',
    },
  }

  const mockRunningModel = {
    name: 'llama3:latest',
    model: 'llama3:latest',
    size: 4500000000,
    digest: 'sha256:abc123',
    expiresAt: '2024-01-01T01:00:00Z',
  }

  beforeEach(() => {
    // Reset the store
    useOllamaStore.setState({
      models: [],
      runningModels: [],
      loading: false,
      pulling: null,
      pullProgress: null,
      selectedModel: null,
      ollamaOnline: false,
    })
  })

  describe('setModels', () => {
    it('should set models array', () => {
      useOllamaStore.getState().setModels([mockModel])
      expect(useOllamaStore.getState().models).toEqual([mockModel])
    })

    it('should handle multiple models', () => {
      const models = [
        mockModel,
        { ...mockModel, name: 'codellama:latest', size: 3800000000 },
      ]
      useOllamaStore.getState().setModels(models)
      expect(useOllamaStore.getState().models).toHaveLength(2)
    })
  })

  describe('setRunningModels', () => {
    it('should set running models array', () => {
      useOllamaStore.getState().setRunningModels([mockRunningModel])
      expect(useOllamaStore.getState().runningModels).toEqual([mockRunningModel])
    })
  })

  describe('setLoading', () => {
    it('should set loading state', () => {
      useOllamaStore.getState().setLoading(true)
      expect(useOllamaStore.getState().loading).toBe(true)
    })
  })

  describe('setPulling', () => {
    it('should set pulling model name', () => {
      useOllamaStore.getState().setPulling('llama3:latest')
      expect(useOllamaStore.getState().pulling).toBe('llama3:latest')
    })

    it('should clear pulling when set to null', () => {
      useOllamaStore.getState().setPulling('llama3:latest')
      useOllamaStore.getState().setPulling(null)
      expect(useOllamaStore.getState().pulling).toBeNull()
    })
  })

  describe('setPullProgress', () => {
    it('should set pull progress', () => {
      const progress = {
        status: 'downloading',
        digest: 'sha256:abc123',
        total: 4500000000,
        completed: 1000000000,
        percent: 22,
      }
      useOllamaStore.getState().setPullProgress(progress)
      expect(useOllamaStore.getState().pullProgress).toEqual(progress)
    })

    it('should clear pull progress when set to null', () => {
      useOllamaStore.getState().setPullProgress({
        status: 'downloading',
        percent: 50,
      })
      useOllamaStore.getState().setPullProgress(null)
      expect(useOllamaStore.getState().pullProgress).toBeNull()
    })
  })

  describe('setSelectedModel', () => {
    it('should set selected model', () => {
      useOllamaStore.getState().setSelectedModel(mockModel)
      expect(useOllamaStore.getState().selectedModel).toEqual(mockModel)
    })

    it('should clear selected model when set to null', () => {
      useOllamaStore.getState().setSelectedModel(mockModel)
      useOllamaStore.getState().setSelectedModel(null)
      expect(useOllamaStore.getState().selectedModel).toBeNull()
    })
  })

  describe('setOllamaOnline', () => {
    it('should set ollama online state', () => {
      useOllamaStore.getState().setOllamaOnline(true)
      expect(useOllamaStore.getState().ollamaOnline).toBe(true)
    })

    it('should set ollama offline state', () => {
      useOllamaStore.getState().setOllamaOnline(true)
      useOllamaStore.getState().setOllamaOnline(false)
      expect(useOllamaStore.getState().ollamaOnline).toBe(false)
    })
  })

  describe('initial state', () => {
    it('should have correct default values', () => {
      const state = useOllamaStore.getState()
      expect(state.models).toEqual([])
      expect(state.runningModels).toEqual([])
      expect(state.loading).toBe(false)
      expect(state.pulling).toBeNull()
      expect(state.pullProgress).toBeNull()
      expect(state.selectedModel).toBeNull()
      expect(state.ollamaOnline).toBe(false)
    })
  })
})
