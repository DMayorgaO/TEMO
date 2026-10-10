import { HttpException } from '@nestjs/common';
import type { ErrorRequestHandler } from 'express';

const statuses: Record<string, number> = {
  'entity.parse.failed': 400,
  'request.aborted': 400,
  'request.size.invalid': 400,
  'entity.too.large': 413,
  'parameters.too.many': 413,
  'encoding.unsupported': 415,
  'charset.unsupported': 415,
};

// Parser errors can contain the submitted body; never forward that content or message.
export const sanitizeBodyParserError: ErrorRequestHandler = (error: unknown, _request, _response, next) => {
  const parsed = error as { type?: unknown; status?: unknown } | null;
  const status = typeof parsed?.type === 'string' && Object.hasOwn(statuses, parsed.type)
    ? statuses[parsed.type] : undefined;
  if (status && parsed?.status === status) {
    next(new HttpException({ code: `GEN-REQ-${status}`, message: status === 413
      ? 'La informacion enviada excede el tamano permitido.'
      : status === 415 ? 'La codificacion de la solicitud no es compatible.'
        : 'La solicitud contiene un formato invalido.' }, status));
    return;
  }
  next(error);
};
