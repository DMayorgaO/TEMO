import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PoolClient } from 'pg';
import { AuthenticatedUser } from '../modules/auth/auth.service';

export async function validateFinancialActor(client: PoolClient, actor: AuthenticatedUser, roles: string[]) {
  if(!roles.includes(actor.roleCode)||actor.mustChangePassword)throw new ForbiddenException('Su perfil no permite esta operacion financiera.');
  const current=await client.query(`select 1 from temo.usuarios u join temo.roles r using(id_rol)
    where u.id_usuario=$1 and u.estado='ACTIVO' and r.estado='ACTIVO' and r.codigo=$2
      and not u.debe_cambiar_contrasena and ($3::integer is null or u.version_sesion=$3)
    for share of u,r`,[actor.id,actor.roleCode,actor.sessionVersion??null]);
  if(!current.rowCount)throw new ForbiddenException('La sesion o los permisos cambiaron. Inicie sesion nuevamente.');
}

export async function financialRequest<T>(client: PoolClient,
  input: {actor?:AuthenticatedUser;operation:'CREAR_TRANSACCIONES'|'CREAR_TRANSFERENCIA'|'LIQUIDAR_PENDIENTE'|'LIQUIDAR_PENDIENTES'|'EDITAR_TRANSACCION'|'ANULAR_TRANSACCION'|'EDITAR_GRUPO';requestId?:string;payload:unknown;roles:string[]},
  work:()=>Promise<T>, authorizeReplay:(result:T)=>Promise<void>) {
  if(input.actor)await validateFinancialActor(client,input.actor,input.roles);
  if(!input.requestId)return work();
  if(!input.actor)throw new ForbiddenException('La solicitud requiere una identidad autenticada.');
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(input.requestId))throw new BadRequestException('Referencia de solicitud invalida.');
  const canonical=(value:unknown):unknown=>{
    if(Array.isArray(value))return value.map(canonical);
    if(value!==null&&typeof value==='object')return Object.fromEntries(Object.entries(value)
      .filter(([key])=>key!=='requestId').sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonical(item)]));
    return value;
  };
  const hash=createHash('sha256').update(JSON.stringify(canonical(input.payload))).digest('hex');
  const key=[input.actor.id,input.operation,input.requestId.toLowerCase()];
  // Solo serializa solicitudes con la misma identidad, operacion y referencia.
  await client.query(`select pg_advisory_xact_lock(hashtextextended($1,741260826))`,[key.join(':')]);
  const previous=await client.query(`select huella,resultado from temo.solicitudes_financieras
    where id_usuario=$1 and operacion=$2 and id_solicitud=$3`,key);
  if(previous.rowCount){
    if(previous.rows[0].huella!==hash)throw new ConflictException('Esta solicitud ya fue aplicada con otros datos. No repita el registro; revise la operacion original.');
    await authorizeReplay(previous.rows[0].resultado as T);
    return previous.rows[0].resultado as T;
  }
  const result=await work();
  await client.query(`insert into temo.solicitudes_financieras(id_usuario,operacion,id_solicitud,huella,resultado)
    values($1,$2,$3,$4,$5::jsonb)`,[...key,hash,JSON.stringify(result)]);
  return result;
}
