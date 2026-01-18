/**
 * tRPC React Query Integration
 *
 * Provides React hooks for type-safe IPC calls with automatic caching,
 * background refetching, and optimistic updates.
 *
 * @module trpc/react
 */

import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createTRPCReact } from '@trpc/react-query'
import { ipcLink } from 'electron-trpc/renderer'
import type { AppRouter } from '../../../main/trpc/router'

// Create the tRPC React client
export const trpc = createTRPCReact<AppRouter>()

// Query client configuration
const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        // Sensible defaults for Electron app
        staleTime: 5000, // Data considered fresh for 5 seconds
        refetchOnWindowFocus: true,
        retry: 1,
        refetchOnMount: true,
      },
      mutations: {
        retry: 0,
      },
    },
  })

// tRPC client configuration
const createTRPCClient = () =>
  trpc.createClient({
    links: [ipcLink()],
  })

/**
 * Provider component that wraps the app with tRPC and React Query
 */
export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(createQueryClient)
  const [trpcClient] = useState(createTRPCClient)

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  )
}

// Re-export for convenience
export { QueryClientProvider, QueryClient }
