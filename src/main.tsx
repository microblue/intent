import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from '@tanstack/react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { router } from './router';
import { queryClient } from './lib/queryClient';
import { env } from './lib/env';
import './index.css';

// Stamp the build flags onto window for e2e — lets the test runner
// detect which mode the running bundle is in without parsing the
// asset hash or replicating the env logic. Safe to expose: these are
// already public (`import.meta.env.VITE_USE_REAL_DATA` is in the
// minified bundle anyway).
declare global {
  interface Window {
    __aios?: { useRealData: boolean; isProd: boolean };
  }
}
window.__aios = { useRealData: env.useRealData, isProd: env.isProd };

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster position="top-center" theme="dark" richColors closeButton />
    </QueryClientProvider>
  </StrictMode>,
);
