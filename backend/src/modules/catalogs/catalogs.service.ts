import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PoolClient } from 'pg';
import { isIP } from 'node:net';
import { AuthenticatedUser } from '../auth/auth.service';
import { DatabaseService } from '../database/database.service';
import { validatePasswordForStorage } from '../../common/password-policy';

type CatalogPayload = Record<string, unknown>;

const writableCatalogs = new Set([
  'roles',
  'users',
  'banks',
  'branches',
  'accounts',
  'movements',
  'commissions',
]);
const protectedRoles = new Set(['JEFA', 'CAJERO', 'TRANSFERISTA']);
type AuditContext = { ip?: string; userAgent?: string };

@Injectable()
export class CatalogsService {
  constructor(private readonly db: DatabaseService) {}

  // Reemplaza la clave de un cajero, invalida sus sesiones y exige cambiarla al ingresar.
  async resetUserPassword(
    targetUserId: string,
    temporaryPassword: string,
    user: AuthenticatedUser,
    ip: string,
    userAgent: string,
  ) {
    this.requireBoss(user);
    this.validateTemporaryPassword(temporaryPassword);
    return this.db.transaction(async (client) => {
      await this.lockIdentityAdministration(client, user);
      const updated = await client.query<{ id: string; username: string }>(
        `update temo.usuarios target
         set contrasena_hash = crypt($2, gen_salt('bf', 12)),
             debe_cambiar_contrasena = true,
             version_sesion = version_sesion + 1,
             contrasena_modificada_en = now(),
             intentos_fallidos = 0,
             bloqueado_hasta = null,
             fecha_modificacion = now()
         from temo.roles role
         where target.id_usuario = $1
           and role.id_rol = target.id_rol
           and role.codigo = 'CAJERO'
           and target.estado = 'ACTIVO'
         returning target.id_usuario as id, target.usuario as username`,
        [targetUserId, temporaryPassword],
      );
      const target = updated.rows[0];
      if (!target) {
        throw new BadRequestException('Sólo se puede restablecer la contraseña de un cajero activo.');
      }
      await client.query(
        `insert into temo.bitacora
           (id_usuario, accion, tabla, id_registro, datos_nuevos, direccion_ip, agente_usuario)
         values ($1, 'ACTUALIZAR', 'usuarios', $2,
                 jsonb_build_object('evento', 'RESTABLECER_CONTRASENA', 'usuario', $3::text),
                 nullif($4, '')::inet, nullif($5, ''))`,
        [user.id, target.id, target.username, ip.replace(/^::ffff:/, '').trim().slice(0, 45), userAgent.slice(0, 1000)],
      );
      return { success: true, mustChangePassword: true };
    });
  }

