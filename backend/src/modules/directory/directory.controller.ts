import { BadRequestException, Body, Controller, Get, Param, Post, Put, Req } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/auth.service';
import { DirectoryService } from './directory.service';
import { directoryEntrySchema } from './directory.schema';

@Controller('directory')
export class DirectoryController {
  constructor(private readonly directory: DirectoryService) {}

  @Get()
  list() {
    return this.directory.list();
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.directory.detail(id);
  }

  @Post()
  create(@Body() body: unknown, @Req() request: { user: AuthenticatedUser }) {
    const parsed = directoryEntrySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ message: 'Los datos del directorio no son validos.', errors: parsed.error.flatten() });
    }
    return this.directory.create(parsed.data, request.user);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: unknown, @Req() request: { user: AuthenticatedUser }) {
    const parsed = directoryEntrySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ message: 'Los datos del directorio no son validos.', errors: parsed.error.flatten() });
    }
    return this.directory.update(id, parsed.data, request.user);
  }
}

