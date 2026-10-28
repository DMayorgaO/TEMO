export function isPrivateDevelopmentAddress(value: string): boolean {
  const host=value.replace(/^::ffff:/,'');
  if(host==='localhost'||host==='::1')return true;
  const parts=host.split('.');
  if(parts.length!==4||parts.some(part=>!/^\d{1,3}$/.test(part)||Number(part)>255))return false;
  const [a,b]=parts.map(Number);
  return a===127||a===10||(a===172&&b>=16&&b<=31)||(a===192&&b===168);
}

export function frontendSecurityPolicy(apiUrl: string, development = false, meta = false, sockets: string[] = []): string {
  const relative=apiUrl==='/api'&&development;
  const api = new URL(apiUrl,relative?'http://localhost':undefined);
  if (!['http:', 'https:'].includes(api.protocol) || api.username || api.password) {
    throw new Error('VITE_API_URL debe ser una URL HTTP(S) sin credenciales.');
  }
  for(const socket of sockets){
    const url=new URL(socket);
    if(!development||url.protocol!=='ws:'||url.origin!==socket||url.username||url.password||!isPrivateDevelopmentAddress(url.hostname))throw new Error('Origen HMR local invalido.');
  }
  const directives = [
    "default-src 'none'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "form-action 'self'",
    `script-src 'self'${development ? " 'unsafe-inline'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${relative?'':` ${api.origin}`}${development ? ' ws://127.0.0.1:* ws://localhost:*' : ''}${sockets.length?` ${sockets.join(' ')}`:''}`,
  ];
  // Los navegadores solo aplican frame-ancestors cuando llega como cabecera HTTP.
  if (!meta) directives.push("frame-ancestors 'none'");
  return directives.join('; ');
}
