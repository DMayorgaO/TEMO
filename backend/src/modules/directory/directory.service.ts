import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PoolClient } from 'pg';
import { AuthenticatedUser } from '../auth/auth.service';
import { DatabaseService } from '../database/database.service';
import { DirectoryEntryInput, DirectoryUpdateInput } from './directory.schema';
import { financialRequest } from '../../common/financial-request';
import { requireSessionVersion } from '../../common/session-version';

@Injectable()
export class DirectoryService {
  constructor(private readonly db: DatabaseService) {}

  async list() {
    const result = await this.db.query(this.selectDirectory());
    return result.rows.map(row => this.withVersion(row));
  }

  async detail(id: string) {
    const result = await this.db.query(`${this.selectDirectory()} where d.id_destinatario = $1`, [id]);
    if (!result.rows[0]) throw new NotFoundException('El registro del directorio no existe.');
    return this.withVersion(result.rows[0]);
  }

  async create(input: DirectoryEntryInput, user: AuthenticatedUser) {
    this.requireDirectoryManager(user);
    this.requireRequestId(input.requestId);
    return this.db.transaction(async (client) => {
      const receipt = await financialRequest(client, { actor:user,operation:'CREAR_DIRECTORIO',requestId:input.requestId,payload:input,roles:['JEFA','CAJERO'] }, async () => {
      const inserted = await client.query<{ id: string }>(
        `insert into temo.directorio_destinatarios
           (nombre, observaciones, estado, id_usuario_creacion)
         values ($1, nullif($2, ''), $3, $4)
         returning id_destinatario as id`,
        [input.name, input.observations, input.status, user.id],
      );
      const id = inserted.rows[0].id;
      await this.replaceChildren(client, id, input);
      const saved=await this.detailWithin(client,id);
      await this.audit(client, user.id, 'CREAR', id,null,saved);
      return { id };
      }, result => this.authorizeReplay(client,result.id));
      return this.detailWithin(client,receipt.id);
    });
  }

  async update(id: string, input: DirectoryUpdateInput, user: AuthenticatedUser) {
    this.requireDirectoryManager(user);
    this.requireRequestId(input.requestId);
    return this.db.transaction(async (client) => {
      const receipt = await financialRequest(client, { actor:user,operation:'EDITAR_DIRECTORIO',requestId:input.requestId,payload:{id:id.toLowerCase(),...input},roles:['JEFA','CAJERO'] }, async () => {
      if (!/^[a-f0-9]{64}$/.test(input.expectedVersion ?? '')) {
        throw new BadRequestException('Vuelva a abrir el destinatario antes de guardar los cambios.');
      }
      const locked=await client.query('select id_destinatario from temo.directorio_destinatarios where id_destinatario=$1 for update',[id]);
      if(!locked.rowCount)throw new NotFoundException('El registro del directorio no existe.');
      const before=await this.detailWithin(client,id);
      if (before.edit_version !== input.expectedVersion) {
        throw new ConflictException('El destinatario cambio desde que lo abrio. Sus cambios no se guardaron. Cierre esta ventana y vuelva a abrir el registro para revisar la informacion actual.');
      }
      const updated = await client.query(
        `update temo.directorio_destinatarios
         set nombre = $2, observaciones = nullif($3, ''), estado = $4,
             id_usuario_modificacion = $5, fecha_modificacion = now()
         where id_destinatario = $1
         returning id_destinatario`,
        [id, input.name, input.observations, input.status, user.id],
      );
      if (!updated.rowCount) throw new NotFoundException('El registro del directorio no existe.');
      await this.replaceChildren(client, id, input);
      const saved=await this.detailWithin(client,id);
      await this.audit(client, user.id, before.status==='ACTIVO'&&saved.status==='INACTIVO'?'ANULAR':'ACTUALIZAR', id,before,saved);
      return { id };
      }, result => this.authorizeReplay(client,result.id));
      return this.detailWithin(client,receipt.id);
    });
  }

  private selectDirectory() {
    return `select
      d.id_destinatario as database_id,
      concat('DIR-', lpad(d.codigo_destinatario::text, 5, '0')) as id,
      d.nombre as name,
      coalesce(d.observaciones, '') as observations,
      d.estado as status,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'institution', i.institucion, 'type', i.tipo, 'number', i.numero, 'currency', m.codigo
        ) order by i.orden, i.fecha_creacion)
        from temo.directorio_identificadores i
        left join temo.monedas m on m.id_moneda = i.id_moneda
        where i.id_destinatario = d.id_destinatario
      ), '[]'::jsonb) as identifiers,
      coalesce((
        select jsonb_agg(jsonb_build_object('number', c.numero, 'holder', coalesce(c.titular, '')) order by c.orden)
        from temo.directorio_cedulas c where c.id_destinatario = d.id_destinatario
      ), '[]'::jsonb) as identities,
      coalesce((
        select jsonb_agg(r.referencia order by r.orden)
        from temo.directorio_referencias r where r.id_destinatario = d.id_destinatario
      ), '[]'::jsonb) as references,
      coalesce((
        select jsonb_agg(jsonb_build_object('sheet', f.hoja, 'row', f.fila) order by f.hoja, f.fila)
        from temo.directorio_fuentes_importacion f where f.id_destinatario = d.id_destinatario
      ), '[]'::jsonb) as sources
      from temo.directorio_destinatarios d`;
  }

