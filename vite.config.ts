import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { intentApi } from './server/vite-plugin';

export default defineConfig(({ mode }) => {
  // Server-only settings (model key, provider, data file) for the local API.
  // They are read from .env.local but never exposed to the browser bundle,
  // because only VITE_* variables are.
  const all = loadEnv(mode, process.cwd(), '');
  for (const k of ['MODEL_API_KEY', 'OPENROUTER_API_KEY', 'INTENT_PROVIDER', 'INTENT_MODEL_MAIN', 'INTENT_MODEL_SEARCH', 'INTENT_DATA_DIR']) {
    if (all[k] && !process.env[k]) process.env[k] = all[k];
  }
  return {
    ssr: { noExternal: true },
    build: { rollupOptions: { external: ['bun:sqlite', 'node:sqlite'] } },
    plugins: [react(), tailwindcss(), intentApi()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@shared': path.resolve(__dirname, './shared'),
      },
    },
    server: {
      port: 5173,
      host: '127.0.0.1',
    },
  };
});
