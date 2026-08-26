import { z } from 'zod';

const cashCountLineSchema = z
  .object({
    denomination: z.number().positive().max(1000000),
    piles25: z.number().int().nonnegative().max(1000000),
    loose: z.number().int().nonnegative().max(1000000),
  })
  .strict();

const currencyCashCountsSchema = z
  .object({
    NIO: z.array(cashCountLineSchema).max(30),
    USD: z.array(cashCountLineSchema).max(30),
  })
  .strict();

const amountSchema = z.number().positive().max(9999999999.9999);

const ratesSchema = z
  .object({
    buy: z.number().positive().max(1000),
    sell: z.number().positive().max(1000),
  })
  .strict();

const settlementSchema = z
  .object({
    primaryRateKind: z.enum(['COMPRA', 'VENTA']),
    changeRateKind: z.enum(['COMPRA', 'VENTA']),
    expectedChange: z
      .object({
        NIO: z.number().nonnegative().max(9999999999.9999),
        USD: z.number().nonnegative().max(9999999999.9999),
      })
      .strict(),
    primaryCounts: currencyCashCountsSchema,
    changeCounts: currencyCashCountsSchema,
  })
  .strict();

export const updateTransactionSchema = z
  .object({
    entityCode: z.string().trim().min(1).max(40),
    movementCode: z.string().trim().min(1).max(40),
    currencyCode: z.enum(['NIO', 'USD']),
    amount: amountSchema,
    pendingName: z.string().trim().max(160).optional().default(''),
    description: z.string().trim().max(2000).optional().default(''),
    rates: ratesSchema,
    settlement: settlementSchema,
  })
  .strict();

export const createTransactionBatchSchema = z
  .object({
    shiftId: z.string().uuid().optional(),
    userId: z.string().uuid().optional(),
    rates: ratesSchema,
    transactions: z
      .array(
        z
          .object({
            entityCode: z.string().trim().min(1).max(40),
            movementCode: z.string().trim().min(1).max(40),
            currencyCode: z.enum(['NIO', 'USD']),
            amount: amountSchema,
            pendingName: z.string().trim().max(160).optional().default(''),
            description: z.string().trim().max(2000).optional().default(''),
          })
          .strict(),
      )
      .min(1)
      .max(20),
    settlement: settlementSchema,
  })
  .strict();

export const payPendingSchema = z
  .object({
    rates: ratesSchema,
    settlement: settlementSchema,
  })
  .strict();

export type CreateTransactionBatchInput = z.infer<
  typeof createTransactionBatchSchema
>;

export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;
export type PayPendingInput = z.infer<typeof payPendingSchema>;
