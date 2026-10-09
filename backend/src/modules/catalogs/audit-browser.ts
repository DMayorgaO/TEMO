export function auditBrowser(agent: string): string {
  if (!agent.trim()) return 'No registrado';
  const browsers: [string, RegExp][] = [
    ['Microsoft Edge', /(?:Edg|EdgA|EdgiOS)\/([\d.]+)/],
    ['Opera', /(?:OPR|OPiOS)\/([\d.]+)/],
    ['Firefox', /(?:Firefox|FxiOS)\/([\d.]+)/],
    ['Chrome', /(?:Chrome|CriOS)\/([\d.]+)/],
    ['Safari', /Version\/([\d.]+).*Safari\//],
  ];
  for (const [name, pattern] of browsers) {
    const match = agent.match(pattern);
    if (match) return `${name} ${match[1].split('.')[0]}`;
  }
  return 'Otro / no identificado';
}
