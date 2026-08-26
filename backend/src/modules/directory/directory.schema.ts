import { z } from 'zod';

const optionalText = z.string().trim().max(500).optional().default('');

const identifierSchema = z.object({
  institution: z.string().trim().max(100).optional().default(''),
  type: z.string().trim().min(1).max(100),
  number: z.string().trim().min(1).max(100),
  currency: z.enum(['NIO', 'USD']).nullable().optional().default(null),
});

const identitySchema = z.object({
  number: z.string().trim().regex(/^\d{3}-\d{6}-\d{4}[A-Z]$/i, 'La cedula debe usar el formato 000-000000-0000A.'),
  holder: z.string().trim().max(180).optional().default(''),
});

export const directoryEntrySchema = z.object({
  name: z.string().trim().min(2).max(180),
  observations: optionalText,
  status: z.enum(['ACTIVO', 'INACTIVO']).optional().default('ACTIVO'),
  identifiers: z.array(identifierSchema).max(20).optional().default([]),
  identities: z.array(identitySchema).max(20).optional().default([]),
  references: z.array(z.string().trim().min(1).max(180)).max(20).optional().default([]),
}).refine(
  (entry) => entry.identifiers.length > 0 || entry.identities.length > 0 || entry.references.length > 0,
  'Debe registrar al menos un numero, cedula o referencia.',
);

export type DirectoryEntryInput = z.infer<typeof directoryEntrySchema>;

