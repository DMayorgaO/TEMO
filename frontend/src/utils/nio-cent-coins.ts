export const nioCentCoins = [
  { id: 'nio-0.5', value: 0.5, label: 'C$ 0.50' },
  { id: 'nio-0.25', value: 0.25, label: 'C$ 0.25' },
];

type CashLine = { denomination: number; piles25: number; loose: number };

// Completa solo la presentacion de arqueos antiguos, sin cambiar su registro guardado.
export function withNioCentCoins(currency: string, lines: readonly CashLine[]): readonly CashLine[] {
  if (currency !== 'NIO') return lines;
  const missing = nioCentCoins.filter(coin => !lines.some(line => Number(line.denomination) === coin.value));
  return [...lines, ...missing.map(coin => ({denomination: coin.value, piles25: 0, loose: 0}))]
    .sort((a,b) => Number(b.denomination)-Number(a.denomination));
}
