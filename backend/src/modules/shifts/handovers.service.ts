import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';
import { AuthenticatedUser } from '../auth/auth.service';
import { ShiftsService } from './shifts.service';
import { createHash, randomUUID } from 'node:crypto';
import { assertShiftNotSubmitted } from '../../common/shift-submission-lock';
import { requireSessionVersion } from '../../common/session-version';

@Injectable()
export class HandoversService {
  constructor(private readonly db: DatabaseService, private readonly shifts: ShiftsService) {}

  private cashier(user: AuthenticatedUser) {
    if (user.roleCode !== 'CAJERO' || user.mustChangePassword) throw new ForbiddenException('El traspaso requiere una sesion de cajero.');
    return requireSessionVersion(user.sessionVersion);
  }

  private async expire(client: { query(text: string, params?: unknown[]): Promise<unknown> }) {
    await client.query(`update temo.traspasos_turno set estado='VENCIDO',fecha_resolucion=now()
      where estado='PENDIENTE' and fecha_limite<=clock_timestamp()`);
  }

  private async lock(client: PoolClient) {
    // Las instantaneas y la aceptacion deben ver tambien movimientos de otros operadores.
    // Bloqueo corto de escritura; nunca se mantiene mientras un humano revisa el resumen.
    await client.query(`lock table temo.turnos,temo.arqueos,temo.arqueos_denominaciones,
      temo.saldos_turno_cuentas,temo.transacciones,temo.transacciones_montos,temo.transferencias,
      temo.movimientos_cuentas,temo.movimientos_efectivo,temo.abonos_pendientes,temo.pagos_pendientes,
      temo.tipos_cambio,temo.traspasos_turno,temo.usuarios,temo.roles,temo.usuarios_sucursales,
      temo.cajas,temo.sucursales,temo.cuentas_bancarias,temo.cuentas_sucursales
      in share row exclusive mode`);
    await this.expire(client);
  }

  private async actor(client: PoolClient, user: AuthenticatedUser) {
    const version = this.cashier(user);
    const result = await client.query(`select 1 from temo.usuarios u join temo.roles r using(id_rol)
      where u.id_usuario=$1 and u.estado='ACTIVO' and not u.debe_cambiar_contrasena and r.estado='ACTIVO' and r.codigo='CAJERO'
      and u.version_sesion=$2`, [user.id, version]);
    if (!result.rowCount) throw new ForbiddenException('La sesion del cajero ya no es valida.');
  }

  async list(user: AuthenticatedUser) {
    if (!['CAJERO','JEFA'].includes(user.roleCode)) throw new ForbiddenException();
    await this.expire(this.db);
    const rows = await this.db.query(`select h.*,u.nombre_completo as emisor,v.nombre_completo as receptor,
      concat('TUR-',lpad(t.codigo_turno::text,6,'0')) as turno_origen,s.nombre as sucursal,c.nombre as caja
      from temo.traspasos_turno h join temo.turnos t on t.id_turno=h.id_turno_origen
      join temo.usuarios u on u.id_usuario=h.id_emisor join temo.usuarios v on v.id_usuario=h.id_receptor
      join temo.sucursales s on s.id_sucursal=t.id_sucursal join temo.cajas c on c.id_caja=t.id_caja
      where h.estado='PENDIENTE' and ($1='JEFA' or h.id_emisor=$2 or h.id_receptor=$2)
      order by h.fecha_creacion`, [user.roleCode, user.id]);
    return rows.rows;
  }

  async candidates(shiftId: string, user: AuthenticatedUser) {
    this.cashier(user);
    const result = await this.db.query(`select u.id_usuario as id,u.nombre_completo as nombre
      from temo.usuarios u join temo.roles r using(id_rol)
      join temo.usuarios_sucursales us using(id_usuario)
      join temo.turnos t on t.id_sucursal=us.id_sucursal
      where t.id_turno=$1 and t.id_cajero=$2 and t.estado='ABIERTO'
      and u.id_usuario<>$2 and u.estado='ACTIVO' and r.codigo='CAJERO' and r.estado='ACTIVO'
      and not exists(select 1 from temo.turnos x where x.id_cajero=u.id_usuario
        and x.estado in ('ABIERTO','PENDIENTE_APERTURA','PENDIENTE_APROBACION'))
      and not exists(select 1 from temo.traspasos_turno h where h.id_receptor=u.id_usuario
        and h.estado='PENDIENTE' and h.fecha_limite>now()) order by u.nombre_completo`, [shiftId,user.id]);
    return result.rows;
  }

