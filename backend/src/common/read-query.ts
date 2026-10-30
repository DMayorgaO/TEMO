import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { z } from 'zod';
import { AuthenticatedUser } from '../modules/auth/auth.service';

const unsignedInteger = z.string().regex(/^(0|[1-9][0-9]*)$/).transform(Number)
  .refine(Number.isSafeInteger);
const transactionQuery = z.object({
  limit: unsignedInteger.pipe(z.number().int().min(1).max(200)).optional().default(50),
  offset: unsignedInteger.pipe(z.number().int().min(0).max(2147483647)).optional().default(0),
}).strict();

export function parseTransactionQuery(value: unknown) {
  const parsed = transactionQuery.safeParse(value);
  if (!parsed.success) throw new BadRequestException('Paginacion invalida. Use limit de 1 a 200 y offset entero no negativo.');
  return parsed.data;
}

const date = z.string().regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/).refine(value =>
  value.slice(0,4) !== '0000' && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString().slice(0,10) === value);

const dashboardQuery = z.object({from: date.optional(), to: date.optional(), day: date.optional()})
  .strict().refine(value => Boolean(value.from) === Boolean(value.to)
    && (!value.from || !value.to || (value.from <= value.to && Date.parse(value.to)-Date.parse(value.from) <= 366*86400000)));

export function parseDashboardQuery(value: unknown) {
  const parsed = dashboardQuery.safeParse(value);
  if (!parsed.success) throw new BadRequestException('Fechas invalidas. Use fechas reales YYYY-MM-DD y un rango completo de hasta 367 dias.');
  return parsed.data;
}

export function requireTransactionReader(user: AuthenticatedUser) {
  if (!['JEFA','CAJERO'].includes(user.roleCode) || user.mustChangePassword) {
    throw new ForbiddenException('Su perfil no permite consultar transacciones ni pendientes.');
  }
}
