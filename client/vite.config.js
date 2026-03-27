import { resolve } from 'path';
import { defineConfig } from 'vite';

const vitePort = parseInt(process.env.VITE_PORT || '3000');
const apiPort = parseInt(process.env.API_PORT || '3001');

export default defineConfig({
  root: resolve(__dirname),
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        'test-crop': resolve(__dirname, 'test-crop.html'),
      },
    },
  },
  server: {
    port: vitePort,
    proxy: {
      // Proxy all PATH_SECRET-prefixed requests to Express
      // The regex matches any path that starts with a hex-looking segment
      '^/[a-fA-F0-9]{16,}': {
        target: `http://localhost:${apiPort}`,
        changeOrigin: true,
      },
      '/health': {
        target: `http://localhost:${apiPort}`,
        changeOrigin: true,
      },
    },
  },
});
