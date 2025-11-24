// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import type { ProxyOptions } from 'vite';

// Proxy config for /api -> backend (Express) running on port 4000
const apiProxy: Record<string, string | ProxyOptions> = {
  '/api': {
    target: 'http://localhost:4000',
    changeOrigin: true,
    secure: false,
    // optional: keep the path as-is (default)
    // rewrite: (path) => path.replace(/^\/api/, '')
  }
};

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  server: {
    proxy: apiProxy
  }
});
