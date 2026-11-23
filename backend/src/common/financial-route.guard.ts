import { CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { OperationalRouteGuard } from './operational-route.guard';

type FinancialModule = 'transactions' | 'transfers' | 'dollar-purchases';
const policies: Record<FinancialModule, { roles: readonly string[]; handlers: readonly string[]; queries: readonly string[] }> = {
  transactions: {
    roles: ['JEFA', 'CAJERO'],
    handlers: ['table', 'exportFiltered', 'exportRows', 'createBatch', 'list', 'update', 'voidTransaction',
      'updateGroup', 'detail', 'groupDetail', 'pending', 'pendingPayments', 'reopenPayments',
      'payPending', 'reopenPendingPayment', 'payPendingBatch'],
    queries: ['list', 'table'],
  },
  transfers: {
    roles: ['JEFA', 'CAJERO', 'TRANSFERISTA'],
    handlers: ['list', 'context', 'detail', 'create', 'update', 'void'],
    queries: [],
  },
  'dollar-purchases': { roles: ['JEFA', 'CAJERO'], handlers: ['list'], queries: [] },
};

// New financial endpoints require a reviewed policy. Service-level scope,
// live identity, atomic audit and replay/version controls remain mandatory.
export class FinancialRouteGuard implements CanActivate {
  constructor(private readonly module: FinancialModule) {}

  canActivate(context: ExecutionContext): boolean {
    if (!Object.hasOwn(policies, this.module)) throw new ForbiddenException('Operacion no autorizada.');
    const policy = policies[this.module];
    if (!policy.handlers.includes(context.getHandler().name)) throw new ForbiddenException('Operacion no autorizada.');
    return new OperationalRouteGuard(policy.roles, policy.queries).canActivate(context);
  }
}
