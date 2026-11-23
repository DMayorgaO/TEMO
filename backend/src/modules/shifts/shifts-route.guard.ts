import { BadRequestException, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { OperationalRouteGuard } from '../../common/operational-route.guard';

const boss = ['JEFA'];
const cashier = ['CAJERO'];
const cashRoles = ['JEFA', 'CAJERO'];
const readers = ['JEFA', 'CAJERO', 'TRANSFERISTA'];

// Existing read scopes remain in ShiftsService. Unknown/new handlers fail closed
// until their policy is explicitly reviewed and covered by the HTTP matrix.
const roles: Record<string, readonly string[]> = {
  handoverList: cashRoles, handoverCandidates: cashier, handoverPreview: cashier,
  handoverPropose: cashier, handoverDifference: cashier, cancelClose: cashier,
  handoverResolve: cashier, exportRows: cashRoles, exportDashboard: boss,
  list: readers, open: readers, dashboard: boss, current: readers, access: cashier,
  notifications: readers, acknowledge: readers, detail: readers, create: boss,
  openPrepared: cashier, update: boss, updateClosed: boss, saveCashCount: cashRoles,
  saveBalances: cashRoles, requestClose: cashier, close: boss, rejectClose: boss,
};
const emptyBodies = new Set(['cancelClose', 'handoverResolve', 'acknowledge', 'openPrepared', 'rejectClose']);

export class ShiftsRouteGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const handler = context.getHandler().name;
    if (!Object.prototype.hasOwnProperty.call(roles, handler)) throw new ForbiddenException('Operacion no autorizada.');
    new OperationalRouteGuard(roles[handler], ['dashboard']).canActivate(context);
    const { body } = context.switchToHttp().getRequest<{ body?: unknown }>();
    if (emptyBodies.has(handler) && body !== undefined && (
      body === null || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length
    )) throw new BadRequestException('Esta operacion no admite campos adicionales.');
    return true;
  }
}
