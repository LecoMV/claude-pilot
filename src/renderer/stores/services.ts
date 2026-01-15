import { create } from 'zustand'

export interface SystemdService {
  name: string
  description: string
  status: 'running' | 'stopped' | 'failed' | 'inactive'
  enabled: boolean
  activeState: string
  subState: string
  pid?: number
  memory?: string
  cpu?: string
}

export interface PodmanContainer {
  id: string
  name: string
  image: string
  status: 'running' | 'stopped' | 'paused' | 'exited'
  created: string
  ports: string[]
  state: string
  health?: string
}

interface ServicesState {
  systemdServices: SystemdService[]
  podmanContainers: PodmanContainer[]
  loading: boolean
  activeTab: 'systemd' | 'podman'
  selectedService: SystemdService | null
  selectedContainer: PodmanContainer | null
  filter: string

  setSystemdServices: (services: SystemdService[]) => void
  setPodmanContainers: (containers: PodmanContainer[]) => void
  setLoading: (loading: boolean) => void
  setActiveTab: (tab: 'systemd' | 'podman') => void
  setSelectedService: (service: SystemdService | null) => void
  setSelectedContainer: (container: PodmanContainer | null) => void
  setFilter: (filter: string) => void
}

export const useServicesStore = create<ServicesState>((set) => ({
  systemdServices: [],
  podmanContainers: [],
  loading: true,
  activeTab: 'podman',
  selectedService: null,
  selectedContainer: null,
  filter: '',

  setSystemdServices: (services) => set({ systemdServices: services }),
  setPodmanContainers: (containers) => set({ podmanContainers: containers }),
  setLoading: (loading) => set({ loading }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setSelectedService: (service) => set({ selectedService: service }),
  setSelectedContainer: (container) => set({ selectedContainer: container }),
  setFilter: (filter) => set({ filter }),
}))
