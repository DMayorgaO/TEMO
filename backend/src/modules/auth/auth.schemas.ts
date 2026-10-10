import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

const identifier = z.string().max(254).trim().min(1).refine(value => !value.includes('\0'));
const password = z.string().min(1).max(128).refine(value => !value.includes('\0'));
const newPassword = password.min(10);
const otp = z.union([z.literal(''), z.string().regex(/^\d{6}$/)]).default('');
const recoveryCode = z.union([z.literal(''), z.string().regex(/^(?:[a-fA-F0-9]{24}|(?:[a-fA-F0-9]{6}-){3}[a-fA-F0-9]{6})$/)]).default('');

export const loginSchema = z.object({ username: identifier, password }).strict();
export const recoveryRequestSchema = z.object({ identifier }).strict();
export const recoveryConfirmSchema = z.object({ identifier, code: z.string().regex(/^\d{6}$/), newPassword }).strict();
export const changePasswordSchema = z.object({ currentPassword: password, newPassword }).strict();
export const profilePhotoSchema = z.object({ photoDataUrl: z.string().min(1).max(200_000) }).strict();
export const mfaVerifySchema = z.object({
  challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/), code: otp, recoveryCode,
}).strict().refine(value => Boolean(value.code) !== Boolean(value.recoveryCode));

export function parseAuthBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  // Do not include submitted credentials or raw validation details in responses.
  if (!result.success) throw new BadRequestException('Revise el formato y el tamano de los datos de autenticacion.');
  return result.data;
}