  private async eligible(client: PoolClient, shiftId: string, sender: string, receiver: string) {
    const result = await client.query(`select t.id_turno,t.id_sucursal,t.id_caja from temo.turnos t
      join temo.sucursales s using(id_sucursal) join temo.cajas c using(id_caja)
      join temo.usuarios u on u.id_usuario=$3 join temo.roles r on r.id_rol=u.id_rol
      join temo.usuarios emisor on emisor.id_usuario=t.id_cajero
      join temo.roles rol_emisor on rol_emisor.id_rol=emisor.id_rol
      join temo.usuarios_sucursales us on us.id_usuario=u.id_usuario and us.id_sucursal=t.id_sucursal
      where t.id_turno=$1 and t.id_cajero=$2 and t.estado='ABIERTO' and $2<>$3
      and s.estado='ACTIVO' and c.estado='ACTIVO' and u.estado='ACTIVO' and r.codigo='CAJERO' and r.estado='ACTIVO'
      and emisor.estado='ACTIVO' and rol_emisor.codigo='CAJERO' and rol_emisor.estado='ACTIVO'
      and not exists(select 1 from temo.turnos x where x.id_cajero=$3
        and x.estado in ('ABIERTO','PENDIENTE_APERTURA','PENDIENTE_APROBACION'))
      and not exists(select 1 from temo.turnos x where x.id_caja=t.id_caja and x.id_turno<>t.id_turno
        and x.estado in ('ABIERTO','PENDIENTE_APERTURA','PENDIENTE_APROBACION'))
      and not exists(select 1 from temo.solicitudes_cierre_turno sc where sc.id_turno=t.id_turno and sc.estado='PENDIENTE')`,
    [shiftId,sender,receiver]);
    if (!result.rowCount) throw new ConflictException('El turno o el receptor ya no estan disponibles para el traspaso.');
    return result.rows[0];
  }

