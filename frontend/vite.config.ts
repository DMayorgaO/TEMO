import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  envDir: '..',
  server: {
    // El puerto 5173 esta reservado por Windows en algunos equipos y provoca EACCES.
    port: 3000,
    strictPort: true,
  },
});
