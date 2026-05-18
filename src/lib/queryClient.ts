import { QueryClient } from '@tanstack/react-query';

/**
 * Single QueryClient instance for the app.
 *
 * Defaults chosen for a chat-shaped app:
 *   staleTime  30s  — most reads don't change second-to-second; let
 *                      sibling components share a cache for 30s before
 *                      refetching on mount.
 *   gcTime     5min — keep evicted data around in case the user
 *                      navigates back quickly.
 *   refetchOnWindowFocus false — chat app, not a stock ticker; tab
 *                      switching shouldn't trigger a flood of refetches.
 *   retry       1    — one quiet retry; surface errors fast otherwise.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
