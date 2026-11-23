import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, Post, Put, Query, Req, UseGuards, UsePipes } from '@nestjs/common';
import { DirectoryRouteGuard } from './directory-route.guard';
import { RecordIdPipe } from '../../common/record-id.pipe';
import { AuthenticatedUser } from '../auth/auth.service';
import { DirectoryService } from './directory.service';
import { directoryEntrySchema, directoryUpdateSchema } from './directory.schema';

@Controller('directory')
@UseGuards(new DirectoryRouteGuard())
@UsePipes(new RecordIdPipe())
export class DirectoryController {
  constructor(private readonly directory: DirectoryService) {}

  @Get()
  list(@Req() request: { user: AuthenticatedUser }, @Query() query: Record<string, unknown>) {
    this.authorize(request.user, ['JEFA','CAJERO','TRANSFERISTA']);
    this.requireEmptyQuery(query);
    return this.directory.list();
  }

  @Get(':id')
  detail(@Param('id') id: string, @Req() request: { user: AuthenticatedUser }, @Query() query: Record<string, unknown>) {
    this.authorize(request.user, ['JEFA','CAJERO','TRANSFERISTA']);
    this.requireEmptyQuery(query);
    return this.directory.detail(id);
  }

  @Post()
  create(@Body() body: unknown, @Req() request: { user: AuthenticatedUser }) {
    this.authorize(request.user, ['JEFA','CAJERO']);
    const parsed = directoryEntrySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ message: 'Los datos del directorio no son validos.', errors: parsed.error.flatten() });
    }
    return this.directory.create(parsed.data, request.user);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: unknown, @Req() request: { user: AuthenticatedUser }) {
    this.authorize(request.user, ['JEFA','CAJERO']);
    const parsed = directoryUpdateSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ message: 'Los datos del directorio no son validos.', errors: parsed.error.flatten() });
    }
    return this.directory.update(id, parsed.data, request.user);
  }

  private authorize(user: AuthenticatedUser, roles: string[]) {
    if (!user || user.mustChangePassword || !roles.includes(user.roleCode)) throw new ForbiddenException('Su perfil no permite esta operacion del directorio.');
  }

  private requireEmptyQuery(query: Record<string, unknown>) {
    if (query && Object.keys(query).length) throw new BadRequestException('La consulta del directorio no admite parametros adicionales.');
  }
}

