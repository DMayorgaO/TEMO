export type ErrorCatalogEntry = {
  code: string;
  message: string;
};

const postgresErrors: Record<string, ErrorCatalogEntry> = {
  '23502': { code: 'DAT-001', message: 'Falta un dato obligatorio para completar el registro.' },
  '23503': { code: 'DAT-002', message: 'El registro depende de información que ya no está disponible.' },
  '23505': { code: 'DAT-003', message: 'Ya existe un registro con la misma información.' },
  '23514': { code: 'DAT-004', message: 'La información no cumple una regla del sistema.' },
  '22P02': { code: 'DAT-005', message: 'Uno de los valores tiene un formato incorrecto.' },
  '22003': { code: 'DAT-006', message: 'Uno de los valores excede el límite permitido.' },
  '40001': { code: 'DAT-007', message: 'La información cambió mientras se procesaba. Intente nuevamente.' },
  '40P01': { code: 'DAT-008', message: 'Otra operación estaba actualizando los mismos datos. Intente nuevamente.' },
  '42P01': { code: 'SYS-DB-001', message: 'La estructura de datos requerida no está disponible.' },
  '42703': { code: 'SYS-DB-002', message: 'La estructura de datos no coincide con la versión del sistema.' },
};

const httpErrors: Record<number, ErrorCatalogEntry> = {
  400: { code: 'REQ-400', message: 'La solicitud contiene información inválida.' },
  401: { code: 'AUT-401', message: 'La sesión no es válida o ha vencido.' },
  403: { code: 'AUT-403', message: 'No tiene permiso para realizar esta operación.' },
  404: { code: 'REQ-404', message: 'No se encontró el registro solicitado.' },
  409: { code: 'DAT-409', message: 'La operación entra en conflicto con la información actual.' },
  413: { code: 'REQ-413', message: 'La información enviada excede el tamaño permitido.' },
  429: { code: 'REQ-429', message: 'Se realizaron demasiadas solicitudes. Espere un momento.' },
};

function modulePrefix(path: string) {
  if (path.includes('/transfers')) return 'TRF';
  if (path.includes('/transactions')) return 'TRA';
  if (path.includes('/pending')) return 'PEN';
  if (path.includes('/shifts')) return 'TUR';
  if (path.includes('/auth')) return 'AUT';
  return 'GEN';
}

export function catalogPostgresError(postgresCode: string | undefined, path: string): ErrorCatalogEntry {
  const entry = postgresCode ? postgresErrors[postgresCode] : undefined;
  if (!entry) {
    return { code: `${modulePrefix(path)}-500`, message: 'No fue posible completar la operación.' };
  }
  return { ...entry, code: `${modulePrefix(path)}-${entry.code}` };
}

export function catalogHttpError(status: number, path: string): ErrorCatalogEntry {
  const entry = httpErrors[status] ?? { code: 'SYS-500', message: 'No fue posible completar la operación.' };
  if (status >= 500) return entry;
  return { ...entry, code: `${modulePrefix(path)}-${entry.code}` };
}
