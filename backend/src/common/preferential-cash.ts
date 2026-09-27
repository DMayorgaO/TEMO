export const preferentialGroupMarker = 'Tasa especial D C$ 36.55 aplicada al grupo.';

export interface PreferentialCashRow {
  group_id: string;
  currency: 'NIO' | 'USD';
  direction: 'ENTRA' | 'SALE';
  amount: string;
  buy_rate: string;
  sell_rate: string;
  primary_nio: string;
  primary_usd: string;
  change_nio: string;
  change_usd: string;
}

// Replay the customer's two currency balances; only USD -> NIO uses D.
// Nominal USD netting alone loses conversions followed by a USD deposit.
export function preferentialCashAdjustment(rows: PreferentialCashRow[], baseRate: number) {
  const balances = new Map<string, { NIO: number; USD: number }>();
  let adjustment = 0;
  for (const row of rows) {
    const balance = balances.get(row.group_id) ?? { NIO: 0, USD: 0 };
    balances.set(row.group_id, balance);
    const buy = Number(row.buy_rate);
    const sell = Number(row.sell_rate);
    const offset = () => {
      if (balance.NIO < 0 && balance.USD > 0) {
        const usd = Math.min(balance.USD, -balance.NIO / buy);
        balance.USD -= usd;
        balance.NIO += usd * buy;
        adjustment -= usd * (buy - baseRate);
      } else if (balance.USD < 0 && balance.NIO > 0) {
        const nio = Math.min(balance.NIO, -balance.USD * sell);
        balance.NIO -= nio;
        balance.USD += nio / sell;
      }
    };
    const sign = row.direction === 'ENTRA' ? 1 : -1;
    balance[row.currency] -= sign * Number(row.amount);
    balance.NIO += sign * Number(row.primary_nio);
    balance.USD += sign * Number(row.primary_usd);
    offset();
    balance.NIO -= Number(row.change_nio);
    balance.USD -= Number(row.change_usd);
    offset();
  }
  return adjustment;
}
