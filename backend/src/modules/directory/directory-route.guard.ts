import { CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { OperationalRouteGuard } from '../../common/operational-route.guard';

const roles: Record<string, readonly string[]> = {
  list: ['JEFA', 'CAJERO', 'TRANSFERISTA'],
  detail: ['JEFA', 'CAJERO', 'TRANSFERISTA'],
  create: ['JEFA', 'CAJERO'],
  update: ['JEFA', 'CAJERO'],
};

export class DirectoryRouteGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const handler = context.getHandler().name;
    if (!Object.hasOwn(roles, handler)) throw new ForbiddenException('Operacion no autorizada.');
    return new OperationalRouteGuard(roles[handler]).canActivate(context);
  }
}
