import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const backendHost = process.env.BACKEND_HOST ?? 'localhost';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Build against the shared package's TS source directly: tsc emits
      // shared/dist as CommonJS with a `export *` barrel (uses a dynamic
      // __exportStar loop), which Rollup's production build can't statically
      // analyze for named exports. Vite/esbuild transpiles the source alias fine.
      '@visual-pbx/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)),
    },
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': { target: `http://${backendHost}:4000`, changeOrigin: true },
      '/ws': { target: `ws://${backendHost}:4000`, ws: true },
    },
  },
});
