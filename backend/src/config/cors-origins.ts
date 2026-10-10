export function parseCorsOrigins(value: string, remote: boolean): string[] {
  if (!value.trim()) {
    if (remote) throw new Error('Los ambientes piloto y produccion requieren CORS_ORIGINS explicito.');
    return [];
  }
  const origins = value.split(',').map((origin) => origin.trim());
  for (const origin of origins) {
    let url: URL;
    try { url = new URL(origin); } catch { throw new Error('CORS_ORIGINS contiene un origen invalido.'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.hostname.includes('*') || url.origin !== origin ||
      (remote && url.protocol !== 'https:')) {
      throw new Error('CORS_ORIGINS requiere origenes exactos sin rutas, credenciales ni comodines; HTTPS en ambientes remotos.');
    }
  }
  return [...new Set(origins)];
}
