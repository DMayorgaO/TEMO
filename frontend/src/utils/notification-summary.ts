type SummaryNotification = {
  kind: string;
  branch: string;
  cashier: string;
  amount: string | null;
  currency: 'NIO' | 'USD' | null;
  transfer_type: 'EFECTIVO' | 'CUENTA_BANCARIA' | null;
  transfer_direction: 'ENTRA' | 'SALE' | null;
  transfer_entity: string | null;
};

type TransferRow = {
  cashier: string;
  bank: string;
  currency: 'NIO' | 'USD';
  amount: number;
  count: number;
};
type DirectionSummary = { out: boolean; count: number; rows: TransferRow[] };
type BranchSummary = { branch: string; directions: DirectionSummary[] };

export function summarizeTransferNotifications(items: readonly SummaryNotification[]): BranchSummary[] {
  const branches = new Map<string, BranchSummary>();
  for (const item of items) {
    if (item.kind !== 'TRANSFER_RECORDED') continue;
    const branch = item.branch || 'Sucursal no disponible';
    const group = branches.get(branch) ?? { branch, directions: [] };
    branches.set(branch, group);
    const out = item.transfer_direction === 'SALE';
    let direction = group.directions.find(value => value.out === out);
    if (!direction) {
      direction = { out, count: 0, rows: [] };
      group.directions.push(direction);
    }
    direction.count++;
    const cashier = item.cashier || 'Cajero no disponible';
    const bank = item.transfer_type === 'CUENTA_BANCARIA' ? item.transfer_entity || 'Banco no disponible' : '';
    const currency = item.currency ?? 'NIO';
    let row = direction.rows.find(value => value.cashier === cashier && value.bank === bank && value.currency === currency);
    if (!row) {
      row = { cashier, bank, currency, amount: 0, count: 0 };
      direction.rows.push(row);
    }
    row.amount += Number(item.amount || 0);
    row.count++;
  }
  return [...branches.values()];
}
