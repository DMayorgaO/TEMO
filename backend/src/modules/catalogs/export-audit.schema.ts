import { z } from 'zod';

export const exportAuditSchema = z.object({
  format: z.enum(['EXCEL', 'PDF', 'PNG']),
  section: z.enum(['Turnos', 'Transacciones', 'Bancos', 'Sucursales', 'Cuentas financieras', 'Movimientos',
    'Reglas de comision', 'Reportes operativos', 'Reporte de comisiones', 'Reporte comisiones',
    'Importaciones', 'Usuarios', 'Auditoria', 'Roles', 'Permisos', 'Grafica de transacciones']),
  rows: z.number().int().min(0).max(1000000),
}).strict();
