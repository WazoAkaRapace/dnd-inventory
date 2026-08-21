import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.DND_API_TARGET || 'http://localhost:4000',
        changeOrigin: true,
      },
      '/ws': {
        target: process.env.DND_API_TARGET || 'http://localhost:4000',
        ws: true,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    // Production sourcemaps off: a 2.6 MB .map was shipping in dist/assets.
    // Dev sourcemaps come from the dev server and are unaffected by this flag.
    sourcemap: false,
  },
});