  private async detailWithin(client: PoolClient, id: string) {
    const result = await client.query(`${this.selectDirectory()} where d.id_destinatario = $1`, [id]);
    return this.withVersion(result.rows[0]);
  }

  private withVersion(row: Record<string, unknown>): Record<string, unknown> & { edit_version: string } {
    // Hash the current stored snapshot, never the client's submitted replacement.
    const snapshot = [row.database_id, row.name, row.status, row.observations,
      row.identifiers, row.identities, row.references, row.sources];
    return { ...row, edit_version: createHash('sha256').update(JSON.stringify(snapshot)).digest('hex') };
  }

  private async replaceChildren(client: PoolClient, id: string, input: DirectoryEntryInput) {
    await client.query('delete from temo.directorio_identificadores where id_destinatario = $1', [id]);
    await client.query('delete from temo.directorio_cedulas where id_destinatario = $1', [id]);
    await client.query('delete from temo.directorio_referencias where id_destinatario = $1', [id]);

    for (const [index, identifier] of input.identifiers.entries()) {
      const currency = identifier.currency
        ? await client.query<{ id: string }>('select id_moneda as id from temo.monedas where codigo = $1', [identifier.currency])
        : null;
      await client.query(
        `insert into temo.directorio_identificadores
           (id_destinatario, institucion, tipo, numero, id_moneda, orden)
         values ($1, $2, $3, $4, $5, $6)`,
        [id, identifier.institution, identifier.type, this.formatNumber(identifier.number), currency?.rows[0]?.id ?? null, index + 1],
      );
    }
    for (const [index, identity] of input.identities.entries()) {
      await client.query(
        `insert into temo.directorio_cedulas (id_destinatario, numero, titular, orden)
         values ($1, upper($2), nullif($3, ''), $4)`,
        [id, identity.number, identity.holder, index + 1],
      );
    }
    for (const [index, reference] of input.references.entries()) {
      await client.query(
        `insert into temo.directorio_referencias (id_destinatario, referencia, orden)
         values ($1, $2, $3)`,
        [id, reference, index + 1],
      );
    }
  }

  private requireDirectoryManager(user: AuthenticatedUser) {
    if (!['JEFA', 'CAJERO'].includes(user.roleCode)||user.mustChangePassword) {
      throw new ForbiddenException('Tu usuario no puede administrar el directorio.');
    }
    requireSessionVersion(user.sessionVersion);
  }

  private requireRequestId(id: string) {
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id ?? '')) {
      throw new BadRequestException('Falta una referencia valida de guardado. Vuelva a abrir el formulario del directorio.');
    }
  }

  private async authorizeReplay(client: PoolClient, id: string) {
    // Identity is revalidated by financialRequest before looking up any receipt.
    // Return the current authorized entry, never a private snapshot stored in a receipt.
    const row = await client.query('select id_destinatario from temo.directorio_destinatarios where id_destinatario=$1 for update', [id]);
    if (!row.rowCount) throw new NotFoundException('La solicitud ya fue aplicada, pero el destinatario ya no esta disponible.');
  }

  private formatNumber(value: string) {
    const trimmed = value.trim();
    if (/[^A-Za-z0-9*]/.test(trimmed) || trimmed.replace(/^\*/, '').length <= 5) return trimmed;
    const prefix = trimmed.startsWith('*') ? '*' : '';
    const body = trimmed.replace(/^\*/, '');
    const sizes: number[] = [];
    let remaining = body.length;
    while (remaining > 0) {
      if (remaining % 4 === 0) {
        sizes.push(4);
        remaining -= 4;
      } else if (remaining % 3 === 0) {
        sizes.push(3);
        remaining -= 3;
      } else if (remaining > 7) {
        sizes.push(4);
        remaining -= 4;
      } else {
        sizes.push(3);
        remaining -= 3;
      }
    }
    let cursor = 0;
    return prefix + sizes.map((size) => {
      const group = body.slice(cursor, cursor + size);
      cursor += size;
      return group;
    }).join('-');
  }

  private audit(client: PoolClient, userId: string, action: string, id: string, before: Record<string,unknown>|null, after: Record<string,unknown>) {
    const count=(row:Record<string,unknown>,key:string)=>Array.isArray(row[key])?row[key].length:0;
    const snapshot=(row:Record<string,unknown>|null)=>row?{
      nombre:row.name,estado:row.status,identificadores:count(row,'identifiers'),cedulas:count(row,'identities'),referencias:count(row,'references'),
    }:null;
    // Audit presence and changes, never duplicate account/identity numbers or free-text notes.
    const tracked=['identifiers','identities','references','observations'];
    const changes=Object.fromEntries(tracked.map(key=>[`${key}_changed`,JSON.stringify(before?.[key]??null)!==JSON.stringify(after[key]??null)]));
    const previous=before?{...snapshot(before),...Object.fromEntries(tracked.map(key=>[`${key}_changed`,false]))}:null;
    return client.query(
      `insert into temo.bitacora (id_usuario, accion, tabla, id_registro,datos_anteriores,datos_nuevos)
       values ($1, $2, 'directorio_destinatarios', $3,$4::jsonb,$5::jsonb)`,
      [userId, action, id,JSON.stringify(previous),JSON.stringify({...snapshot(after),...changes})],
    );
  }
}
