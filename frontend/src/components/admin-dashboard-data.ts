export type Currency = 'NIO' | 'USD';
export type Count = {
  day: string; branch_id: string; branch: string; cashier_id: string; cashier: string;
  entity: string; nio: number; usd: number; total: number;
};
export type Account = {
  account_id: string; account: string; entity: string; currency: Currency; branch_id: string; branch: string;
};
export type Balance = Account & {
  cashier: string; cashier_id: string; system: string; difference: string; shift_id: string; shift_state: string;
};
export type Settlement = {
  branch_id: string; branch: string; entity: 'PEX' | 'TELEDOLAR'; currency: Currency; income: string; expense: string;
};
export type DashboardData = {
  today: string; tableDay: string; from: string; to: string; counts: Count[]; accounts: Account[];
  banks: string[]; balances: Balance[]; lafise: Balance[]; reconciliation: Settlement[];
};
export type CashierCount = Omit<Count, 'day' | 'entity'>;
export type BankBalance = { id: string; branch_id: string; branch: string; entity: string; amounts: Partial<Record<Currency, number | null>> };
export type ReconciliationRow = {
  id: string; branch: string; entity: string;
  amounts: Partial<Record<Currency, { income: number; expense: number; difference: number }>>;
};

export function filterCounts(rows: Count[], banks: string[], currencies: Currency[]) {
  return rows.filter(row => !banks.length || banks.includes(row.entity)).map(row => {
    const nio = !currencies.length || currencies.includes('NIO') ? row.nio : 0;
    const usd = !currencies.length || currencies.includes('USD') ? row.usd : 0;
    return { ...row, nio, usd, total: nio + usd };
  });
}

export function cashierCounts(data: DashboardData, rows: Count[], day: string): CashierCount[] {
  const roster = new Map<string, CashierCount>();
  for (const row of [...data.counts, ...data.balances]) {
    const key = `${row.branch_id}:${row.cashier_id}`;
    roster.set(key, { branch_id: row.branch_id, branch: row.branch, cashier_id: row.cashier_id, cashier: row.cashier, nio: 0, usd: 0, total: 0 });
  }
  for (const row of rows.filter(row => row.day === day)) {
    const key = `${row.branch_id}:${row.cashier_id}`;
    const value = roster.get(key)!;
    value.nio += row.nio; value.usd += row.usd; value.total += row.total;
  }
  return [...roster.values()].sort((a, b) => a.branch.localeCompare(b.branch) || a.cashier.localeCompare(b.cashier));
}

export function bankBalances(data: DashboardData): BankBalance[] {
  const readings = new Map(data.balances.map(row => [`${row.branch_id}:${row.account_id}`, Number(row.system)]));
  const groups = new Map<string, BankBalance>();
  for (const account of data.accounts) {
    const key = `${account.branch_id}:${account.entity}`;
    const value = groups.get(key) ?? { id: key, branch_id: account.branch_id, branch: account.branch, entity: account.entity, amounts: {} };
    const amount = readings.get(`${account.branch_id}:${account.account_id}`);
    const previous = value.amounts[account.currency];
    value.amounts[account.currency] = amount === undefined || previous === null ? null : (previous ?? 0) + amount;
    groups.set(key, value);
  }
  return [...groups.values()];
}

export function reconciliationRows(rows: Settlement[]): ReconciliationRow[] {
  const groups = new Map<string, ReconciliationRow>();
  for (const row of rows) {
    const key = `${row.branch_id}:${row.entity}`;
    const value = groups.get(key) ?? { id: key, branch: row.branch, entity: row.entity, amounts: {} };
    const income = Number(row.income), expense = Number(row.expense);
    value.amounts[row.currency] = { income, expense, difference: Math.round((income - expense) * 100) / 100 };
    groups.set(key, value);
  }
  return [...groups.values()];
}

export function reconciliationTotal(rows: ReconciliationRow[]): ReconciliationRow {
  const total: ReconciliationRow = { id: 'total', branch: '', entity: 'TOTAL', amounts: {} };
  for (const row of rows) {
    for (const currency of ['NIO', 'USD'] as const) {
      const amounts = row.amounts[currency];
      if (!amounts) continue;
      const value = total.amounts[currency] ?? { income: 0, expense: 0, difference: 0 };
      value.income += amounts.income; value.expense += amounts.expense;
      value.difference = Math.round((value.income - value.expense) * 100) / 100;
      total.amounts[currency] = value;
    }
  }
  return total;
}
