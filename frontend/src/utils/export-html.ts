export function escapeExportHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]!);
}

export function buildSafeExportTable(title: string, headers: string[], rows: unknown[][]): string {
  const heading = headers.map((label) => `<th>${escapeExportHtml(label)}</th>`).join('');
  const body = rows.map((row) => `<tr>${row.map((value) => `<td>${escapeExportHtml(value)}</td>`).join('')}</tr>`).join('');
  return `<h1>${escapeExportHtml(title)}</h1><table><thead><tr>${heading}</tr></thead><tbody>${body}</tbody></table>`;
}
