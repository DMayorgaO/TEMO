import { z } from 'zod';

const cashLineSchema = z.object({
  denomination: z.number().positive().max(1000000),
  piles25: z.number().int().nonnegative().max(1000000),
  // Los sueltos admiten conteos completos para monedas y cajeros que no usan montones de 25.
  loose: z.number().int().nonnegative().max(1000000),
});

export const cashCountsSchema = z.object({
  NIO: z.array(cashLineSchema).max(30),
  USD: z.array(cashLineSchema).max(30),
});

const bankBalanceSchema = z.object({
  account: z.string().trim().min(1).max(80),
  // Los saldos operativos pueden quedar negativos cuando los egresos superan el saldo inicial.
  amount: z.number().min(-9999999999.9999).max(9999999999.9999),
  income: z.number().min(0).max(9999999999.9999).optional(),
  expense: z.number().min(0).max(9999999999.9999).optional(),
});

export const saveBalancesSchema = z.object({
  balances: z.array(bankBalanceSchema).max(100),
});

export const saveCashCountSchema = z.object({
  counts: cashCountsSchema,
  changeNio: z.number().min(-9999999999.9999).max(9999999999.9999),
});

export const openShiftSchema = z.object({
  branchId: z.string().uuid().optional(),
  branch: z.string().trim().min(1).max(160),
  register: z.string().trim().min(1).max(80),
  cashier: z.string().trim().min(1).max(180),
  notes: z.string().trim().max(2000).default(''),
  counts: cashCountsSchema,
  balances: z.array(bankBalanceSchema).max(100),
  prepared: z.boolean().optional().default(false),
});

export const updateShiftSchema = openShiftSchema;
export type UpdateShiftInput = z.infer<typeof updateShiftSchema>;

export const closeShiftSchema = z.object({
  counts: cashCountsSchema,
  balances: z.array(bankBalanceSchema).max(100),
  changeNio: z.number().min(-9999999999.9999).max(9999999999.9999),
  observations: z.string().trim().max(2000).default(''),
});

export const updateClosedShiftSchema = z.object({
  opening: z.object({
    counts: cashCountsSchema,
    balances: z.array(bankBalanceSchema).max(100),
    notes: z.string().trim().max(2000).default(''),
  }),
  closing: z.object({
    counts: cashCountsSchema,
    balances: z.array(bankBalanceSchema).max(100),
    notes: z.string().trim().max(2000).default(''),
    changeNio: z.number().min(-9999999999.9999).max(9999999999.9999),
  }),
});

export type CashCountsInput = z.infer<typeof cashCountsSchema>;
export type SaveCashCountInput = z.infer<typeof saveCashCountSchema>;
export type OpenShiftInput = z.infer<typeof openShiftSchema>;
export type CloseShiftInput = z.infer<typeof closeShiftSchema>;
export type UpdateClosedShiftInput = z.infer<typeof updateClosedShiftSchema>;
