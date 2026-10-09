import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, ParseUUIDPipe, NotFoundException, Post, Put, Req } from '@nestjs/common';
import { isIP } from 'node:net';
import { AuthenticatedUser } from '../auth/auth.service';
import { DatabaseService } from '../database/database.service';
import { CatalogsService } from './catalogs.service';
import { auditBrowser } from './audit-browser';
import { auditChanges } from './audit-changes';
import { exportAuditSchema } from './export-audit.schema';
import { authorizedExport, parseExportSelection, requireExportRole } from '../../common/export-selection';

@Controller('catalogs')
export class CatalogsController {
  private readonly exportEvents = new Map<string, number>();
  constructor(
    private readonly db: DatabaseService,
    private readonly catalogs: CatalogsService,
  ) {}

  @Post('usuarios/:id/revoke-sessions')
  revokeSessions(@Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: { user: AuthenticatedUser; ip?: string; headers?: Record<string, string | string[] | undefined> }) {
    return this.catalogs.revokeUserSessions(id, request.user,
      { ip: request.ip, userAgent: String(request.headers?.['user-agent'] ?? '') });
  }

  @Post('export/:resource')
  async exportRows(@Param('resource') resource: string, @Body() body: unknown,
    @Req() request: { user: AuthenticatedUser; ip?: string }) {
    requireExportRole(request.user, true);
    const input = parseExportSelection(body);
    const sources: Record<string, { title: string; load: () => Promise<Record<string, unknown>[]> }> = {
      roles: { title: 'Roles', load: () => this.roles(request) },
      users: { title: 'Usuarios', load: () => this.usuarios(request) },
      banks: { title: 'Bancos', load: () => this.entidadesBancarias() },
      branches: { title: 'Sucursales', load: () => this.sucursales(request) },
      accounts: { title: 'Cuentas financieras', load: () => this.cuentasBancarias(request) },
      movements: { title: 'Movimientos', load: () => this.movimientosBancarios() },
      commissions: { title: 'Reglas de comision', load: () => this.reglasComisiones(request) },
      audit: { title: 'Auditoria', load: () => this.auditoria(request) },
    };
    const source = Object.hasOwn(sources, resource) ? sources[resource] : undefined;
    if (!source) throw new BadRequestException('Este apartado no tiene una exportacion de datos habilitada.');
    return authorizedExport(this.db, request, source.title, input, await source.load(), row => String(row.id));
  }

  // Permite al Administrador asignar una clave temporal exclusivamente a un cajero.
  @Post('usuarios/:id/reset-password')
  resetUserPassword(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: Record<string, unknown>,
    @Req() request: { user: AuthenticatedUser; ip?: string; headers: Record<string, string | string[] | undefined> },
  ) {
    return this.catalogs.resetUserPassword(
      id,
      String(body.temporaryPassword ?? ''),
      request.user,
      request.ip ?? '',
      String(request.headers['user-agent'] ?? ''),
    );
  }

  @Post('auditoria/exportaciones')
  async auditExport(@Body() body: unknown, @Req() request: { user: AuthenticatedUser; ip?: string }) {
    const parsed = exportAuditSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Solicitud de auditoria de exportacion invalida.');
    const input = parsed.data;
    const operational = input.section === 'Transacciones' || input.section === 'Turnos';
    if (request.user.roleCode !== 'JEFA' && !(request.user.roleCode === 'CAJERO' && operational)) {
      throw new ForbiddenException('No tiene permiso para esta exportacion.');
    }
    if ((input.format === 'PNG') !== (input.section === 'Grafica de transacciones')) {
      throw new BadRequestException('El formato no corresponde al apartado.');
    }
    const now = Date.now();
    for (const [key, expires] of this.exportEvents) if (expires <= now) this.exportEvents.delete(key);
    const key = `${request.user.id}|${input.section}|${input.format}`;
    if (this.exportEvents.has(key) || this.exportEvents.size >= 1000) return { recorded: false, grouped: true };
    this.exportEvents.set(key, now + 2000);
    const address = (request.ip ?? '').replace(/^::ffff:/, '');
    await this.db.query(`insert into temo.bitacora(id_usuario,accion,tabla,id_registro,datos_nuevos,direccion_ip)
      values($1,'EXPORTAR','seguridad',$1,jsonb_build_object('evento','EXPORTACION_SOLICITADA',
      'formato',$2::text,'apartado',$3::text,'filas_declaradas',$4::integer),$5::inet)`,
    [request.user.id, input.format, input.section, input.rows, isIP(address) ? address : null]);
    return { recorded: true };
  }

