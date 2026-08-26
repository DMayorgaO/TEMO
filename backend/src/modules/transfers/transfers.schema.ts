import { z } from 'zod';

const cashLineSchema = z.object({
  denomination: z.number().positive().max(1000000),
  piles25: z.number().int().min(0).max(1000000),
  loose: z.number().int().min(0).max(1000000),
});

export const transferSchema = z.object({
  shiftId: z.string().uuid().optional(),
  type: z.enum(['EFECTIVO', 'DIGITAL']),
  direction: z.enum(['INGRESO', 'EGRESO']),
  currency: z.enum(['NIO', 'USD']),
  accountId: z.string().uuid().nullable().optional(),
  amount: z.number().positive().max(999999999999),
  description: z.string().trim().max(1000).optional().default(''),
  cashLines: z.array(cashLineSchema).max(30).optional().default([]),
});

export const voidTransferSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export type TransferInput = z.infer<typeof transferSchema>;
