import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Lets the dashboard call /api/... directly in dev without CORS worries.
    proxy: {
      '/api': {
        target: process.env.VITE_FLUX_API_URL || 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
