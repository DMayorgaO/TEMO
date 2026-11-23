import { BadRequestException, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { OperationalRouteGuard } from '../../common/operational-route.guard';

const readers = ['JEFA', 'CAJERO', 'TRANSFERISTA'];
const administrator = ['JEFA'];
const policies: Record<string, readonly string[]> = {
  revokeSessions: administrator, exportRows: administrator, resetUserPassword: administrator,
  auditExport: ['JEFA', 'CAJERO'], saveNew: administrator, saveExisting: administrator,
  roles: administrator, auditoria: administrator, auditCapture: administrator,
  auditDetail: administrator, usuarios: administrator, reglasComisiones: administrator,
  operationalEntities: readers, entidadesBancarias: readers, currencies: readers,
  monedas: readers, cuentasBancarias: readers, sucursales: readers, movimientosBancarios: readers,
};

export class CatalogsRouteGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const handler = context.getHandler().name;
    if (!Object.hasOwn(policies, handler)) throw new ForbiddenException('Operacion no autorizada.');
    new OperationalRouteGuard(policies[handler]).canActivate(context);
    const { body } = context.switchToHttp().getRequest<{ body?: unknown }>();
    if (handler === 'revokeSessions' && body !== undefined && (
      body === null || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length
    )) throw new BadRequestException('La revocacion no admite campos adicionales.');
    return true;
  }
}
