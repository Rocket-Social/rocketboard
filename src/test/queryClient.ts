import {QueryClient, type QueryClientConfig} from '@tanstack/react-query'

const testQueryClients = new Set<QueryClient>()

export function createTestQueryClient(config: QueryClientConfig = {}) {
  const queryClient = new QueryClient({
    ...config,
    defaultOptions: {
      ...config.defaultOptions,
      mutations: {
        gcTime: Infinity,
        retry: false,
        ...config.defaultOptions?.mutations,
      },
      queries: {
        gcTime: Infinity,
        retry: false,
        ...config.defaultOptions?.queries,
      },
    },
  })

  testQueryClients.add(queryClient)

  return queryClient
}

export function clearTestQueryClients() {
  for (const queryClient of testQueryClients) {
    queryClient.clear()
  }

  testQueryClients.clear()
}
