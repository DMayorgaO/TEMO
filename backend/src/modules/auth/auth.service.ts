import { createHmac, timingSafeEqual } from 'node:crypto';
import { BadRequestException, HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QueryResultRow } from 'pg';
import { DatabaseService } from '../database/database.service';

type AuthUserRow = QueryResultRow & {
  id: string; role_id: string; role_code: string; role_name: string;
  full_name: string; username: string; must_change_password: boolean;
  session_version: number; password_valid?: boolean; blocked_until?: Date | null;
};
type AccessTokenPayload = { sub: string; username: string; version: number; iat: number; exp: number };
export type AuthenticatedUser = {
  id: string; fullName: string; username: string; roleId: string; roleCode: string;
  roleName: string; permissions: string[]; mustChangePassword: boolean; sessionVersion: number;
};

const MAX_FAILED_ATTEMPTS = 5;
const BLOCK_MINUTES = 15;

@Injectable()
export class AuthService {
  private readonly secret: string;
  private readonly tokenLifetimeSeconds: number;

  constructor(private readonly db: DatabaseService, config: ConfigService) {
    this.secret = config.get<string>('AUTH_SECRET')?.trim() ?? '';
    if (this.secret.length < 32) throw new Error('AUTH_SECRET debe contener al menos 32 caracteres.');
    const configuredHours = Number(config.get<string>('AUTH_TOKEN_HOURS', '8'));
    const tokenHours = Number.isFinite(configuredHours) ? Math.max(1, Math.min(configuredHours, 24)) : 8;
    this.tokenLifetimeSeconds = tokenHours * 60 * 60;
  }

  async login(username: string, password: string, ip: string, userAgent: string) {
    const normalizedUsername = username.trim().toLowerCase();
    const safeIp = this.normalizeIp(ip);
    const safeAgent = userAgent.slice(0, 1000);
    if (!normalizedUsername || !password) throw new UnauthorizedException('Usuario o contrasena incorrectos.');

    const result = await this.db.query<AuthUserRow>(
      `select u.id_usuario as id, u.id_rol as role_id, r.codigo as role_code,
              r.nombre as role_name, u.nombre_completo as full_name, u.usuario as username,
              u.debe_cambiar_contrasena as must_change_password,
              u.version_sesion as session_version, u.bloqueado_hasta as blocked_until,
              u.contrasena_hash = crypt($2, u.contrasena_hash) as password_valid
       from temo.usuarios u join temo.roles r on r.id_rol = u.id_rol
       where lower(u.usuario) = $1 and u.estado = 'ACTIVO' and r.estado = 'ACTIVO' limit 1`,
      [normalizedUsername, password],
    );
    const userRow = result.rows[0];
    if (userRow?.blocked_until && new Date(userRow.blocked_until).getTime() > Date.now()) {
      await this.recordAttempt(normalizedUsername, safeIp, safeAgent, false);
      throw new HttpException('Acceso bloqueado temporalmente. Intente nuevamente en 15 minutos.', HttpStatus.TOO_MANY_REQUESTS);
    }
    if (!userRow?.password_valid) {
      await this.db.transaction(async (client) => {
        if (userRow) {
          await client.query(
            `update temo.usuarios set intentos_fallidos = intentos_fallidos + 1,
               bloqueado_hasta = case when intentos_fallidos + 1 >= $2
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
      });
      throw new UnauthorizedException('Usuario o contrasena incorrectos.');
    }

    const user = await this.buildAuthenticatedUser(userRow);
    const token = this.issueToken(user);
    await this.db.transaction(async (client) => {
      await client.query(
        `update temo.usuarios set ultimo_acceso = now(), intentos_fallidos = 0,
         bloqueado_hasta = null where id_usuario = $1`, [user.id],
      );
      await client.query(
        `insert into temo.intentos_inicio_sesion
           (usuario_normalizado, direccion_ip, exitoso, agente_usuario)
         values ($1, nullif($2, '')::inet, true, nullif($3, ''))`,
        [normalizedUsername, safeIp, safeAgent],
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
      const result = await client.query<AuthUserRow>(
        `update temo.usuarios set contrasena_hash = crypt($3, gen_salt('bf', 12)),
             debe_cambiar_contrasena = false, contrasena_modificada_en = now(),
             version_sesion = version_sesion + 1, intentos_fallidos = 0,
             bloqueado_hasta = null, fecha_modificacion = now()
         where id_usuario = $1 and contrasena_hash = crypt($2, contrasena_hash)
           and crypt($3, contrasena_hash) <> contrasena_hash
         returning id_usuario as id, usuario as username`,
        [user.id, currentPassword, newPassword],
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
    return { token: this.issueToken(refreshed), expiresIn: this.tokenLifetimeSeconds, user: refreshed };
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
    const user = await this.loadUser(payload.sub, payload.username);
    if (user.sessionVersion !== payload.version) throw new UnauthorizedException('La sesion ya no es valida. Inicie sesion nuevamente.');
    return user;
  }

  private async loadUser(id: string, username: string) {
    const result = await this.db.query<AuthUserRow>(
      `select u.id_usuario as id, u.id_rol as role_id, r.codigo as role_code,
              r.nombre as role_name, u.nombre_completo as full_name, u.usuario as username,
              u.debe_cambiar_contrasena as must_change_password, u.version_sesion as session_version
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
      roleCode: row.role_code, roleName: row.role_name,
      permissions: permissions.rows.map((item) => item.code),
      mustChangePassword: Boolean(row.must_change_password), sessionVersion: Number(row.session_version),
    };
  }

  private issueToken(user: AuthenticatedUser) {
    const now = Math.floor(Date.now() / 1000);
    return this.signToken({ sub: user.id, username: user.username, version: user.sessionVersion,
      iat: now, exp: now + this.tokenLifetimeSeconds });
  }

  private validateNewPassword(password: string) {
    if (password.length < 10 || password.length > 128 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
      throw new BadRequestException('La contrasena debe tener entre 10 y 128 caracteres, una mayuscula, una minuscula y un numero.');
    }
  }

  private recordAttempt(username: string, ip: string, agent: string, successful: boolean) {
    return this.db.query(
      `insert into temo.intentos_inicio_sesion
         (usuario_normalizado, direccion_ip, exitoso, agente_usuario)
       values ($1, nullif($2, '')::inet, $3, nullif($4, ''))`, [username, ip, successful, agent],
    );
  }

  private normalizeIp(ip: string) { return ip.replace(/^::ffff:/, '').trim().slice(0, 45); }
  private signToken(payload: AccessTokenPayload) {
    const header = this.encodePart({ alg: 'HS256', typ: 'JWT' });
    const body = this.encodePart(payload);
    return `${header}.${body}.${this.createSignature(`${header}.${body}`)}`;
  }
  private verifyToken(token: string): AccessTokenPayload {
    const [header, body, signature] = token.split('.');
    if (!header || !body || !signature) throw new UnauthorizedException('La sesion no es valida.');
    const expected = Buffer.from(this.createSignature(`${header}.${body}`));
    const received = Buffer.from(signature);
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) throw new UnauthorizedException('La sesion no es valida.');
    try {
      const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as AccessTokenPayload;
      if (!payload.sub || !payload.username || !Number.isInteger(payload.version) || payload.exp <= Math.floor(Date.now() / 1000)) throw new Error();
      return payload;
    } catch { throw new UnauthorizedException('La sesion vencio o no es valida.'); }
  }
  private encodePart(value: object) { return Buffer.from(JSON.stringify(value)).toString('base64url'); }
  private createSignature(value: string) { return createHmac('sha256', this.secret).update(value).digest('base64url'); }
}
