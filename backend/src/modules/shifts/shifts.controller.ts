import { Controller, Get } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Controller('shifts')
export class ShiftsController {
  constructor(private readonly db: DatabaseService) {}

  @Get()
  async listShifts() {
    const result = await this.db.query(
      `select
         t.id_turno as id,
         t.estado,
         t.fecha_apertura,
         t.fecha_cierre,
         t.efectivo_inicial_nio,
         t.efectivo_inicial_usd,
         t.efectivo_final_nio,
         t.efectivo_final_usd,
         t.observaciones_apertura,
         t.observaciones_cierre,
         s.id_sucursal,
         s.nombre as sucursal,
         c.id_caja,
         c.nombre as caja,
         u.id_usuario as id_cajero,
         u.nombre_completo as cajero
       from temo.turnos t
       join temo.sucursales s on s.id_sucursal = t.id_sucursal
       join temo.cajas c on c.id_caja = t.id_caja
       join temo.usuarios u on u.id_usuario = t.id_cajero
       order by t.fecha_apertura desc`,
    );

    return result.rows;
  }

  @Get('open')
  async openShifts() {
    const result = await this.db.query(
      `select
         t.id_turno as id,
         t.estado,
         t.fecha_apertura,
         t.efectivo_inicial_nio,
         t.efectivo_inicial_usd,
         s.nombre as sucursal,
         c.nombre as caja,
         u.nombre_completo as cajero
       from temo.turnos t
       join temo.sucursales s on s.id_sucursal = t.id_sucursal
       join temo.cajas c on c.id_caja = t.id_caja
       join temo.usuarios u on u.id_usuario = t.id_cajero
       where t.estado in ('ABIERTO', 'PENDIENTE_APROBACION')
       order by t.fecha_apertura desc`,
    );

    return result.rows;
  }
}
