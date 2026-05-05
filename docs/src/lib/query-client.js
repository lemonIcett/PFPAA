import { QueryClient } from '@tanstack/react-query'
export const queryClientInstance = new QueryClient({
  defaultOptions: { queries: { staleTime: 30000, retry: 1 } }
})
