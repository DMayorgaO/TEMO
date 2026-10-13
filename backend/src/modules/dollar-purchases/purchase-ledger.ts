export type PurchaseLedgerRow = {
  database_id: string; group_id: string; id: string; fecha_transaccion: Date | string;
  currency: string; direction: string; amount: string | number;
  tasa_compra_usada: string | number; tasa_venta_usada: string | number;
  primary_nio: string | number; primary_usd: string | number;
  change_nio: string | number; change_usd: string | number;
  shared: boolean; sale_eligible: boolean; primary_direction: string; cajero: string; sucursal: string;
  compensation_nio: string | number; compensation_usd: string | number;
};

export function calculatePurchaseLedger(rows: PurchaseLedgerRow[]) {
  const groups = new Map<string, PurchaseLedgerRow[]>();
  for (const row of rows) groups.set(row.group_id, [...(groups.get(row.group_id) ?? []), row]);
  const output = [];
  for (const steps of groups.values()) {
    let nio = 0, usd = 0, netNio = 0, nominalNio = 0, soldNio = 0;
    const purchases: Array<{ row: PurchaseLedgerRow; amount: number; cost: number }> = [];
    const shared = steps.find(row => row.shared);
    const sharedPrimary = shared ? steps.findIndex(row => row.direction === shared.primary_direction) : -1;
    function offset(row: PurchaseLedgerRow) {
      const buy = Number(row.tasa_compra_usada), sell = Number(row.tasa_venta_usada);
      if (nio < -1e-8 && usd > 1e-8 && buy > 0) {
        const used = Math.min(usd, -nio / buy);
        usd -= used; nio += used * buy; soldNio += used * buy;
      } else if (usd < -1e-8 && nio > 1e-8 && sell > buy && buy > 0) {
        const used = Math.min(-usd, nio / sell);
        nio -= used * sell; usd += used;
        // El saldo del cliente pasa entre pestanas, aunque cada arqueo se guarde separado.
        let remaining = used;
        for (const owner of [...steps.slice(0, steps.indexOf(row) + 1)].reverse()) {
          if (owner.currency !== 'USD' || owner.direction !== 'ENTRA' || !owner.sale_eligible) continue;
          const already = purchases.filter(item => item.row.database_id === owner.database_id).reduce((sum, item) => sum + item.amount, 0);
          const amount = Math.min(remaining, Math.max(0, Number(owner.amount) - already));
          if (amount > 1e-8) purchases.push({ row: owner, amount, cost: amount * sell });
          remaining -= amount;
          if (remaining < 1e-8) break;
        }
      }
    }
    for (const [index, row] of steps.entries()) {
      const sign = row.direction === 'SALE' ? -1 : 1;
      if (row.currency === 'NIO') { nio -= sign * Number(row.amount); nominalNio += sign * Number(row.amount); }
      else usd -= sign * Number(row.amount);
      const primary = row.shared ? (index === sharedPrimary ? shared! : null) : row;
      const change = row.shared ? (index === steps.length - 1 ? shared! : null) : row;
      const primarySign = row.shared ? (shared!.primary_direction === 'SALE' ? -1 : 1) : sign;
      const receivedNio = Number(primary?.primary_nio ?? 0) * primarySign;
      nio += receivedNio; usd += Number(primary?.primary_usd ?? 0) * primarySign; netNio += receivedNio;
      if (index === steps.length - 1) { nio -= Number(row.compensation_nio || 0); usd -= Number(row.compensation_usd || 0); }
      offset(row);
      const returnedNio = Number(change?.change_nio ?? 0);
      nio -= returnedNio; usd -= Number(change?.change_usd ?? 0); netNio -= returnedNio;
      offset(row);
    }
    // El vuelto no puede producir una compra mayor que el financiamiento NIO neto.
    let budget = Math.max(0, netNio - nominalNio + soldNio - Number(steps.at(-1)?.compensation_nio || 0));
    const totals = new Map<string, { row: PurchaseLedgerRow; usd: number; spread: number }>();
    for (const purchase of purchases) {
      const cost = Math.min(budget, purchase.cost);
      budget -= cost;
      const amount = purchase.amount * cost / purchase.cost;
      const total = totals.get(purchase.row.database_id) ?? { row: purchase.row, usd: 0, spread: 0 };
      total.usd += amount;
      total.spread += amount * (Number(purchase.row.tasa_venta_usada) - Number(purchase.row.tasa_compra_usada));
      totals.set(purchase.row.database_id, total);
    }
    for (const { row, usd: amount, spread } of totals.values()) {
      if (amount < 0.00005) continue;
      output.push({ database_id: row.database_id, id: row.id, fecha_transaccion: row.fecha_transaccion,
        monto_comprado_usd: amount.toFixed(4), diferencia_nio: spread.toFixed(4),
        tasa_compra_usada: row.tasa_compra_usada, tasa_venta_usada: row.tasa_venta_usada,
        cajero: row.cajero, sucursal: row.sucursal });
    }
  }
  return output;
}
