export function exportFilename(title: string, extension: 'xls' | 'png'): string {
  const name = title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100);
  return `temo-${name || 'exportacion'}.${extension}`;
}

export function downloadExport(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  try {
    link.href = url; link.download = filename; link.rel = 'noopener';
    document.body.append(link); link.click();
  } finally {
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
