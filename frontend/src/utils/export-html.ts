export function escapeExportHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]!);
}

export function buildSafeExportTable(title: string, headers: string[], rows: unknown[][], spreadsheet = false): string {
  const cell = (tag: 'th' | 'td', value: unknown) => {
    const text = String(value ?? '');
    // Excel HTML imports must treat untrusted strings as text, even after leading controls.
    const protectedText = spreadsheet && typeof value === 'string' && /^[\s\u0000-\u001f\u007f]*[=+@-]/u.test(text)
      ? `'${text}` : text;
    const style = spreadsheet && typeof value === 'string' ? ' style="mso-number-format:\'\\@\'"' : '';
    return `<${tag}${style}>${escapeExportHtml(protectedText)}</${tag}>`;
  };
  const heading = headers.map((label) => cell('th', label)).join('');
  const body = rows.map((row) => `<tr>${row.map((value) => cell('td', value)).join('')}</tr>`).join('');
  return `<h1>${escapeExportHtml(title)}</h1><table><thead><tr>${heading}</tr></thead><tbody>${body}</tbody></table>`;
}
