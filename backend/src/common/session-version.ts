import { ForbiddenException } from '@nestjs/common';

export function requireSessionVersion(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 2147483647) {
    throw new ForbiddenException('La sesion ya no es valida. Inicie sesion nuevamente.');
  }
  return value;
}
