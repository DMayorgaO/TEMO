import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

// HTTP access over the local network may not expose navigator.clipboard.
async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(text); return; } catch { /* Try the local-network fallback. */ }
  }
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const selection = window.getSelection();
  const ranges = selection ? Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index).cloneRange()) : [];
  const input = document.createElement('textarea');
  input.value = text;
  input.readOnly = true;
  input.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
  document.body.appendChild(input);
  try {
    input.select();
    if (!document.execCommand('copy')) throw new Error('Clipboard unavailable');
  } finally {
    input.remove();
    active?.focus({ preventScroll: true });
    if (selection) { selection.removeAllRanges(); ranges.forEach(range => selection.addRange(range)); }
  }
}

export function directoryClipboardNumber(value: string, identity = false) {
  const suffix = identity ? value.trim().match(/[a-z]$/i)?.[0].toUpperCase() ?? '' : '';
  return value.replace(/\D/g, '') + suffix;
}

export function CopyOnDoubleClick({ text, children, label, className = '' }: { text: string; children: ReactNode; label: string; className?: string }) {
  const [message, setMessage] = useState('');
  const busy = useRef(false);
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(''), 3000);
    return () => window.clearTimeout(timer);
  }, [message]);
  async function copy() {
    if (!text || busy.current) return;
    busy.current = true;
    try { await copyText(text); setMessage('Copiado'); }
    catch { setMessage('No se pudo copiar. Intente nuevamente.'); }
    finally { busy.current = false; }
  }
  return <span className={`copy-on-double-click ${className}`} role="button" tabIndex={0}
    aria-label={label} title="Doble clic para copiar · Enter o espacio con teclado"
    onDoubleClick={event => { event.stopPropagation(); void copy(); }}
    onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); void copy(); } }}>
    {children}
    {message && <span className="copy-on-double-click__feedback" role="status">{message}</span>}
  </span>;
}
