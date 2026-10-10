import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { BadRequestException, HttpException, HttpStatus, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QueryResultRow } from 'pg';
import { DatabaseService } from '../database/database.service';
import { MfaService } from './mfa.service';
import { validatePasswordForStorage } from '../../common/password-policy';

type AuthUserRow = QueryResultRow & {
  id: string; role_id: string; role_code: string; role_name: string;
  full_name: string; username: string; must_change_password: boolean;
  session_version: number; profile_photo?: string | null;
  blocked?: boolean;
};
type AccessTokenPayload = { sub: string; username: string; version: number; iat: number; exp: number; mfa?: boolean };
export type AuthenticatedUser = {
  id: string; fullName: string; username: string; roleId: string; roleCode: string;
  roleName: string; permissions: string[]; mustChangePassword: boolean; sessionVersion: number;
  profilePhoto: string | null;
};

const MAX_FAILED_ATTEMPTS = 5;
const BLOCK_MINUTES = 15;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly secret: string;
  private readonly tokenLifetimeSeconds: number;
  private readonly resendApiKey: string;
  private readonly passwordResetEmailFrom: string;

  constructor(private readonly db: DatabaseService, config: ConfigService, private readonly mfa: MfaService) {
    this.secret = config.get<string>('AUTH_SECRET')?.trim() ?? '';
    if (this.secret.length < 32) throw new Error('AUTH_SECRET debe contener al menos 32 caracteres.');
    const configuredHours = Number(config.get<string>('AUTH_TOKEN_HOURS', '8'));
    const tokenHours = Number.isFinite(configuredHours) ? Math.max(1, Math.min(configuredHours, 24)) : 8;
    this.tokenLifetimeSeconds = tokenHours * 60 * 60;
    this.resendApiKey = config.get<string>('RESEND_API_KEY', '').trim();
    this.passwordResetEmailFrom = config.get<string>('PASSWORD_RESET_EMAIL_FROM', '').trim();
  }

  // Genera y envía un código sólo para cuentas activas con rol Administrador y correo registrado.
  async requestPasswordRecovery(identifier: string, ip: string, userAgent: string) {
    const normalizedIdentifier = identifier.trim().toLowerCase();
    const genericResponse = { success: true, message: 'Si los datos coinciden, recibirá un código de recuperación en el correo registrado.' };
    if (!normalizedIdentifier) return genericResponse;
    const result = await this.db.query<QueryResultRow & { id: string; email: string; full_name: string }>(
      `select u.id_usuario as id, u.correo as email, u.nombre_completo as full_name
       from temo.usuarios u join temo.roles r on r.id_rol = u.id_rol
       where (lower(u.usuario) = $1 or lower(u.correo) = $1)
         and u.estado = 'ACTIVO' and r.estado = 'ACTIVO' and r.codigo = 'JEFA'
         and nullif(trim(u.correo), '') is not null limit 2`,
      [normalizedIdentifier],
    );
    const target = result.rows[0];
    if (result.rows.length !== 1) return genericResponse;

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const codeHash = this.hashRecoveryCode(target.id, code);
    let recoveryId: string | null;
    try {
      recoveryId = await this.db.transaction(async client => {
        // Serialize requests by account across API instances, not by branch IP.
        await client.query('select pg_advisory_xact_lock(hashtextextended($1, 741260811))', [target.id]);
        const recent = await client.query<{ requests: number; cooling_down: boolean }>(
          `select count(*)::integer as requests,
                  coalesce(bool_or(fecha_creacion > now() - interval '1 minute'), false) as cooling_down
           from temo.recuperaciones_contrasena
           where id_usuario = $1 and fecha_creacion > now() - interval '15 minutes'`, [target.id]);
        if (recent.rows[0].cooling_down || recent.rows[0].requests >= 3) return null;
        const recovery = await client.query<{ id: string } & QueryResultRow>(
          `with invalidated as (
             update temo.recuperaciones_contrasena set consumido_en = now()
             where id_usuario = $1 and consumido_en is null
           )
           insert into temo.recuperaciones_contrasena
             (id_usuario, codigo_hash, vence_en, direccion_ip)
           values ($1, $2, now() + interval '10 minutes', nullif($3, '')::inet)
           returning id_recuperacion as id`,
          [target.id, codeHash, this.normalizeIp(ip)],
        );
        await client.query(
          `insert into temo.bitacora
             (id_usuario, accion, tabla, id_registro, datos_nuevos, direccion_ip, agente_usuario)
           values ($1, 'CREAR', 'recuperaciones_contrasena', $2,
                   jsonb_build_object('evento', 'SOLICITUD_RECUPERACION'),
                   nullif($3, '')::inet, nullif($4, ''))`,
          [target.id, recovery.rows[0].id, this.normalizeIp(ip), userAgent.slice(0, 1000)],
        );
        return recovery.rows[0].id;
      });
    } catch {
      this.logger.error('No fue posible preparar la recuperación.');
      return genericResponse;
    }
    if (!recoveryId) return genericResponse;
    try {
      await this.sendRecoveryEmail(target.email, target.full_name, code);
    } catch {
      // Keep the request timestamp for abuse controls, but never accept an undelivered code.
      await this.db.query(`update temo.recuperaciones_contrasena set consumido_en = now() where id_recuperacion = $1`, [recoveryId]);
      this.logger.error('No fue posible enviar el correo de recuperación.');
    }
    return genericResponse;
  }

  // Consume un código vigente, cambia la clave e invalida cualquier sesión anterior.
  async confirmPasswordRecovery(identifier: string, code: string, newPassword: string, ip: string, userAgent: string) {
    const normalizedIdentifier = identifier.trim().toLowerCase();
    this.validateNewPassword(newPassword);
    if (!/^\d{6}$/.test(code)) throw new BadRequestException('El código de recuperación no es válido.');
    const recovered = await this.db.transaction(async (client) => {
      await client.query('select pg_advisory_xact_lock(741260810)');
      const identities = await client.query<{ id: string }>(`select u.id_usuario as id
        from temo.usuarios u join temo.roles r using(id_rol)
        where (lower(u.usuario)=$1 or lower(u.correo)=$1)
          and u.estado='ACTIVO' and r.estado='ACTIVO' and r.codigo='JEFA'
          and nullif(trim(u.correo),'') is not null limit 2`, [normalizedIdentifier]);
      if (identities.rows.length !== 1) throw new BadRequestException('El código venció o no es válido. Solicite uno nuevo.');
      const result = await client.query<QueryResultRow & { recovery_id: string; user_id: string; code_hash: string }>(
        `select rc.id_recuperacion as recovery_id, u.id_usuario as user_id, rc.codigo_hash as code_hash
         from temo.recuperaciones_contrasena rc
         join temo.usuarios u on u.id_usuario = rc.id_usuario
         join temo.roles r on r.id_rol = u.id_rol
         where u.id_usuario = $1
           and r.codigo = 'JEFA' and r.estado = 'ACTIVO' and u.estado = 'ACTIVO'
           and rc.consumido_en is null and rc.vence_en > now() and rc.intentos < 5
         order by rc.fecha_creacion desc limit 1 for update of rc`,
        [identities.rows[0].id],
      );
      const recovery = result.rows[0];
      if (!recovery) throw new BadRequestException('El código venció o no es válido. Solicite uno nuevo.');
      if (this.hashRecoveryCode(recovery.user_id, code) !== recovery.code_hash) {
        await client.query(`update temo.recuperaciones_contrasena set intentos = least(intentos + 1, 5) where id_recuperacion = $1`, [recovery.recovery_id]);
        return false;
      }
      await client.query(
        `update temo.usuarios set contrasena_hash = crypt($2, gen_salt('bf', 12)),
           debe_cambiar_contrasena = false, contrasena_modificada_en = now(),
           version_sesion = version_sesion + 1, intentos_fallidos = 0,
           bloqueado_hasta = null, fecha_modificacion = now() where id_usuario = $1`,
        [recovery.user_id, newPassword],
      );
      await client.query(`update temo.recuperaciones_contrasena set consumido_en = now() where id_recuperacion = $1`, [recovery.recovery_id]);
      await client.query(
        `insert into temo.bitacora
           (id_usuario, accion, tabla, id_registro, datos_nuevos, direccion_ip, agente_usuario)
         values ($1, 'ACTUALIZAR', 'usuarios', $1,
                 jsonb_build_object('evento', 'RECUPERAR_CONTRASENA'),
                 nullif($2, '')::inet, nullif($3, ''))`,
        [recovery.user_id, this.normalizeIp(ip), userAgent.slice(0, 1000)],
      );
      return true;
    });
    if (!recovered) throw new BadRequestException('El código venció o no es válido. Solicite uno nuevo.');
    return { success: true, message: 'Contraseña actualizada. Ya puede iniciar sesión.' };
  }

  async login(username: string, password: string, ip: string, userAgent: string) {
    const normalizedUsername = username.trim().toLowerCase();
    const safeIp = this.normalizeIp(ip);
    const safeAgent = userAgent.slice(0, 1000);
    if (!normalizedUsername || !password) throw new UnauthorizedException('Usuario o contrasena incorrectos.');

    const checked = await this.db.transaction(async (client) => {
      // Serialize password checks per account, including the decision to block.
      const result = await client.query<AuthUserRow>(
        `select u.id_usuario as id, u.id_rol as role_id, r.codigo as role_code,
              r.nombre as role_name, u.nombre_completo as full_name, u.usuario as username,
              u.debe_cambiar_contrasena as must_change_password, u.foto_perfil as profile_photo,
              u.version_sesion as session_version, u.bloqueado_hasta > now() as blocked
       from temo.usuarios u join temo.roles r on r.id_rol = u.id_rol
       where lower(u.usuario) = $1 and u.estado = 'ACTIVO' and r.estado = 'ACTIVO' limit 1 for update of u`,
        [normalizedUsername],
      );
      const userRow = result.rows[0];
      const valid = userRow && !userRow.blocked ? (await client.query(
        `select contrasena_hash = crypt($2, contrasena_hash) as password_valid
         from temo.usuarios where id_usuario = $1`, [userRow.id, password],
      )).rows[0]?.password_valid === true : false;
      if (!valid) {
        if (userRow && !userRow.blocked) {
          await client.query(
            `update temo.usuarios set intentos_fallidos = case when bloqueado_hasta <= now()
                 then 1 else intentos_fallidos + 1 end,
               bloqueado_hasta = case when (case when bloqueado_hasta <= now()
                 then 1 else intentos_fallidos + 1 end) >= $2
                 then now() + make_interval(mins => $3) else null end,
               fecha_modificacion = now() where id_usuario = $1`,
            [userRow.id, MAX_FAILED_ATTEMPTS, BLOCK_MINUTES],
          );
        }
        await client.query(
          `insert into temo.intentos_inicio_sesion
             (usuario_normalizado, direccion_ip, exitoso, agente_usuario)
           values ($1, nullif($2, '')::inet, false, nullif($3, ''))`,
          [normalizedUsername, safeIp, safeAgent],
        );
      }
      return { userRow, valid };
    });
    // Throw after committing so failure counters and attempted-access records survive.
    if (checked.userRow?.blocked) {
      throw new HttpException('Acceso bloqueado temporalmente. Intente nuevamente en 15 minutos.', HttpStatus.TOO_MANY_REQUESTS);
    }
    if (!checked.valid || !checked.userRow) throw new UnauthorizedException('Usuario o contrasena incorrectos.');
    const user = await this.buildAuthenticatedUser(checked.userRow);
    if (user.roleCode === 'JEFA') {
      return this.mfa.begin(user);
    }
    return this.completeLogin(user, safeIp, safeAgent);
  }

  async verifyMfa(challenge: string, code: string, recoveryCode: string, ip: string, agent: string) {
    const verified = await this.mfa.verify(challenge, code, recoveryCode, ip, agent);
    const identity = (await this.db.query<{ username: string } & QueryResultRow>(
      `select usuario as username from temo.usuarios where id_usuario=$1`, [verified.userId])).rows[0];
    if (!identity) throw new UnauthorizedException('La sesion no es valida.');
    const user = await this.loadUser(verified.userId, identity.username);
    if (user.roleCode !== 'JEFA' || user.sessionVersion !== verified.sessionVersion) throw new UnauthorizedException('La sesion no es valida.');
    return { ...await this.completeLogin(user, this.normalizeIp(ip), agent.slice(0, 1000)), recoveryCodes: verified.recoveryCodes };
  }

  private async completeLogin(user: AuthenticatedUser, safeIp: string, safeAgent: string) {
    const token = this.issueToken(user);
    await this.db.transaction(async (client) => {
      const current = await client.query(
        `update temo.usuarios u set ultimo_acceso = now(), intentos_fallidos = 0,
         bloqueado_hasta = null from temo.roles r
         where u.id_usuario = $1 and u.version_sesion = $2 and u.id_rol = $3
           and u.usuario = $4 and u.estado = 'ACTIVO' and r.id_rol = u.id_rol
           and r.codigo = $5 and r.estado = 'ACTIVO'
           and (u.bloqueado_hasta is null or u.bloqueado_hasta <= now())
         returning u.id_usuario`, [user.id, user.sessionVersion, user.roleId, user.username, user.roleCode],
      );
      if (!current.rowCount) throw new UnauthorizedException('El acceso cambio durante la operacion. Inicie sesion nuevamente.');
      await client.query(
        `insert into temo.intentos_inicio_sesion
           (usuario_normalizado, direccion_ip, exitoso, agente_usuario)
         values ($1, nullif($2, '')::inet, true, nullif($3, ''))`,
        [user.username.toLowerCase(), safeIp, safeAgent],
      );
      await client.query(
        `insert into temo.bitacora
           (id_usuario, accion, tabla, id_registro, direccion_ip, agente_usuario)
         values ($1, 'INICIAR_SESION', 'usuarios', $1, nullif($2, '')::inet, nullif($3, ''))`,
        [user.id, safeIp, safeAgent],
      );
      await client.query(`delete from temo.intentos_inicio_sesion where fecha_creacion < now() - interval '90 days'`);
    });
    return { token, expiresIn: this.tokenLifetimeSeconds, user };
  }

  async changePassword(user: AuthenticatedUser, currentPassword: string, newPassword: string, ip: string, userAgent: string) {
    this.validateNewPassword(newPassword);
    if (!currentPassword) throw new BadRequestException('Ingrese la contrasena actual.');
    const changed = await this.db.transaction(async (client) => {
      await client.query('select pg_advisory_xact_lock(741260810)');
      const result = await client.query<AuthUserRow>(
        `update temo.usuarios set contrasena_hash = crypt($3, gen_salt('bf', 12)),
             debe_cambiar_contrasena = false, contrasena_modificada_en = now(),
             version_sesion = version_sesion + 1, intentos_fallidos = 0,
             bloqueado_hasta = null, fecha_modificacion = now()
         where id_usuario = $1 and contrasena_hash = crypt($2, contrasena_hash)
           and version_sesion = $4 and estado = 'ACTIVO'
           and exists(select 1 from temo.roles r where r.id_rol=usuarios.id_rol and r.codigo=$5 and r.estado='ACTIVO')
           and crypt($3, contrasena_hash) <> contrasena_hash
         returning id_usuario as id, usuario as username`,
        [user.id, currentPassword, newPassword, user.sessionVersion, user.roleCode],
      );
      const row = result.rows[0];
      if (!row) throw new BadRequestException('La contrasena actual no es correcta o la nueva es igual a la anterior.');
      await client.query(
        `insert into temo.bitacora
           (id_usuario, accion, tabla, id_registro, datos_nuevos, direccion_ip, agente_usuario)
         values ($1, 'ACTUALIZAR', 'usuarios', $1,
                 jsonb_build_object('evento', 'CAMBIO_CONTRASENA'),
                 nullif($2, '')::inet, nullif($3, ''))`,
        [user.id, this.normalizeIp(ip), userAgent.slice(0, 1000)],
      );
      return row;
    });
    const refreshed = await this.loadUser(changed.id, changed.username);
    if (refreshed.roleCode !== user.roleCode || refreshed.sessionVersion !== user.sessionVersion + 1) {
      throw new UnauthorizedException('El acceso cambio durante la operacion. Inicie sesion nuevamente.');
    }
    return { token: this.issueToken(refreshed), expiresIn: this.tokenLifetimeSeconds, user: refreshed };
  }

  // Valida y persiste una imagen previamente reducida por el navegador.
  async changeProfilePhoto(user: AuthenticatedUser, photoDataUrl: string, ip: string, userAgent: string) {
    const normalizedPhoto = photoDataUrl.trim();
    if (!/^data:image\/(jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(normalizedPhoto)) {
      throw new BadRequestException('Seleccione una imagen JPG, PNG o WEBP valida.');
    }
    if (normalizedPhoto.length > 200_000) {
      throw new BadRequestException('La fotografia es demasiado grande. Seleccione otra imagen.');
    }
    await this.db.transaction(async (client) => {
      await client.query(
        `update temo.usuarios set foto_perfil = $2, fecha_modificacion = now()
         where id_usuario = $1`,
        [user.id, normalizedPhoto],
      );
      await client.query(
        `insert into temo.bitacora
           (id_usuario, accion, tabla, id_registro, datos_nuevos, direccion_ip, agente_usuario)
         values ($1, 'ACTUALIZAR', 'usuarios', $1,
                 jsonb_build_object('evento', 'CAMBIO_FOTO_PERFIL'),
                 nullif($2, '')::inet, nullif($3, ''))`,
        [user.id, this.normalizeIp(ip), userAgent.slice(0, 1000)],
      );
    });
    return { user: await this.loadUser(user.id, user.username) };
  }

  async logout(user: AuthenticatedUser, ip: string, userAgent: string) {
    await this.db.transaction(async (client) => {
      await client.query(`update temo.usuarios set version_sesion = version_sesion + 1 where id_usuario = $1`, [user.id]);
      await client.query(
        `insert into temo.bitacora
           (id_usuario, accion, tabla, id_registro, direccion_ip, agente_usuario)
         values ($1, 'CERRAR_SESION', 'usuarios', $1, nullif($2, '')::inet, nullif($3, ''))`,
        [user.id, this.normalizeIp(ip), userAgent.slice(0, 1000)],
      );
    });
    return { success: true };
  }

  async validateAccessToken(token: string) {
    const payload = this.verifyToken(token);
    const user = await this.loadUser(payload.sub, payload.username, false);
    if (user.sessionVersion !== payload.version) throw new UnauthorizedException('La sesion ya no es valida. Inicie sesion nuevamente.');
    if (user.roleCode === 'JEFA') {
      if (payload.mfa !== true) throw new UnauthorizedException('Complete la verificacion en dos pasos.');
      const enabled = await this.db.query(`select 1 from temo.usuario_mfa where id_usuario=$1`, [user.id]);
      if (!enabled.rowCount) throw new UnauthorizedException('Complete la verificacion en dos pasos.');
    }
    return user;
  }

  async session(user: AuthenticatedUser) {
    return { user: await this.loadUser(user.id, user.username) };
  }

  private async loadUser(id: string, username: string, includePhoto = true) {
    const result = await this.db.query<AuthUserRow>(
      `select u.id_usuario as id, u.id_rol as role_id, r.codigo as role_code,
              r.nombre as role_name, u.nombre_completo as full_name, u.usuario as username,
              u.debe_cambiar_contrasena as must_change_password, u.version_sesion as session_version,
              ${includePhoto ? 'u.foto_perfil' : 'null::text'} as profile_photo
       from temo.usuarios u join temo.roles r on r.id_rol = u.id_rol
       where u.id_usuario = $1 and u.usuario = $2 and u.estado = 'ACTIVO' and r.estado = 'ACTIVO' limit 1`,
      [id, username],
    );
    if (!result.rows[0]) throw new UnauthorizedException('La sesion ya no es valida.');
    return this.buildAuthenticatedUser(result.rows[0]);
  }

  private async buildAuthenticatedUser(row: AuthUserRow): Promise<AuthenticatedUser> {
    const permissions = await this.db.query<QueryResultRow & { code: string }>(
      `select p.codigo as code from temo.roles_permisos rp
       join temo.permisos p on p.id_permiso = rp.id_permiso
       where rp.id_rol = $1 and p.estado = 'ACTIVO' order by p.codigo`, [row.role_id],
    );
    return {
      id: row.id, fullName: row.full_name, username: row.username, roleId: row.role_id,
      roleCode: row.role_code, roleName: row.role_code === 'JEFA' ? 'Administrador' : row.role_name,
      permissions: permissions.rows.map((item) => item.code),
      mustChangePassword: Boolean(row.must_change_password), sessionVersion: Number(row.session_version),
      profilePhoto: row.profile_photo ?? null,
    };
  }

  private issueToken(user: AuthenticatedUser) {
    const now = Math.floor(Date.now() / 1000);
    return this.signToken({ sub: user.id, username: user.username, version: user.sessionVersion,
      iat: now, exp: now + this.tokenLifetimeSeconds, ...(user.roleCode === 'JEFA' ? { mfa: true } : {}) });
  }

  private validateNewPassword(password: string) {
    validatePasswordForStorage(password);
  }

  // Deriva un hash ligado al usuario para que el código nunca se almacene de forma recuperable.
  private hashRecoveryCode(userId: string, code: string) {
    return createHmac('sha256', this.secret).update(`${userId}:${code}`).digest('hex');
  }

  // Entrega el código mediante Resend usando únicamente variables protegidas de Render.
  private async sendRecoveryEmail(email: string, fullName: string, code: string) {
    if (!this.resendApiKey || !this.passwordResetEmailFrom) {
      throw new Error('El servicio de correo no está configurado.');
    }
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
      headers: {
        Authorization: `Bearer ${this.resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.passwordResetEmailFrom,
        to: [email],
        subject: 'Código de recuperación de TEMO',
        html: `<div style="font-family:Arial,sans-serif;color:#102a33;max-width:520px"><h2>Recuperación de TEMO</h2><p>Hola ${this.escapeHtml(fullName)},</p><p>Use este código para restablecer su contraseña:</p><p style="font-size:28px;font-weight:700;letter-spacing:4px;color:#137f75">${code}</p><p>El código vence en 10 minutos. Si no solicitó este cambio, puede ignorar el mensaje.</p></div>`,
      }),
    });
    if (!response.ok) {
      throw new Error(`Resend rechazó el correo con estado ${response.status}.`);
    }
  }

  // Escapa el nombre antes de incorporarlo en el contenido HTML del correo.
  private escapeHtml(value: string) {
    return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
  }

  private normalizeIp(ip: string) { return ip.replace(/^::ffff:/, '').trim().slice(0, 45); }
  private signToken(payload: AccessTokenPayload) {
    const header = this.encodePart({ alg: 'HS256', typ: 'JWT' });
    const body = this.encodePart(payload);
    return `${header}.${body}.${this.createSignature(`${header}.${body}`)}`;
  }
  private verifyToken(token: string): AccessTokenPayload {
    if (token.length > 4096 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) {
      throw new UnauthorizedException('La sesion no es valida.');
    }
    const [header, body, signature] = token.split('.');
    if (!header || !body || !signature) throw new UnauthorizedException('La sesion no es valida.');
    const expected = Buffer.from(this.createSignature(`${header}.${body}`));
    const received = Buffer.from(signature);
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) throw new UnauthorizedException('La sesion no es valida.');
    try {
      const decodedHeader = JSON.parse(Buffer.from(header, 'base64url').toString('utf8'));
      if (decodedHeader.alg !== 'HS256' || decodedHeader.typ !== 'JWT') throw new Error();
      const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as AccessTokenPayload;
      const now = Math.floor(Date.now() / 1000);
      if (typeof payload.sub !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.sub)
        || typeof payload.username !== 'string' || !payload.username.trim() || payload.username.length > 256
        || !Number.isSafeInteger(payload.version) || payload.version < 0
        || !Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.exp)
        || payload.iat < 0 || payload.iat > now + 30 || payload.exp <= now
        || payload.exp <= payload.iat || payload.exp - payload.iat > 24 * 60 * 60) throw new Error();
      return payload;
    } catch { throw new UnauthorizedException('La sesion vencio o no es valida.'); }
  }
  private encodePart(value: object) { return Buffer.from(JSON.stringify(value)).toString('base64url'); }
  private createSignature(value: string) { return createHmac('sha256', this.secret).update(value).digest('base64url'); }
}