  @Post(':resource')
  saveNew(
    @Param('resource') resource: string,
    @Body() body: Record<string, unknown>,
    @Req() request: { user: AuthenticatedUser; ip?: string; headers?: Record<string, string | string[] | undefined> },
  ) {
    return this.catalogs.save(resource, undefined, body, request.user,
      { ip: request.ip, userAgent: String(request.headers?.['user-agent'] ?? '') });
  }

  @Put(':resource/:id')
  saveExisting(
    @Param('resource') resource: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: Record<string, unknown>,
    @Req() request: { user: AuthenticatedUser; ip?: string; headers?: Record<string, string | string[] | undefined> },
  ) {
    return this.catalogs.save(resource, id, body, request.user,
      { ip: request.ip, userAgent: String(request.headers?.['user-agent'] ?? '') });
  }

  @Get('roles')
  async roles(@Req() request: { user: AuthenticatedUser }) {
    this.requireAdministrator(request.user);
    const result = await this.db.query(
      `select
         id_rol as id,
         codigo,
         nombre,
         coalesce(descripcion, '') as descripcion,
         estado
       from temo.roles
       order by nombre`,
    );

    return result.rows;
  }

  @Get('auditoria')
  async auditoria(@Req() request: { user: AuthenticatedUser }) {
    this.requireAdministrator(request.user);
    const result = await this.db.query(
      `select b.id_bitacora as id, b.numero_auditoria as numero, b.fecha_creacion as fecha,
              coalesce(u.usuario, 'Sistema') as usuario,
              b.accion::text as accion, b.tabla as entidad,
              b.id_registro as registro,
              coalesce(target.usuario,
                case when tr.id_transaccion is not null then concat('TRA-', lpad(tg.codigo_operacion::text, 6, '0'), '-', lpad(tr.orden_grupo::text, 2, '0')) end,
                case when grp.id_grupo_transacciones is not null then concat('TRA-', lpad(grp.codigo_operacion::text, 6, '0')) end,
                case when pp.id_pendiente is not null then concat('PEN-', lpad(pp.codigo_pendiente::text, 6, '0')) end,
                case when sh.id_turno is not null then concat('TUR-', lpad(sh.codigo_turno::text, 6, '0')) end,
                b.id_registro::text, '') as codigo_registro,
              coalesce(host(b.direccion_ip), '') as ip,
              left(coalesce(b.agente_usuario, ''), 300) as navegador,
              case when b.agente_usuario is null then 'No registrado'
                   when b.agente_usuario ~* 'iPad|Tablet|Android(?!.*Mobile)' then 'Tablet (estimado)'
                   when b.agente_usuario ~* 'Mobile|iPhone' then 'Celular (estimado)'
                   else 'Computadora u otro (estimado)' end as dispositivo
       from temo.bitacora b
       left join temo.usuarios u on u.id_usuario = b.id_usuario
       left join temo.usuarios target on b.tabla = 'usuarios' and target.id_usuario = b.id_registro
       left join temo.transacciones tr on b.tabla in ('transacciones', 'correcciones_transacciones_cerradas') and tr.id_transaccion = b.id_registro
       left join temo.grupos_transacciones tg on tg.id_grupo_transacciones = tr.id_grupo_transacciones
       left join temo.grupos_transacciones grp on b.tabla = 'grupos_transacciones' and grp.id_grupo_transacciones = b.id_registro
       left join temo.pagos_pendientes pp on b.tabla = 'pagos_pendientes' and pp.id_pendiente = b.id_registro
       left join temo.turnos sh on b.tabla = 'turnos' and sh.id_turno = b.id_registro
       order by b.fecha_creacion desc, b.id_bitacora desc
       limit 500`,
    );
    return result.rows.map((row: Record<string, unknown>) => ({ ...row, navegador: auditBrowser(String(row.navegador ?? '')) }));
  }

