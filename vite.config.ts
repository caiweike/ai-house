import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  base: '/house/',
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5274,
    strictPort: true,
    allowedHosts: ['localhost', '127.0.0.1'],
  },
});
