import { ArgumentMetadata, BadRequestException, ParseUUIDPipe, PipeTransform } from '@nestjs/common';

// Scope this pipe to controllers whose named :id parameters are database UUIDs.
export class RecordIdPipe implements PipeTransform {
  private readonly uuid = new ParseUUIDPipe({
    exceptionFactory: () => new BadRequestException('El identificador del registro no es valido.'),
  });

  transform(value: unknown, metadata: ArgumentMetadata) {
    if (metadata.type !== 'param' || metadata.data !== 'id') return value;
    if (typeof value !== 'string') throw new BadRequestException('El identificador del registro no es valido.');
    return this.uuid.transform(value, metadata);
  }
}