  @Get('auditoria/:id')
  async auditDetail(@Param('id', new ParseUUIDPipe()) id: string, @Req() request: { user: AuthenticatedUser }) {
    this.requireAdministrator(request.user);
    const result = await this.db.query(
      `select tabla, datos_anteriores, datos_nuevos from temo.bitacora where id_bitacora = $1::uuid`, [id],
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundException('El evento de auditoria no existe.');
    return auditChanges(String(row.tabla), row.datos_anteriores, row.datos_nuevos);
  }

  @Get('usuarios')
  async usuarios(@Req() request: { user: AuthenticatedUser }) {
    this.requireAdministrator(request.user);
    const result = await this.db.query(
      `select
         u.id_usuario as id,
         u.nombres,
         u.apellidos,
         u.nombre_completo,
         u.usuario,
         coalesce(u.correo, '') as correo,
         r.id_rol,
         r.nombre as rol,
         u.estado
       from temo.usuarios u
       join temo.roles r on r.id_rol = u.id_rol
       order by u.nombre_completo`,
    );

    return result.rows;
  }

  @Get('operational-entities')
  async operationalEntities() {
    return this.entidadesBancarias();
  }

  @Get('entidades-bancarias')
  async entidadesBancarias() {
    const result = await this.db.query(
      `select
         id_entidad as id,
         codigo,
         nombre_corto,
         nombre_largo,
         tipo,
         estado
       from temo.entidades_bancarias
       order by codigo`,
    );

    return result.rows;
  }

  @Get('currencies')
  async currencies() {
    return this.monedas();
  }

  @Get('monedas')
  async monedas() {
    const result = await this.db.query(
      `select
         id_moneda as id,
         codigo,
         nombre,
         simbolo,
         decimales,
         estado
       from temo.monedas
       order by codigo`,
    );

    return result.rows;
  }

  @Get('cuentas-bancarias')
  async cuentasBancarias(@Req() request: { user: AuthenticatedUser }) {
    const administrator = request.user.roleCode === 'JEFA';
    const transferOperator = request.user.roleCode === 'TRANSFERISTA';
    if (!administrator && !transferOperator && request.user.roleCode !== 'CAJERO') {
      throw new ForbiddenException('El perfil no tiene acceso a este catalogo.');
    }
    const result = await this.db.query(
      `select
         c.id_cuenta as id,
         c.alias,
         e.codigo as entidad,
         m.codigo as moneda,
         coalesce(string_agg(s.nombre, ', ' order by s.nombre) filter (where s.id_sucursal is not null), 'Global') as alcance,
         coalesce(string_agg(s.id_sucursal::text, ', ' order by s.nombre) filter (where s.id_sucursal is not null), '') as sucursal_ids,
         case when $1::boolean then coalesce(c.numero_cuenta, '') else '' end as numero_cuenta,
         c.estado,
         c.fecha_creacion
       from temo.cuentas_bancarias c
       join temo.entidades_bancarias e on e.id_entidad = c.id_entidad
       join temo.monedas m on m.id_moneda = c.id_moneda
       left join temo.cuentas_sucursales cs on cs.id_cuenta = c.id_cuenta
       left join temo.sucursales s on s.id_sucursal = cs.id_sucursal and (
         $1::boolean or (s.estado = 'ACTIVO' and ($3::boolean
         or exists (select 1 from temo.usuarios_sucursales assignment
                    where assignment.id_sucursal = s.id_sucursal and assignment.id_usuario = $2::uuid)
         or exists (select 1 from temo.turnos shift
                    where shift.id_sucursal = s.id_sucursal and shift.id_cajero = $2::uuid
                      and shift.estado in ('ABIERTO', 'PENDIENTE_APROBACION'))
       )))
       where $1::boolean or (
         c.estado = 'ACTIVO' and e.estado = 'ACTIVO' and m.estado = 'ACTIVO'
         and (
           $3::boolean
           or not exists (select 1 from temo.cuentas_sucursales scope where scope.id_cuenta = c.id_cuenta)
           or exists (
             select 1 from temo.cuentas_sucursales scope
             join temo.sucursales branch on branch.id_sucursal = scope.id_sucursal and branch.estado = 'ACTIVO'
             where scope.id_cuenta = c.id_cuenta and (
               exists (select 1 from temo.usuarios_sucursales assignment
                       where assignment.id_sucursal = scope.id_sucursal and assignment.id_usuario = $2::uuid)
               or exists (select 1 from temo.turnos shift
                          where shift.id_sucursal = scope.id_sucursal and shift.id_cajero = $2::uuid
                            and shift.estado in ('ABIERTO', 'PENDIENTE_APROBACION'))
             )
           )
         )
       )
       group by c.id_cuenta, c.alias, e.codigo, m.codigo, c.numero_cuenta, c.estado, c.consecutivo, c.fecha_creacion
       order by e.codigo, m.codigo, c.consecutivo`,
      [administrator, request.user.id, transferOperator],
    );

    return result.rows;
  }

  @Get('sucursales')
  async sucursales(@Req() request: { user: AuthenticatedUser }) {
    const administrator = request.user.roleCode === 'JEFA';
    const transferOperator = request.user.roleCode === 'TRANSFERISTA';
    if (!administrator && !transferOperator && request.user.roleCode !== 'CAJERO') {
      throw new ForbiddenException('El perfil no tiene acceso a este catalogo.');
    }
    const result = await this.db.query(
       `select
         s.id_sucursal as id,
         s.codigo,
         s.nombre,
         case when $1::boolean then coalesce(string_agg(distinct u.nombre_completo, ', ') filter (where u.id_usuario is not null), '') else '' end as cajeros,
         case when $1::boolean then coalesce(string_agg(distinct u.id_usuario::text, ', ') filter (where u.id_usuario is not null), '') else '' end as cajero_ids,
         case when $1::boolean then coalesce(string_agg(distinct c.alias, ', ') filter (where c.id_cuenta is not null), '') else '' end as cuentas,
         case when $1::boolean then coalesce(string_agg(distinct c.id_cuenta::text, ', ') filter (where c.id_cuenta is not null), '') else '' end as cuenta_ids,
         s.estado
       from temo.sucursales s
       left join temo.usuarios_sucursales us on us.id_sucursal = s.id_sucursal
       left join temo.usuarios u on u.id_usuario = us.id_usuario and u.estado = 'ACTIVO'
       left join temo.cuentas_sucursales cs on cs.id_sucursal = s.id_sucursal
       left join temo.cuentas_bancarias c on c.id_cuenta = cs.id_cuenta
       where $1::boolean or (s.estado = 'ACTIVO' and (
         $3::boolean
         or exists (select 1 from temo.usuarios_sucursales assignment
                    where assignment.id_sucursal = s.id_sucursal and assignment.id_usuario = $2::uuid)
         or exists (select 1 from temo.turnos shift
                    where shift.id_sucursal = s.id_sucursal and shift.id_cajero = $2::uuid
                      and shift.estado in ('ABIERTO', 'PENDIENTE_APROBACION'))
       ))
       group by s.id_sucursal, s.codigo, s.nombre, s.estado
       order by s.nombre`,
      [administrator, request.user.id, transferOperator],
    );

    return result.rows;
  }

  @Get('movimientos-bancarios')
  async movimientosBancarios() {
    const result = await this.db.query(
       `select
         mv.id_movimiento as id,
         cm.codigo_operativo as codigo,
         cm.nombre_operativo as nombre,
         case
           when bool_or(ef.direccion_efectivo = 'SALE') and not bool_or(ef.direccion_efectivo = 'ENTRA') then 'Salida'
           else 'Ingreso'
         end as direccion,
         string_agg(distinct e.codigo, ', ' order by e.codigo) as bancos,
         string_agg(distinct mo.codigo, ', ' order by mo.codigo) as monedas,
         string_agg(distinct cm.id_cuenta_movimiento::text, ', ' order by cm.id_cuenta_movimiento::text) as mapeo_ids,
         mv.estado
       from temo.cuentas_movimientos cm
       join temo.cuentas_bancarias c on c.id_cuenta = cm.id_cuenta
       join temo.entidades_bancarias e on e.id_entidad = c.id_entidad
       join temo.monedas mo on mo.id_moneda = c.id_moneda
       join temo.movimientos mv on mv.id_movimiento = cm.id_movimiento
       left join temo.efectos_movimientos ef on ef.id_cuenta_movimiento = cm.id_cuenta_movimiento
       where cm.estado = 'ACTIVO'
       group by mv.id_movimiento, cm.codigo_operativo, cm.nombre_operativo, mv.estado
       order by cm.nombre_operativo, cm.codigo_operativo`,
    );

    return result.rows;
  }

  @Get('reglas-comisiones')
  async reglasComisiones(@Req() request: { user: AuthenticatedUser }) {
    this.requireAdministrator(request.user);
    const result = await this.db.query(
      `select
         rc.id_comision as id,
         e.codigo as entidad_bancaria,
         mo.codigo as moneda,
         mv.nombre as movimiento,
         coalesce(mc.codigo, '') as moneda_comision,
         rc.tipo_calculo,
         rc.porcentaje,
         rc.monto_fijo,
         rc.rango_inicio,
         rc.rango_fin,
         rc.estado
       from temo.reglas_comisiones rc
       join temo.entidades_bancarias e on e.id_entidad = rc.id_entidad
       join temo.monedas mo on mo.id_moneda = rc.id_moneda
       left join temo.monedas mc on mc.id_moneda = rc.id_moneda_comision
       join temo.movimientos mv on mv.id_movimiento = rc.id_movimiento
       order by e.codigo, mo.codigo, mv.nombre, rc.rango_inicio nulls first`,
    );

    return result.rows;
  }

  private requireAdministrator(user: AuthenticatedUser) {
    if (user.roleCode !== 'JEFA') {
      throw new ForbiddenException('Esta operacion requiere el perfil Administrador.');
    }
  }
}
