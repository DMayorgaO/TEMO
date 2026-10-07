import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { fileURLToPath } from 'node:url';
import { frontendSecurityPolicy } from './src/utils/security-policy.ts';

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, fileURLToPath(new URL('..', import.meta.url)), 'VITE_');
  const apiUrl = env.VITE_API_URL || 'http://localhost:4000/api';
  const development = command === 'serve';
  const headers = {
    'Content-Security-Policy': frontendSecurityPolicy(apiUrl, development),
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  };
  return {
  plugins: [react(), {
    name: 'temo-security-policy',
    transformIndexHtml: () => [{
      tag: 'meta',
      attrs: { 'http-equiv': 'Content-Security-Policy', content: frontendSecurityPolicy(apiUrl, development, true) },
      injectTo: 'head-prepend',
    }],
  }],
  envDir: '..',
  preview: { headers: { ...headers, 'Content-Security-Policy': frontendSecurityPolicy(apiUrl) } },
  server: {
    headers,
    // El puerto 5173 esta reservado por Windows en algunos equipos y provoca EACCES.
    port: 3000,
    strictPort: true,
  },
  };
});
