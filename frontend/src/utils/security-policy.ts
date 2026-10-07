export function frontendSecurityPolicy(apiUrl: string, development = false, meta = false): string {
  const api = new URL(apiUrl);
  if (!['http:', 'https:'].includes(api.protocol) || api.username || api.password) {
    throw new Error('VITE_API_URL debe ser una URL HTTP(S) sin credenciales.');
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
    `connect-src 'self' ${api.origin}${development ? ' ws://127.0.0.1:* ws://localhost:*' : ''}`,
  ];
  // Los navegadores solo aplican frame-ancestors cuando llega como cabecera HTTP.
  if (!meta) directives.push("frame-ancestors 'none'");
  return directives.join('; ');
}
