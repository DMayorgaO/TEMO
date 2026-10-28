import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';
import { frontendSecurityPolicy, isPrivateDevelopmentAddress } from './src/utils/security-policy.ts';

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, fileURLToPath(new URL('..', import.meta.url)), 'VITE_');
  const apiUrl = env.VITE_API_URL || 'http://localhost:4000/api';
  const development = command === 'serve';
  const lan=development&&env.VITE_DEV_LOCAL_PROXY==='1';
  const addresses=[...new Set(Object.values(networkInterfaces()).flat().filter(item=>item?.family==='IPv4'&&isPrivateDevelopmentAddress(item.address)).map(item=>item!.address))];
  const sockets=lan?addresses.map(ip=>`ws://${ip}:3188`):[];
  const policy=(meta=false)=>frontendSecurityPolicy(apiUrl,development,meta,sockets);
  const headers = {
    'Content-Security-Policy': policy(),
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
      attrs: { 'http-equiv': 'Content-Security-Policy', content: policy(true) },
      injectTo: 'head-prepend',
    }],
    configureServer(server) {
      if(!lan)return;
      server.httpServer?.prependListener('upgrade',(req,socket)=>{
        if(!isPrivateDevelopmentAddress(req.socket.remoteAddress||''))socket.destroy();
      });
      server.middlewares.use((req,res,next)=>{
        let host='';try{host=new URL(`http://${req.headers.host}`).hostname;}catch{ /* Reject malformed hosts below. */ }
        if(!isPrivateDevelopmentAddress(req.socket.remoteAddress||'')||!['localhost',...addresses].includes(host)){
          res.statusCode=403;res.end('Solo red local de desarrollo.');return;
        }
        next();
      });
    },
  }],
  envDir: '..',
  preview: { headers: apiUrl==='/api'?headers:{ ...headers, 'Content-Security-Policy': frontendSecurityPolicy(apiUrl) } },
  server: {
    headers,
    ...(lan?{proxy:{'/api':{target:'http://127.0.0.1:4187',changeOrigin:false}},
      fs:{strict:true,allow:[fileURLToPath(new URL('.',import.meta.url)),fileURLToPath(new URL('../node_modules',import.meta.url))],deny:['**/.env','**/.env.*','**/*.pem','**/*.key','**/*.dump']}}:{}),
    // El puerto 5173 esta reservado por Windows en algunos equipos y provoca EACCES.
    port: 3000,
    strictPort: true,
  },
  };
});
