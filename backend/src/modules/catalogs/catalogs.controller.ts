import { Controller, Get } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Controller('catalogs')
export class CatalogsController {
  constructor(private readonly db: DatabaseService) {}

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
         coalesce(c.numero_cuenta, '') as numero_cuenta,
         c.estado
       from temo.cuentas_bancarias c
       join temo.entidades_bancarias e on e.id_entidad = c.id_entidad
       join temo.monedas m on m.id_moneda = c.id_moneda
       left join temo.cuentas_sucursales cs on cs.id_cuenta = c.id_cuenta
       left join temo.sucursales s on s.id_sucursal = cs.id_sucursal
       group by c.id_cuenta, c.alias, e.codigo, m.codigo, c.numero_cuenta, c.estado, c.consecutivo
       order by e.codigo, m.codigo, c.consecutivo`,
    );

    return result.rows;
  }

  @Get('sucursales')
  async sucursales() {
    const result = await this.db.query(
      `select
         s.id_sucursal as id,
         s.nombre,
         coalesce(string_agg(distinct u.nombre_completo, ', ') filter (where u.id_usuario is not null), '') as cajeros,
         coalesce(string_agg(distinct c.alias, ', ') filter (where c.id_cuenta is not null), '') as cuentas,
         s.estado
       from temo.sucursales s
       left join temo.cajas cj on cj.id_sucursal = s.id_sucursal
       left join temo.turnos t on t.id_caja = cj.id_caja
       left join temo.usuarios u on u.id_usuario = t.id_cajero
       left join temo.cuentas_sucursales cs on cs.id_sucursal = s.id_sucursal
       left join temo.cuentas_bancarias c on c.id_cuenta = cs.id_cuenta
       group by s.id_sucursal, s.nombre, s.estado
       order by s.nombre`,
    );

    return result.rows;
  }

  @Get('movimientos-bancarios')
  async movimientosBancarios() {
    const result = await this.db.query(
      `select
         mv.id_movimiento as id,
         string_agg(distinct cm.codigo_operativo, ', ' order by cm.codigo_operativo) as codigo,
         mv.nombre,
         string_agg(distinct e.codigo, ', ' order by e.codigo) as bancos,
         string_agg(distinct mo.codigo, ', ' order by mo.codigo) as monedas,
         mv.estado
       from temo.cuentas_movimientos cm
       join temo.cuentas_bancarias c on c.id_cuenta = cm.id_cuenta
       join temo.entidades_bancarias e on e.id_entidad = c.id_entidad
       join temo.monedas mo on mo.id_moneda = c.id_moneda
       join temo.movimientos mv on mv.id_movimiento = cm.id_movimiento
       group by mv.id_movimiento, mv.nombre, mv.estado
       order by mv.nombre`,
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