  async save(
    resource: string,
    databaseId: string | undefined,
    payload: CatalogPayload,
    user: AuthenticatedUser,
    context: AuditContext = {},
  ) {
    this.requireBoss(user);
    if (!writableCatalogs.has(resource)) {
      throw new BadRequestException('El catalogo solicitado no admite modificaciones.');
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new BadRequestException('Los datos del catalogo no son validos.');
    if (resource === 'users' || resource === 'roles') {
      const keys = resource === 'users' ? ['firstName', 'nombres', 'lastName', 'apellidos', 'username', 'usuario',
        'email', 'correo', 'roleId', 'role', 'password', 'contrasena', 'status'] : ['code', 'name', 'description', 'status'];
      if (keys.some(key => payload[key] !== undefined && typeof payload[key] !== 'string')) {
        throw new BadRequestException('Los campos de usuario y rol deben contener texto.');
      }
      const status = this.text(payload.status ?? 'ACTIVO').toUpperCase();
      if (!(resource === 'users' ? ['ACTIVO', 'INACTIVO', 'BLOQUEADO'] : ['ACTIVO', 'INACTIVO']).includes(status)) {
        throw new BadRequestException('El estado seleccionado no es valido.');
      }
    }

    return this.db.transaction(async (client) => {
      if (resource === 'users' || resource === 'roles') {
        await this.lockIdentityAdministration(client, user);
        const before = databaseId ? await this.identitySnapshot(client, resource, databaseId) : null;
        if (databaseId && !before) throw new NotFoundException('El registro seleccionado no existe.');
        const result = resource === 'users'
          ? await this.saveUser(client, databaseId, payload, user, before)
          : await this.saveRole(client, databaseId, payload, before);
        const after = await this.identitySnapshot(client, resource, result.id);
        const address = (context.ip ?? '').replace(/^::ffff:/, '');
        await client.query(`insert into temo.bitacora
          (id_usuario,accion,tabla,id_registro,datos_anteriores,datos_nuevos,direccion_ip,agente_usuario)
          values($1,$2::temo.accion_bitacora,$3,$4,$5::jsonb,$6::jsonb,$7::inet,$8)`,
        [user.id, databaseId ? 'ACTUALIZAR' : 'CREAR', resource === 'users' ? 'usuarios' : 'roles', result.id,
          before ? JSON.stringify(before) : null, JSON.stringify(after), isIP(address) ? address : null,
          (context.userAgent ?? '').slice(0, 300) || null]);
        return result;
      }
      if (['banks', 'commissions', 'branches', 'accounts', 'movements'].includes(resource)) {
        await this.lockIdentityAdministration(client, user);
        const before = databaseId ? await this.financialCatalogSnapshot(client, resource, databaseId) : null;
        if (databaseId && !before) throw new NotFoundException('El registro seleccionado no existe.');
        const handlers: Record<string, () => Promise<{ id: string }>> = {
          banks: () => this.saveBank(client, databaseId, payload),
          commissions: () => this.saveCommission(client, databaseId, payload, user.id),
          branches: () => this.saveBranch(client, databaseId, payload),
          accounts: () => this.saveAccount(client, databaseId, payload),
          movements: () => this.saveMovement(client, databaseId, payload),
        };
        const saved = await handlers[resource]();
        const after = await this.financialCatalogSnapshot(client, resource, saved.id);
        if (!after) throw new NotFoundException('El registro guardado no existe.');
        if (resource === 'accounts') {
          if (before && before.numero_cuenta_interno !== after.numero_cuenta_interno) {
            before.numero_cuenta_modificado = false;
            after.numero_cuenta_modificado = true;
          }
          delete before?.numero_cuenta_interno;
          delete after.numero_cuenta_interno;
        }
        const tables: Record<string, string> = { banks: 'entidades_bancarias', commissions: 'reglas_comisiones',
          branches: 'sucursales', accounts: 'cuentas_bancarias', movements: 'movimientos' };
        const address = (context.ip ?? '').replace(/^::ffff:/, '');
        await client.query(`insert into temo.bitacora
          (id_usuario,accion,tabla,id_registro,datos_anteriores,datos_nuevos,direccion_ip,agente_usuario)
          values($1,$2::temo.accion_bitacora,$3,$4,$5::jsonb,$6::jsonb,$7::inet,$8)`,
        [user.id, databaseId ? 'ACTUALIZAR' : 'CREAR', tables[resource],
          saved.id, before ? JSON.stringify(before) : null, JSON.stringify(after), isIP(address) ? address : null,
          (context.userAgent ?? '').slice(0, 300) || null]);
        return saved;
      }
      throw new BadRequestException('Catalogo no reconocido.');
    });
  }

  private async saveRole(client: PoolClient, databaseId: string | undefined, payload: CatalogPayload, before: Record<string, unknown> | null) {
    const code = this.required(payload.code, 'Detalle nombre clave').toUpperCase();
    const name = this.required(payload.name, 'Nombre visible');
    const description = this.text(payload.description);
    const status = this.recordStatus(payload.status);
    if (code.length > 40 || name.length > 80 || description.length > 2000) throw new BadRequestException('Los datos del rol exceden la longitud permitida.');
    if (before && protectedRoles.has(String(before.codigo)) && (code !== before.codigo || status !== 'ACTIVO')) {
      throw new BadRequestException('No se puede cambiar el codigo ni desactivar un rol operativo del sistema. Desactive el usuario que corresponda.');
    }
    if (protectedRoles.has(code) && status !== 'ACTIVO') throw new BadRequestException('Los roles operativos deben permanecer activos.');
    const result = databaseId
      ? await client.query(
          `update temo.roles
           set codigo = $2, nombre = $3, descripcion = $4, estado = $5, fecha_modificacion = now()
           where id_rol = $1
           returning id_rol as id`,
          [databaseId, code, name, description || null, status],
        )
      : await client.query(
          `insert into temo.roles (codigo, nombre, descripcion, estado)
           values ($1, $2, $3, $4)
           returning id_rol as id`,
          [code, name, description || null, status],
        );
    const saved = this.firstId(result.rows, 'rol');
    if (before && (before.codigo !== code || before.estado !== status)) {
      await client.query('update temo.usuarios set version_sesion = version_sesion + 1 where id_rol = $1', [saved.id]);
    }
    return saved;
  }

  private async saveUser(client: PoolClient, databaseId: string | undefined, payload: CatalogPayload,
    actor: AuthenticatedUser, before: Record<string, unknown> | null) {
    const firstName = this.required(payload.firstName ?? payload.nombres, 'Nombres');
    const lastName = this.text(payload.lastName ?? payload.apellidos);
    const username = this.required(payload.username ?? payload.usuario, 'Usuario').toUpperCase();
    const email = this.text(payload.email ?? payload.correo);
    if (firstName.length > 80 || lastName.length > 120 || `${firstName} ${lastName}`.trim().length > 180
      || username.length > 60 || email.length > 160) throw new BadRequestException('Los datos del usuario exceden la longitud permitida.');
    const roleId = await this.resolveId(
      client,
      `select id_rol as id from temo.roles where estado = 'ACTIVO'
       and (id_rol::text = $1 or lower(nombre) = lower($1) or upper(codigo) = upper($1))`,
      this.required(payload.roleId ?? payload.role, 'Rol'),
      'El rol seleccionado no existe.',
    );
    const status = this.userStatus(payload.status);
    const password = this.text(payload.password ?? payload.contrasena);
    const nextRole = (await client.query<{ codigo: string }>('select codigo from temo.roles where id_rol = $1', [roleId])).rows[0].codigo;
    if (databaseId === actor.id && (status !== 'ACTIVO' || nextRole !== 'JEFA')) {
      throw new BadRequestException('No puede desactivar su propio acceso ni quitarse el perfil Administrador.');
    }
    if (before?.rol === 'JEFA' && before.estado === 'ACTIVO' && (nextRole !== 'JEFA' || status !== 'ACTIVO')) {
      const remaining = await client.query(`select 1 from temo.usuarios u join temo.roles r using(id_rol)
        where r.codigo='JEFA' and r.estado='ACTIVO' and u.estado='ACTIVO' and u.id_usuario<>$1 limit 1`, [databaseId]);
      if (!remaining.rowCount) throw new BadRequestException('Debe conservar al menos un Administrador activo.');
    }
    if (password && before && (before.rol !== 'CAJERO' || nextRole !== 'CAJERO')) {
      throw new BadRequestException('Solo puede asignar una clave temporal a un cajero. El Administrador debe utilizar Cambiar contrasena o recuperacion.');
    }
    if (!databaseId && !password) {
      throw new BadRequestException('Ingrese una contrasena temporal para el nuevo usuario.');
    }
    if (password) this.validateTemporaryPassword(password);
    const duplicate = await client.query(`select 1 from temo.usuarios
      where ($3::uuid is null or id_usuario<>$3)
        and (lower(usuario)=lower($1) or ($2<>'' and lower(correo)=lower($2))) limit 1`,
    [username, email, databaseId ?? null]);
    if (duplicate.rowCount) throw new BadRequestException('El usuario o correo ya esta registrado.');
    const result = databaseId
      ? await client.query(
          `update temo.usuarios
           set id_rol = $2, nombres = $3, apellidos = $4, usuario = $5::varchar,
               correo = nullif($6, ''), estado = $7::temo.estado_usuario,
               contrasena_hash = case when $8 <> '' then crypt($8, gen_salt('bf', 12)) else contrasena_hash end,
               debe_cambiar_contrasena = case when $8 <> '' then true else debe_cambiar_contrasena end,
               version_sesion = case when $8 <> '' or id_rol is distinct from $2
                 or estado is distinct from $7::temo.estado_usuario or usuario is distinct from $5::varchar
                 then version_sesion + 1 else version_sesion end,
               contrasena_modificada_en = case when $8 <> '' then now() else contrasena_modificada_en end,
               intentos_fallidos = case when $8 <> '' then 0 else intentos_fallidos end,
               bloqueado_hasta = case when $8 <> '' then null else bloqueado_hasta end,
               fecha_modificacion = now()
           where id_usuario = $1
           returning id_usuario as id`,
          [databaseId, roleId, firstName, lastName, username, email, status, password],
        )
      : await client.query(
          `insert into temo.usuarios (
             id_rol, nombres, apellidos, usuario, correo, contrasena_hash,
             debe_cambiar_contrasena, estado
           )
           values ($1, $2, $3, $4, nullif($5, ''), crypt($7, gen_salt('bf', 12)), true, $6)
           returning id_usuario as id`,
          [roleId, firstName, lastName, username, email, status, password],
        );
    return this.firstId(result.rows, 'usuario');
  }

  private async lockIdentityAdministration(client: PoolClient, actor: AuthenticatedUser) {
    // Serialize identity changes before checking the actor and last-administrator invariant.
    await client.query('select pg_advisory_xact_lock(741260810)');
    const current = await client.query(`select 1 from temo.usuarios u join temo.roles r using(id_rol)
      where u.id_usuario=$1 and u.estado='ACTIVO' and r.codigo='JEFA' and r.estado='ACTIVO'
        and ($2::integer is null or u.version_sesion=$2)`, [actor.id, actor.sessionVersion ?? null]);
    if (!current.rowCount) throw new ForbiddenException('Su acceso administrativo cambio. Inicie sesion nuevamente.');
  }

  async revokeUserSessions(targetId: string, actor: AuthenticatedUser, context: AuditContext = {}) {
    this.requireBoss(actor);
    return this.db.transaction(async client => {
      await this.lockIdentityAdministration(client, actor);
      const before = await this.identitySnapshot(client, 'users', targetId);
      if (!before) throw new NotFoundException('El usuario seleccionado no existe.');
      await client.query('update temo.usuarios set version_sesion=version_sesion+1, fecha_modificacion=now() where id_usuario=$1', [targetId]);
      const after = { ...await this.identitySnapshot(client, 'users', targetId), evento: 'REVOCAR_SESIONES' };
      const ip = (context.ip ?? '').replace(/^::ffff:/, '');
      await client.query(`insert into temo.bitacora
        (id_usuario,accion,tabla,id_registro,datos_anteriores,datos_nuevos,direccion_ip,agente_usuario)
        values($1,'ACTUALIZAR','usuarios',$2,$3::jsonb,$4::jsonb,$5::inet,$6)`,
      [actor.id, targetId, JSON.stringify(before), JSON.stringify(after), isIP(ip) ? ip : null,
        (context.userAgent ?? '').slice(0, 300) || null]);
      return { success: true };
    });
  }

  private async identitySnapshot(client: PoolClient, resource: string, id: string) {
    const sql = resource === 'users'
      ? `select u.usuario,u.nombres,u.apellidos,u.correo,r.codigo as rol,u.estado,
          u.debe_cambiar_contrasena,u.version_sesion from temo.usuarios u join temo.roles r using(id_rol) where u.id_usuario=$1`
      : `select codigo,nombre,descripcion,estado from temo.roles where id_rol=$1`;
    return (await client.query(sql, [id])).rows[0] ?? null;
  }

  private async financialCatalogSnapshot(client: PoolClient, resource: string, id: string) {
    // Explicit fields only: never persist request bodies or unrelated financial records.
    const mapping = (condition: string) => `coalesce((select jsonb_agg(jsonb_build_object(
      'id',cm.id_cuenta_movimiento,'cuenta',cb.alias,'movimiento',linked_mv.nombre,
      'codigo',cm.codigo_operativo,'nombre',cm.nombre_operativo,'prioridad',cm.prioridad,'estado',cm.estado,
      'afecta_efectivo',ef.afecta_efectivo,'direccion_efectivo',ef.direccion_efectivo,
      'afecta_cuenta',ef.afecta_cuenta,'direccion_cuenta',ef.direccion_cuenta,
      'genera_pendiente',ef.genera_pendiente,'tipo_pendiente',ef.tipo_pendiente,
      'requiere_contraparte',ef.requiere_contraparte,'permite_conversion',ef.permite_conversion,
      'permite_credito',ef.permite_credito) order by cm.id_cuenta_movimiento)
      from temo.cuentas_movimientos cm join temo.cuentas_bancarias cb using(id_cuenta)
      join temo.movimientos linked_mv using(id_movimiento)
      left join temo.efectos_movimientos ef using(id_cuenta_movimiento) where ${condition}), '[]'::jsonb)`;
    const queries: Record<string, string> = {
      banks: `select codigo,nombre_corto,nombre_largo,tipo,estado from temo.entidades_bancarias where id_entidad=$1 for update`,
      commissions: `select c.id_entidad,c.id_moneda,c.id_movimiento,c.id_moneda_comision,
          e.codigo as banco,m.codigo as moneda,mv.nombre as movimiento,mc.codigo as moneda_comision,
          c.tipo_calculo,c.porcentaje,c.monto_fijo,c.rango_inicio,c.rango_fin,c.estado
          from temo.reglas_comisiones c join temo.entidades_bancarias e using(id_entidad)
          join temo.monedas m on m.id_moneda=c.id_moneda join temo.movimientos mv using(id_movimiento)
          left join temo.monedas mc on mc.id_moneda=c.id_moneda_comision where c.id_comision=$1 for update of c`,
      branches: `select s.codigo,s.nombre,s.estado,
        coalesce((select jsonb_agg(jsonb_build_object('id',u.id_usuario,'nombre',u.nombre_completo) order by u.id_usuario)
          from temo.usuarios_sucursales us join temo.usuarios u using(id_usuario) where us.id_sucursal=s.id_sucursal),'[]'::jsonb) as cajeros,
        coalesce((select jsonb_agg(jsonb_build_object('id',c.id_cuenta,'nombre',c.alias) order by c.id_cuenta)
          from temo.cuentas_sucursales cs join temo.cuentas_bancarias c using(id_cuenta) where cs.id_sucursal=s.id_sucursal),'[]'::jsonb) as cuentas
        from temo.sucursales s where s.id_sucursal=$1 for update of s`,
      accounts: `select c.alias,e.codigo as banco,m.codigo as moneda,c.id_entidad,c.id_moneda,c.estado,
        c.numero_cuenta as numero_cuenta_interno,
        case when c.numero_cuenta is null then null when length(c.numero_cuenta)<=4 then 'Registrado (oculto)'
          else '****' || right(c.numero_cuenta,4) end as numero_cuenta_enmascarado,
        coalesce((select jsonb_agg(jsonb_build_object('id',s.id_sucursal,'nombre',s.nombre) order by s.id_sucursal)
          from temo.cuentas_sucursales cs join temo.sucursales s using(id_sucursal) where cs.id_cuenta=c.id_cuenta),'[]'::jsonb) as sucursales,
        ${mapping('cm.id_cuenta=c.id_cuenta')} as vinculos
        from temo.cuentas_bancarias c join temo.entidades_bancarias e using(id_entidad)
        join temo.monedas m using(id_moneda) where c.id_cuenta=$1 for update of c`,
      movements: `select mv.codigo,mv.nombre,mv.estado,${mapping('cm.id_movimiento=mv.id_movimiento')} as vinculos
        from temo.movimientos mv where mv.id_movimiento=$1 for update of mv`,
    };
    if (!Object.hasOwn(queries, resource)) throw new BadRequestException('Catalogo no reconocido.');
    return (await client.query(queries[resource], [id])).rows[0] ?? null;
  }

  // Aplica a claves temporales la misma politica minima usada por autenticacion.
  private validateTemporaryPassword(password: string) {
    validatePasswordForStorage(password);
  }

  private async saveBank(client: PoolClient, databaseId: string | undefined, payload: CatalogPayload) {
    const code = this.required(payload.code, 'Nombre corto').toUpperCase();
    const shortName = this.text(payload.shortName ?? payload.code) || code;
    const longName = this.required(payload.name ?? payload.longName, 'Nombre largo');
    const kind = this.entityKind(payload.kind);
    const status = this.recordStatus(payload.status);
    const result = databaseId
      ? await client.query(
          `update temo.entidades_bancarias
           set codigo = $2, nombre_corto = $3, nombre_largo = $4, tipo = $5,
               estado = $6, fecha_modificacion = now()
           where id_entidad = $1
           returning id_entidad as id`,
          [databaseId, code, shortName, longName, kind, status],
        )
      : await client.query(
          `insert into temo.entidades_bancarias (
             codigo, nombre_corto, nombre_largo, tipo, mostrar_como_banco,
             maneja_saldo, maneja_comision, estado
           ) values ($1, $2, $3, $4, true, true, true, $5)
           returning id_entidad as id`,
          [code, shortName, longName, kind, status],
        );
    return this.firstId(result.rows, 'entidad');
  }

  private async saveBranch(client: PoolClient, databaseId: string | undefined, payload: CatalogPayload) {
    const name = this.required(payload.name ?? payload.nombre, 'Nombre');
    const status = this.recordStatus(payload.status ?? payload.estado);
    let branchId = databaseId;
    if (branchId) {
      const updated = await client.query(
        `update temo.sucursales
         set nombre = $2, estado = $3, fecha_modificacion = now()
         where id_sucursal = $1
         returning id_sucursal as id`,
        [branchId, name, status],
      );
      branchId = this.firstId(updated.rows, 'sucursal').id;
    } else {
      const codeBase = this.slug(this.text(payload.code ?? payload.id) || name, 'SUCURSAL');
      const inserted = await client.query<{ id: string }>(
        `insert into temo.sucursales (codigo, nombre, estado)
         values (
           case when exists (select 1 from temo.sucursales where codigo = $1)
             then $1 || '_' || lpad((select (count(*) + 1)::text from temo.sucursales), 2, '0')
             else $1
           end,
           $2,
           $3
         )
         returning id_sucursal as id`,
        [codeBase, name, status],
      );
      branchId = inserted.rows[0].id;
    }

    const userIds = await this.resolveMany(
      client,
      `select id_usuario as id
       from temo.usuarios
       where id_usuario::text = any($1::text[])
          or lower(nombre_completo) = any($2::text[])`,
      this.values(payload.cashierIds),
      this.values(payload.cashiers).map((value) => value.toLowerCase()),
    );
    const accountIds = await this.resolveMany(
      client,
      `select id_cuenta as id
       from temo.cuentas_bancarias
       where id_cuenta::text = any($1::text[])
          or lower(alias) = any($2::text[])`,
      this.values(payload.accountIds),
      this.values(payload.accounts).map((value) => value.toLowerCase()),
    );

    await client.query('delete from temo.usuarios_sucursales where id_sucursal = $1', [branchId]);
    for (const userId of userIds) {
      await client.query(
        `insert into temo.usuarios_sucursales (id_usuario, id_sucursal)
         values ($1, $2) on conflict do nothing`,
        [userId, branchId],
      );
    }
    await client.query('delete from temo.cuentas_sucursales where id_sucursal = $1', [branchId]);
    for (const accountId of accountIds) {
      await client.query(
        `insert into temo.cuentas_sucursales (id_cuenta, id_sucursal)
         values ($1, $2) on conflict do nothing`,
        [accountId, branchId],
      );
    }
    return { id: branchId };
  }

  private async saveAccount(client: PoolClient, databaseId: string | undefined, payload: CatalogPayload) {
    const entityCode = this.required(payload.entity ?? payload.entidad, 'Entidad').toUpperCase();
    const currencyCode = this.required(payload.currency ?? payload.moneda, 'Moneda').toUpperCase();
    const entityId = await this.resolveId(
      client,
      'select id_entidad as id from temo.entidades_bancarias where id_entidad::text = $1 or upper(codigo) = upper($1)',
      entityCode,
      'La entidad seleccionada no existe.',
    );
    const currencyId = await this.resolveId(
      client,
      'select id_moneda as id from temo.monedas where id_moneda::text = $1 or upper(codigo) = upper($1)',
      currencyCode,
      'La moneda seleccionada no existe.',
    );
    const accountNumber = this.text(payload.accountNumber ?? payload.numero_cuenta);
    const status = this.recordStatus(payload.status ?? payload.estado);
    let accountId = databaseId;
    if (accountId) {
      const current = await client.query<{ consecutivo: number; id_entidad: string; id_moneda: string }>(
        'select consecutivo, id_entidad, id_moneda from temo.cuentas_bancarias where id_cuenta = $1',
        [accountId],
      );
      if (!current.rows[0]) throw new NotFoundException('La cuenta seleccionada no existe.');
      const changedCombination =
        current.rows[0].id_entidad !== entityId || current.rows[0].id_moneda !== currencyId;
      const nextConsecutive = changedCombination
        ? await client.query<{ consecutivo: number }>(
            `select coalesce(max(consecutivo), 0) + 1 as consecutivo
             from temo.cuentas_bancarias
             where id_entidad = $1 and id_moneda = $2`,
            [entityId, currencyId],
          )
        : null;
      const consecutive = nextConsecutive?.rows[0].consecutivo ?? current.rows[0].consecutivo;
      const alias = `${entityCode} ${currencyCode} ${String(consecutive).padStart(2, '0')}`;
      await client.query(
        `update temo.cuentas_bancarias
         set id_entidad = $2, id_moneda = $3, consecutivo = $4, alias = $5,
             numero_cuenta = nullif($6, ''), estado = $7, fecha_modificacion = now()
         where id_cuenta = $1`,
        [accountId, entityId, currencyId, consecutive, alias, accountNumber, status],
      );
    } else {
      const inserted = await client.query<{ id: string }>(
        `with next_value as (
           select coalesce(max(consecutivo), 0) + 1 as consecutivo
           from temo.cuentas_bancarias
           where id_entidad = $1 and id_moneda = $2
         )
         insert into temo.cuentas_bancarias (
           id_entidad, id_moneda, tipo_cuenta, consecutivo, alias, numero_cuenta, estado
         )
         select $1, $2, 'CUENTA_REAL', consecutivo,
                $3 || ' ' || $4 || ' ' || lpad(consecutivo::text, 2, '0'),
                nullif($5, ''), $6
         from next_value
         returning id_cuenta as id`,
        [entityId, currencyId, entityCode, currencyCode, accountNumber, status],
      );
      accountId = inserted.rows[0].id;
    }

    const branchIds = await this.resolveMany(
      client,
      `select id_sucursal as id
       from temo.sucursales
       where id_sucursal::text = any($1::text[])
          or lower(nombre) = any($2::text[])`,
      this.values(payload.branchIds),
      this.values(payload.scope)
        .filter((value) => value.toLowerCase() !== 'global')
        .map((value) => value.toLowerCase()),
    );
    await client.query('delete from temo.cuentas_sucursales where id_cuenta = $1', [accountId]);
    for (const branchId of branchIds) {
      await client.query(
        `insert into temo.cuentas_sucursales (id_cuenta, id_sucursal)
         values ($1, $2) on conflict do nothing`,
        [accountId, branchId],
      );
    }
    await this.inheritAccountMovements(client, accountId, entityId, currencyId);
    return { id: accountId };
  }

  private async inheritAccountMovements(
    client: PoolClient,
    accountId: string,
    entityId: string,
    currencyId: string,
  ) {
    const sources = await client.query<{
      id_movimiento: string;
      codigo_operativo: string;
      nombre_operativo: string;
      prioridad: number;
      estado: string;
      afecta_efectivo: boolean | null;
      direccion_efectivo: string | null;
      afecta_cuenta: boolean | null;
      direccion_cuenta: string | null;
      genera_pendiente: boolean | null;
      tipo_pendiente: string | null;
      requiere_contraparte: boolean | null;
      permite_conversion: boolean | null;
      permite_credito: boolean | null;
      observaciones: string | null;
    }>(
      `select distinct on (cm.id_movimiento)
         cm.id_movimiento, cm.codigo_operativo, cm.nombre_operativo, cm.prioridad,
         cm.estado::text,
         ef.afecta_efectivo, ef.direccion_efectivo::text,
         ef.afecta_cuenta, ef.direccion_cuenta::text,
         ef.genera_pendiente, ef.tipo_pendiente::text,
         ef.requiere_contraparte, ef.permite_conversion, ef.permite_credito,
         ef.observaciones
       from temo.cuentas_movimientos cm
       join temo.cuentas_bancarias source on source.id_cuenta = cm.id_cuenta
       left join temo.efectos_movimientos ef
         on ef.id_cuenta_movimiento = cm.id_cuenta_movimiento
       where source.id_entidad = $1
         and source.id_moneda = $2
         and source.id_cuenta <> $3
       order by cm.id_movimiento, source.consecutivo, cm.fecha_creacion`,
      [entityId, currencyId, accountId],
    );

    for (const source of sources.rows) {
      const mapping = await client.query<{ id: string }>(
        `insert into temo.cuentas_movimientos (
           id_cuenta, id_movimiento, codigo_operativo, nombre_operativo, prioridad, estado
         ) values ($1, $2, $3, $4, $5, $6::temo.estado_registro)
         on conflict (id_cuenta, id_movimiento) do nothing
         returning id_cuenta_movimiento as id`,
        [
          accountId,
          source.id_movimiento,
          source.codigo_operativo,
          source.nombre_operativo,
          source.prioridad,
          source.estado,
        ],
      );
      if (!mapping.rows[0] || source.afecta_efectivo === null) continue;
      await client.query(
        `insert into temo.efectos_movimientos (
           id_cuenta_movimiento, afecta_efectivo, direccion_efectivo,
           afecta_cuenta, direccion_cuenta, genera_pendiente, tipo_pendiente,
           requiere_contraparte, permite_conversion, permite_credito, observaciones
         ) values (
           $1, $2, $3::temo.direccion_monto, $4, $5::temo.direccion_monto,
           $6, $7::temo.tipo_pendiente, $8, $9, $10, $11
         ) on conflict (id_cuenta_movimiento) do nothing`,
        [
          mapping.rows[0].id,
          source.afecta_efectivo,
          source.direccion_efectivo,
          source.afecta_cuenta,
          source.direccion_cuenta,
          source.genera_pendiente,
          source.tipo_pendiente,
          source.requiere_contraparte,
          source.permite_conversion,
          source.permite_credito,
          source.observaciones,
        ],
      );
    }
  }

  private async saveMovement(client: PoolClient, databaseId: string | undefined, payload: CatalogPayload) {
    const code = this.required(payload.code ?? payload.codigo, 'Codigo').toUpperCase();
    const name = this.required(payload.name ?? payload.nombre, 'Nombre');
    const status = this.recordStatus(payload.status ?? payload.estado);
    const direction = this.direction(payload.direction ?? payload.direccion);
    let movementId = databaseId;
    if (movementId) {
      const updated = await client.query<{ id: string }>(
        `update temo.movimientos
         set nombre = $2, estado = $3, fecha_modificacion = now()
         where id_movimiento = $1
         returning id_movimiento as id`,
        [movementId, name, status],
      );
      if (!updated.rows[0]) throw new NotFoundException('El movimiento seleccionado no existe.');
    } else {
      const inserted = await client.query<{ id: string }>(
        `insert into temo.movimientos (codigo, nombre, estado)
         values (
           case when exists (select 1 from temo.movimientos where codigo = $1)
             then $1 || '_' || lpad((select (count(*) + 1)::text from temo.movimientos), 2, '0')
             else $1
           end,
           $2,
           $3
         )
         returning id_movimiento as id`,
        [this.slug(name, 'MOVIMIENTO'), name, status],
      );
      movementId = inserted.rows[0].id;
    }

    const banks = this.values(payload.banks ?? payload.bancos).map((value) => value.toUpperCase());
    const currencies = this.values(payload.currencies ?? payload.monedas).map((value) => value.toUpperCase());
    if (!banks.length || !currencies.length) {
      throw new BadRequestException('Seleccione al menos un banco y una moneda para el movimiento.');
    }
    const accounts = await client.query<{ id: string }>(
      `select c.id_cuenta as id
       from temo.cuentas_bancarias c
       join temo.entidades_bancarias e on e.id_entidad = c.id_entidad
       join temo.monedas m on m.id_moneda = c.id_moneda
       where e.codigo = any($1::text[]) and m.codigo = any($2::text[])`,
      [banks, currencies],
    );
    const mappingIds = this.values(payload.mappingIds ?? payload.mapeo_ids);
    if (mappingIds.length) {
      const owned = await client.query(`select id_cuenta_movimiento from temo.cuentas_movimientos
        where id_cuenta_movimiento::text = any($1::text[]) and id_movimiento=$2 for update`, [mappingIds, movementId]);
      if (owned.rowCount !== new Set(mappingIds).size) {
        throw new BadRequestException('Los vinculos seleccionados no pertenecen al movimiento.');
      }
      await client.query(
        `update temo.cuentas_movimientos
         set estado = 'INACTIVO', fecha_modificacion = now()
         where id_cuenta_movimiento::text = any($1::text[]) and id_movimiento=$2`,
        [mappingIds, movementId],
      );
    }
    for (const account of accounts.rows) {
      const mapping = await client.query<{ id: string }>(
        `insert into temo.cuentas_movimientos (
           id_cuenta, id_movimiento, codigo_operativo, nombre_operativo, prioridad, estado
         ) values ($1, $2, $3, $4, 100, 'ACTIVO')
         on conflict (id_cuenta, id_movimiento) do update set
           codigo_operativo = excluded.codigo_operativo,
           nombre_operativo = excluded.nombre_operativo,
           estado = 'ACTIVO',
           fecha_modificacion = now()
         returning id_cuenta_movimiento as id`,
        [account.id, movementId, code, name],
      );
      await client.query(
        `insert into temo.efectos_movimientos (
           id_cuenta_movimiento, afecta_efectivo, direccion_efectivo,
           afecta_cuenta, direccion_cuenta, genera_pendiente
         ) values ($1, true, $2, true, $3, false)
         on conflict (id_cuenta_movimiento) do update set
           direccion_efectivo = excluded.direccion_efectivo,
           direccion_cuenta = excluded.direccion_cuenta`,
        [mapping.rows[0].id, direction, direction === 'ENTRA' ? 'SALE' : 'ENTRA'],
      );
    }
    return { id: movementId };
  }

  private async saveCommission(
    client: PoolClient,
    databaseId: string | undefined,
    payload: CatalogPayload,
    userId: string,
  ) {
    const entityId = await this.resolveId(
      client,
      'select id_entidad as id from temo.entidades_bancarias where id_entidad::text = $1 or upper(codigo) = upper($1)',
      this.required(payload.entity ?? payload.entidad_bancaria, 'Entidad bancaria'),
      'La entidad seleccionada no existe.',
    );
    const currencyId = await this.resolveId(
      client,
      'select id_moneda as id from temo.monedas where id_moneda::text = $1 or upper(codigo) = upper($1)',
      this.required(payload.currency ?? payload.moneda, 'Moneda'),
      'La moneda seleccionada no existe.',
    );
    const movementId = await this.resolveId(
      client,
      'select id_movimiento as id from temo.movimientos where id_movimiento::text = $1 or lower(nombre) = lower($1)',
      this.required(payload.movement ?? payload.movimiento, 'Movimiento'),
      'El movimiento seleccionado no existe.',
    );
    const commissionCurrencyValue = this.text(payload.commissionCurrency ?? payload.moneda_comision);
    const commissionCurrencyId = commissionCurrencyValue
      ? await this.resolveId(
          client,
          'select id_moneda as id from temo.monedas where id_moneda::text = $1 or upper(codigo) = upper($1)',
          commissionCurrencyValue,
          'La moneda de comision seleccionada no existe.',
        )
      : null;
    const calculation = this.calculation(payload.calculation ?? payload.tipo_calculo);
    const values = [
      entityId,
      currencyId,
      movementId,
      commissionCurrencyId,
      calculation,
      this.numberOrNull(payload.percentage ?? payload.porcentaje),
      this.numberOrNull(payload.fixed ?? payload.monto_fijo),
      this.numberOrNull(payload.rangeStart ?? payload.rango_inicio),
      this.numberOrNull(payload.rangeEnd ?? payload.rango_fin),
      this.recordStatus(payload.status ?? payload.estado),
      userId,
    ];
    const result = databaseId
      ? await client.query(
          `update temo.reglas_comisiones set
             id_entidad = $2, id_moneda = $3, id_movimiento = $4,
             id_moneda_comision = $5, tipo_calculo = $6, porcentaje = $7,
             monto_fijo = $8, rango_inicio = $9, rango_fin = $10,
             estado = $11, fecha_modificacion = now()
           where id_comision = $1
           returning id_comision as id`,
          [databaseId, ...values.slice(0, 10)],
        )
      : await client.query(
          `insert into temo.reglas_comisiones (
             id_entidad, id_moneda, id_movimiento, id_moneda_comision,
             tipo_calculo, porcentaje, monto_fijo, rango_inicio, rango_fin,
             estado, id_usuario_creacion
           ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           returning id_comision as id`,
          values,
        );
    return this.firstId(result.rows, 'regla de comision');
  }

  private requireBoss(user: AuthenticatedUser) {
    if (user.roleCode !== 'JEFA') {
      throw new ForbiddenException('Solo el Administrador puede modificar catalogos administrativos.');
    }
  }

  private required(value: unknown, label: string) {
    const result = this.text(value);
    if (!result) throw new BadRequestException(`${label} es obligatorio.`);
    return result;
  }

  private text(value: unknown) {
    return String(value ?? '').trim();
  }

  private values(value: unknown) {
    if (Array.isArray(value)) return value.map((item) => this.text(item)).filter(Boolean);
    return this.text(value).split(',').map((item) => item.trim()).filter(Boolean);
  }

  private recordStatus(value: unknown) {
    return this.text(value).toUpperCase() === 'INACTIVO' ? 'INACTIVO' : 'ACTIVO';
  }

  private userStatus(value: unknown) {
    const status = this.text(value).toUpperCase();
    return status === 'INACTIVO' || status === 'BLOQUEADO' ? status : 'ACTIVO';
  }

  private entityKind(value: unknown) {
    const normalized = this.slug(this.text(value), 'BANCO_REAL');
    const map: Record<string, string> = {
      BANCO_REAL: 'BANCO_REAL',
      SERVICIO_FINANCIERO: 'SERVICIO_FINANCIERO',
      SERVICIO_REMESAS: 'SERVICIO_REMESAS',
      OTRO: 'OTRO',
    };
    return map[normalized] ?? 'OTRO';
  }

  private calculation(value: unknown) {
    const normalized = this.slug(this.text(value), 'FIJO');
    return ['PORCENTAJE', 'FIJO', 'RANGO', 'MANUAL'].includes(normalized) ? normalized : 'FIJO';
  }

  private direction(value: unknown) {
    const normalized = this.text(value).toUpperCase();
    return normalized === 'SALIDA' || normalized === 'SALE' ? 'SALE' : 'ENTRA';
  }

  private numberOrNull(value: unknown) {
    const text = this.text(value).replace(/,/g, '').replace(/%/g, '');
    if (!text) return null;
    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private slug(value: string, fallback: string) {
    const result = value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    return result || fallback;
  }

  private firstId(rows: Array<{ id?: string }>, label: string) {
    if (!rows[0]?.id) throw new NotFoundException(`No se encontro el ${label} solicitado.`);
    return { id: rows[0].id };
  }

  private async resolveId(
    client: PoolClient,
    sql: string,
    value: string,
    errorMessage: string,
  ) {
    const result = await client.query<{ id: string }>(sql, [value]);
    if (!result.rows[0]?.id) throw new BadRequestException(errorMessage);
    return result.rows[0].id;
  }

  private async resolveMany(
    client: PoolClient,
    sql: string,
    ids: string[],
    names: string[],
  ) {
    if (!ids.length && !names.length) return [];
    const result = await client.query<{ id: string }>(sql, [ids, names]);
    return [...new Set(result.rows.map((row) => row.id))];
  }
}