  private version(snapshot: unknown) {
    // Las marcas de refresco no cambian la entrega; los valores financieros si.
    const canonical=(value: unknown): unknown=>{
      if(value instanceof Date)return value.toJSON();
      if(Array.isArray(value))return value.map(canonical);
      if(value!==null&&typeof value==='object')return Object.fromEntries(Object.entries(value)
        .filter(([key])=>key!=='updated_at').sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonical(item)]));
      return value;
    };
    return createHash('sha256').update(JSON.stringify(canonical(snapshot))).digest('hex');
  }

  async preview(shiftId: string, user: AuthenticatedUser) {
    this.cashier(user);
    return this.db.transaction(async client=>{
      await this.lock(client); await this.actor(client,user);
      await assertShiftNotSubmitted(client,shiftId,user);
      const own=await client.query(`select 1 from temo.turnos where id_turno=$1 and id_cajero=$2 and estado='ABIERTO'`,[shiftId,user.id]);
      if (!own.rowCount) throw new ForbiddenException('Solo puede traspasar su turno abierto.');
      const snapshot=await this.shifts.handoverSnapshot(client,shiftId);
      return {snapshot,version:this.version(snapshot),requestId:randomUUID()};
    });
  }

  async propose(shiftId: string, input: { requestId: string; receiverId: string; expectedVersion: string; observations?: string; mode?: 'CON_CIERRE'|'EN_REVISION' }, user: AuthenticatedUser) {
    this.cashier(user);
    return this.db.transaction(async client => {
      await this.lock(client); await this.actor(client,user);
      const previous = await client.query('select * from temo.traspasos_turno where id_traspaso=$1',[input.requestId]);
      if (previous.rowCount) {
        const row=previous.rows[0];
        if (row.id_emisor!==user.id || row.id_receptor!==input.receiverId || row.id_turno_origen!==shiftId) throw new ConflictException('La referencia de traspaso ya fue utilizada.');
        if ((row.observaciones||'')!==(input.observations||'')) throw new ConflictException('La propuesta ya fue enviada con otras observaciones. Cancelela antes de crear otra.');
        if (row.modo!==(input.mode||'CON_CIERRE')) throw new ConflictException('La propuesta ya fue enviada con otro modo de cierre.');
        if (!['PENDIENTE','ACEPTADO'].includes(row.estado)) throw new ConflictException('Esta propuesta ya fue resuelta o vencio. Prepare un traspaso nuevo.');
        return row;
      }
      await this.eligible(client,shiftId,user.id,input.receiverId);
      if ((await client.query(`select 1 from temo.traspasos_turno where estado='PENDIENTE'
        and (id_turno_origen=$1 or id_receptor=$2)`,[shiftId,input.receiverId])).rowCount) throw new ConflictException('Ya existe un traspaso pendiente.');
      const snapshot=await this.shifts.handoverSnapshot(client,shiftId);
      if (this.version(snapshot)!==input.expectedVersion) throw new ConflictException('El resumen cambio. Cierre esta ventana y revise una propuesta nueva.');
      const row=await client.query(`insert into temo.traspasos_turno(id_traspaso,id_turno_origen,id_emisor,id_receptor,resumen,observaciones,modo)
        values($1,$2,$3,$4,$5::jsonb,$6,$7) returning *`,[input.requestId,shiftId,user.id,input.receiverId,JSON.stringify(snapshot),input.observations||'',input.mode||'CON_CIERRE']);
      await this.audit(client,user.id,input.requestId,'SOLICITAR_TRASPASO',{shiftId,receiverId:input.receiverId,observations:input.observations||'',mode:input.mode||'CON_CIERRE',state:'PENDIENTE',...this.auditAmounts(snapshot)});
      return row.rows[0];
    });
  }

  async registerDifference(shiftId: string, expectedVersion: string, user: AuthenticatedUser) {
    this.cashier(user);
    return this.db.transaction(async client=>{
      await this.lock(client); await this.actor(client,user);
      await assertShiftNotSubmitted(client,shiftId,user);
      const own=await client.query(`select 1 from temo.turnos where id_turno=$1 and id_cajero=$2 and estado='ABIERTO'`,[shiftId,user.id]);
      if(!own.rowCount)throw new ForbiddenException('Solo puede registrar diferencias en su turno abierto.');
      const before=await this.shifts.handoverSnapshot(client,shiftId);
      if(this.version(before)!==expectedVersion)throw new ConflictException('El resumen cambio. Prepare un traspaso nuevo antes de registrar la diferencia.');
      await client.query(`update temo.turnos set cambio_nio=round(cambio_nio+$2::numeric,4),fecha_modificacion=now() where id_turno=$1`,[shiftId,before.pendingCashDifference]);
      const snapshot=await this.shifts.handoverSnapshot(client,shiftId);
      await client.query(`insert into temo.bitacora(id_usuario,accion,tabla,id_registro,datos_anteriores,datos_nuevos)
        values($1,'ACTUALIZAR','turnos',$2,$3::jsonb,$4::jsonb)`,[user.id,shiftId,
      JSON.stringify({changeNio:Number(before.changeNio)}),JSON.stringify({evento:'REGISTRAR_DIFERENCIA',changeNio:Number(snapshot.changeNio),incremento:before.pendingCashDifference})]);
      return {snapshot,version:this.version(snapshot),requestId:randomUUID()};
    });
  }

  async resolve(id: string, action: 'accept'|'reject'|'cancel', user: AuthenticatedUser) {
    this.cashier(user);
    return this.db.transaction(async client => {
      await this.lock(client); await this.actor(client,user);
      const result=await client.query('select * from temo.traspasos_turno where id_traspaso=$1 for update',[id]);
      const row=result.rows[0];
      if (!row || ![row.id_emisor,row.id_receptor].includes(user.id)) throw new NotFoundException('El traspaso no esta disponible.');
      if (action==='cancel' ? row.id_emisor!==user.id : row.id_receptor!==user.id) throw new ForbiddenException('Esta accion corresponde al otro cajero.');
      if (row.estado==='ACEPTADO' && action==='accept') return row;
      if (row.estado!=='PENDIENTE') throw new ConflictException('El traspaso ya fue resuelto o vencio.');
      if (action!=='accept') {
        const updated=await client.query(`update temo.traspasos_turno set estado=$2,fecha_resolucion=now() where id_traspaso=$1 returning *`,[id,action==='cancel'?'CANCELADO':'RECHAZADO']);
        await this.audit(client,user.id,id,action==='cancel'?'CANCELAR_TRASPASO':'RECHAZAR_TRASPASO',
          {source:row.id_turno_origen,sender:row.id_emisor,receiver:row.id_receptor,mode:row.modo,state:updated.rows[0].estado},
          {detalle:{state:row.estado}});
        return updated.rows[0];
      }
      await this.eligible(client,row.id_turno_origen,row.id_emisor,row.id_receptor);
      const snapshot=await this.shifts.handoverSnapshot(client,row.id_turno_origen);
      if (this.version(snapshot)!==this.version(row.resumen)) throw new ConflictException('Los datos cambiaron. El emisor debe cancelar esta propuesta y enviar un resumen nuevo.');
      const newId=await this.shifts.finalizeHandover(client,row.id_turno_origen,row.id_emisor,user.id,snapshot,id,row.observaciones||'',row.modo);
      const updated=await client.query(`update temo.traspasos_turno set estado='ACEPTADO',id_turno_destino=$2,fecha_resolucion=now()
        where id_traspaso=$1 returning *`,[id,newId]);
      await this.audit(client,user.id,id,'ACEPTAR_TRASPASO',{source:row.id_turno_origen,destination:newId,sender:row.id_emisor,receiver:user.id,snapshot,observations:row.observaciones||'',mode:row.modo,state:'ACEPTADO',sourceState:row.modo==='EN_REVISION'?'EN_REVISION':'CERRADO',...this.auditAmounts(snapshot)},
        {detalle:{state:row.estado,sourceState:'ABIERTO',...this.auditAmounts(row.resumen)}});
      await client.query(`insert into temo.notificaciones_usuarios(id_usuario_destino,tipo,titulo,mensaje,id_turno,id_usuario_origen)
        select u.id_usuario,'TRASPASO_TURNO','Traspaso de turno realizado',
          concat(a.nombre_completo,' entrego ', 'TUR-',lpad(t.codigo_turno::text,6,'0'),
            ' a ',b.nombre_completo,'; nuevo turno TUR-',lpad(n.codigo_turno::text,6,'0'),
            case when t.estado='EN_REVISION' then '. Turno anterior en revision; cierre pendiente de aprobacion administrativa.' else '. Turno anterior cerrado.' end),t.id_turno,$2
        from temo.usuarios u join temo.roles r on r.id_rol=u.id_rol
        cross join temo.turnos t join temo.usuarios a on a.id_usuario=t.id_cajero
        cross join temo.turnos n join temo.usuarios b on b.id_usuario=n.id_cajero
        where u.estado='ACTIVO' and r.estado='ACTIVO' and r.codigo='JEFA' and t.id_turno=$1 and n.id_turno=$3`,
      [row.id_turno_origen,user.id,newId]);
      return updated.rows[0];
    });
  }

  private auditAmounts(snapshot:Awaited<ReturnType<ShiftsService['handoverSnapshot']>>) {
    return {cashNio:snapshot.totals.NIO,cashUsd:snapshot.totals.USD,registeredNio:Number(snapshot.changeNio),
      differenceNio:snapshot.pendingCashDifference,purchaseDifferenceNio:snapshot.dollarPurchases.differenceNio};
  }

  private async audit(client: PoolClient, actor: string, id: string, event: string, data: unknown, before:unknown=null) {
    await client.query(`insert into temo.bitacora(id_usuario,accion,tabla,id_registro,datos_anteriores,datos_nuevos)
      values($1,'ACTUALIZAR','traspasos_turno',$2,$5::jsonb,jsonb_build_object('evento',$3::text,'detalle',$4::jsonb))`,[actor,id,event,JSON.stringify(data),before===null?null:JSON.stringify(before)]);
  }
}
