import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from '@tanstack/react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { router } from './router';
import { queryClient } from './lib/queryClient';
import { env } from './lib/env';
import {
  __emitGatewayEventForTests,
  __simulateGatewayWsCloseForTests,
} from './gateway/useGateway';
import './index.css';

// Stamp the build flags onto window for e2e — lets the test runner
// detect which mode the running bundle is in without parsing the
// asset hash or replicating the env logic. Safe to expose: these are
// already public (`import.meta.env.VITE_USE_REAL_DATA` is in the
// minified bundle anyway). `emitGatewayEvent` is a test escape
// hatch for cases where e2e wants to simulate a gateway event
// (e.g. `agent.start`) without a live OpenClaw backend.
declare global {
  interface Window {
    __aios?: {
      useRealData: boolean;
      isProd: boolean;
      emitGatewayEvent: (event: string, payload?: unknown) => void;
      simulateGatewayWsClose: () => void;
    };
  }
}
window.__aios = {
  useRealData: env.useRealData,
  isProd: env.isProd,
  emitGatewayEvent: __emitGatewayEventForTests,
  simulateGatewayWsClose: __simulateGatewayWsCloseForTests,
};

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
