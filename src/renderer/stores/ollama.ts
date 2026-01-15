import { create } from 'zustand'

export interface OllamaModel {
  name: string
  size: number
  digest: string
  modifiedAt: string
  details?: {
    format?: string
    family?: string
    parameterSize?: string
    quantizationLevel?: string
  }
}

export interface OllamaRunningModel {
  name: string
  model: string
  size: number
  digest: string
  expiresAt: string
}

export interface PullProgress {
  status: string
  digest?: string
  total?: number
  completed?: number
  percent: number
}

interface OllamaState {
  models: OllamaModel[]
  runningModels: OllamaRunningModel[]
  loading: boolean
  pulling: string | null
  pullProgress: PullProgress | null
  selectedModel: OllamaModel | null
  ollamaOnline: boolean

  setModels: (models: OllamaModel[]) => void
  setRunningModels: (models: OllamaRunningModel[]) => void
  setLoading: (loading: boolean) => void
  setPulling: (model: string | null) => void
  setPullProgress: (progress: PullProgress | null) => void
  setSelectedModel: (model: OllamaModel | null) => void
  setOllamaOnline: (online: boolean) => void
}

export const useOllamaStore = create<OllamaState>((set) => ({
  models: [],
  runningModels: [],
  loading: false,
  pulling: null,
  pullProgress: null,
  selectedModel: null,
  ollamaOnline: false,

  setModels: (models) => set({ models }),
  setRunningModels: (runningModels) => set({ runningModels }),
  setLoading: (loading) => set({ loading }),
  setPulling: (pulling) => set({ pulling }),
  setPullProgress: (pullProgress) => set({ pullProgress }),
  setSelectedModel: (selectedModel) => set({ selectedModel }),
  setOllamaOnline: (ollamaOnline) => set({ ollamaOnline }),
}))
