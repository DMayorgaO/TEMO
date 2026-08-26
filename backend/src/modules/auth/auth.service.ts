import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QueryResultRow } from 'pg';
import { DatabaseService } from '../database/database.service';

type AuthUserRow = QueryResultRow & {
  id: string;
  role_id: string;
  role_code: string;
  role_name: string;
  full_name: string;
  username: string;
};

type AccessTokenPayload = {
  sub: string;
  username: string;
  iat: number;
  exp: number;
};

export type AuthenticatedUser = {
  id: string;
  fullName: string;
  username: string;
  roleId: string;
  roleCode: string;
  roleName: string;
  permissions: string[];
};

const TOKEN_LIFETIME_SECONDS = 8 * 60 * 60;

@Injectable()
export class AuthService {
  private readonly secret: string;

  constructor(
    private readonly db: DatabaseService,
    config: ConfigService,
  ) {
    this.secret = config.get<string>('AUTH_SECRET')?.trim() ?? '';
    if (!this.secret) {
      throw new Error('AUTH_SECRET es obligatorio para firmar las sesiones.');
    }
  }

  async login(username: string, password: string, ip: string, userAgent: string) {
    const normalizedUsername = username.trim();
    if (!normalizedUsername || !password) {
      throw new UnauthorizedException('Usuario o contrasena incorrectos.');
    }

    const result = await this.db.query<AuthUserRow>(
      `select
         u.id_usuario as id,
         u.id_rol as role_id,
         r.codigo as role_code,
         r.nombre as role_name,
         u.nombre_completo as full_name,
         u.usuario as username
       from temo.usuarios u
       join temo.roles r on r.id_rol = u.id_rol
       where lower(u.usuario) = lower($1)
         and u.estado = 'ACTIVO'
         and r.estado = 'ACTIVO'
         and u.contrasena_hash = crypt($2, u.contrasena_hash)
       limit 1`,
      [normalizedUsername, password],
    );
    const userRow = result.rows[0];
    if (!userRow) {
      throw new UnauthorizedException('Usuario o contrasena incorrectos.');
    }

    const user = await this.buildAuthenticatedUser(userRow);
    const now = Math.floor(Date.now() / 1000);
    const token = this.signToken({
      sub: user.id,
      username: user.username,
      iat: now,
      exp: now + TOKEN_LIFETIME_SECONDS,
    });

    await this.db.transaction(async (client) => {
      await client.query(
        `update temo.usuarios set ultimo_acceso = now() where id_usuario = $1`,
        [user.id],
      );
      await client.query(
        `insert into temo.bitacora
           (id_usuario, accion, tabla, id_registro, direccion_ip, agente_usuario)
         values ($1, 'INICIAR_SESION', 'usuarios', $1, nullif($2, '')::inet, nullif($3, ''))`,
        [user.id, ip, userAgent],
      );
    });

    return {
      token,
      expiresIn: TOKEN_LIFETIME_SECONDS,
      user,
    };
  }

  async validateAccessToken(token: string) {
    const payload = this.verifyToken(token);
    const result = await this.db.query<AuthUserRow>(
      `select
         u.id_usuario as id,
         u.id_rol as role_id,
         r.codigo as role_code,
         r.nombre as role_name,
         u.nombre_completo as full_name,
         u.usuario as username
       from temo.usuarios u
       join temo.roles r on r.id_rol = u.id_rol
       where u.id_usuario = $1
         and u.usuario = $2
         and u.estado = 'ACTIVO'
         and r.estado = 'ACTIVO'
       limit 1`,
      [payload.sub, payload.username],
    );
    const userRow = result.rows[0];
    if (!userRow) {
      throw new UnauthorizedException('La sesion ya no es valida.');
    }

    return this.buildAuthenticatedUser(userRow);
  }

  private async buildAuthenticatedUser(user: AuthUserRow): Promise<AuthenticatedUser> {
    const permissionResult = await this.db.query<QueryResultRow & { code: string }>(
      `select p.codigo as code
       from temo.roles_permisos rp
       join temo.permisos p on p.id_permiso = rp.id_permiso
       where rp.id_rol = $1
         and p.estado = 'ACTIVO'
       order by p.codigo`,
      [user.role_id],
    );

    return {
      id: user.id,
      fullName: user.full_name,
      username: user.username,
      roleId: user.role_id,
      roleCode: user.role_code,
      roleName: user.role_name,
      permissions: permissionResult.rows.map((permission) => permission.code),
    };
  }

  private signToken(payload: AccessTokenPayload) {
    const header = this.encodePart({ alg: 'HS256', typ: 'JWT' });
    const body = this.encodePart(payload);
    const signature = this.createSignature(`${header}.${body}`);
    return `${header}.${body}.${signature}`;
  }

  private verifyToken(token: string): AccessTokenPayload {
    const [header, body, signature] = token.split('.');
    if (!header || !body || !signature) {
      throw new UnauthorizedException('La sesion no es valida.');
    }

    const expected = Buffer.from(this.createSignature(`${header}.${body}`));
    const received = Buffer.from(signature);
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
      throw new UnauthorizedException('La sesion no es valida.');
    }

    try {
      const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as AccessTokenPayload;
      if (!payload.sub || !payload.username || payload.exp <= Math.floor(Date.now() / 1000)) {
        throw new Error('expired');
      }
      return payload;
    } catch {
      throw new UnauthorizedException('La sesion vencio o no es valida.');
    }
  }

  private encodePart(value: object) {
    return Buffer.from(JSON.stringify(value)).toString('base64url');
  }

  private createSignature(value: string) {
    return createHmac('sha256', this.secret).update(value).digest('base64url');
  }
}
