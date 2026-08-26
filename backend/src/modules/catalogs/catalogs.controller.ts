import { Body, Controller, Get, Param, Post, Put, Req } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/auth.service';
import { DatabaseService } from '../database/database.service';
import { CatalogsService } from './catalogs.service';

@Controller('catalogs')
export class CatalogsController {
  constructor(
    private readonly db: DatabaseService,
    private readonly catalogs: CatalogsService,
  ) {}

  @Post(':resource')
  saveNew(
    @Param('resource') resource: string,
    @Body() body: Record<string, unknown>,
    @Req() request: { user: AuthenticatedUser },
  ) {
    return this.catalogs.save(resource, undefined, body, request.user);
  }

  @Put(':resource/:id')
  saveExisting(
    @Param('resource') resource: string,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Req() request: { user: AuthenticatedUser },
  ) {
    return this.catalogs.save(resource, id, body, request.user);
  }

  @Get('roles')
  async roles() {
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

  @Get('usuarios')
  async usuarios() {
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
  async cuentasBancarias() {
    const result = await this.db.query(
      `select
         c.id_cuenta as id,
         c.alias,
         e.codigo as entidad,
         m.codigo as moneda,
         coalesce(string_agg(s.nombre, ', ' order by s.nombre) filter (where s.id_sucursal is not null), 'Global') as alcance,
         coalesce(string_agg(s.id_sucursal::text, ', ' order by s.nombre) filter (where s.id_sucursal is not null), '') as sucursal_ids,
         coalesce(c.numero_cuenta, '') as numero_cuenta,
         c.estado,
         c.fecha_creacion
       from temo.cuentas_bancarias c
       join temo.entidades_bancarias e on e.id_entidad = c.id_entidad
       join temo.monedas m on m.id_moneda = c.id_moneda
       left join temo.cuentas_sucursales cs on cs.id_cuenta = c.id_cuenta
       left join temo.sucursales s on s.id_sucursal = cs.id_sucursal
       group by c.id_cuenta, c.alias, e.codigo, m.codigo, c.numero_cuenta, c.estado, c.consecutivo, c.fecha_creacion
       order by e.codigo, m.codigo, c.consecutivo`,
    );

    return result.rows;
  }

  @Get('sucursales')
  async sucursales() {
    const result = await this.db.query(
       `select
         s.id_sucursal as id,
         s.codigo,
         s.nombre,
         coalesce(string_agg(distinct u.nombre_completo, ', ') filter (where u.id_usuario is not null), '') as cajeros,
         coalesce(string_agg(distinct u.id_usuario::text, ', ') filter (where u.id_usuario is not null), '') as cajero_ids,
         coalesce(string_agg(distinct c.alias, ', ') filter (where c.id_cuenta is not null), '') as cuentas,
         coalesce(string_agg(distinct c.id_cuenta::text, ', ') filter (where c.id_cuenta is not null), '') as cuenta_ids,
         s.estado
       from temo.sucursales s
       left join temo.usuarios_sucursales us on us.id_sucursal = s.id_sucursal
       left join temo.usuarios u on u.id_usuario = us.id_usuario and u.estado = 'ACTIVO'
       left join temo.cuentas_sucursales cs on cs.id_sucursal = s.id_sucursal
       left join temo.cuentas_bancarias c on c.id_cuenta = cs.id_cuenta
       group by s.id_sucursal, s.codigo, s.nombre, s.estado
       order by s.nombre`,
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
  async reglasComisiones() {
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
}
