import { createHash, randomBytes } from 'node:crypto';
import { Injectable, ServiceUnavailableException, UnauthorizedException, HttpException, HttpStatus, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TOTP, Secret } from 'otpauth';
import { toDataURL } from 'qrcode';
import { DatabaseService } from '../database/database.service';
import { MfaSecretVault } from './mfa-secret-vault';

@Injectable()
export class MfaService implements OnModuleInit {
  private readonly vault: MfaSecretVault | null;
  private readonly production: boolean;
  constructor(private readonly db: DatabaseService, config: ConfigService) {
    const key = config.get<string>('MFA_ENCRYPTION_KEY', '').trim();
    this.production = config.get<string>('APP_ENV', 'development') === 'production';
    if (this.production && !key) throw new Error('Configure MFA_ENCRYPTION_KEY antes de desplegar la API.');
    this.vault = key ? new MfaSecretVault(key) : null;
  }

  async onModuleInit() {
    if (!this.production) return;
    const schema = await this.db.query(`select to_regclass('temo.usuario_mfa') is not null
      and to_regclass('temo.desafios_mfa') is not null and to_regclass('temo.recuperacion_mfa') is not null as ready`);
    if (!schema.rows[0]?.ready) throw new Error('Aplique la migracion MFA antes de desplegar la API.');
  }

  private requireVault() {
    if (!this.vault) throw new ServiceUnavailableException('La verificacion en dos pasos no esta configurada. Contacte al responsable del sistema.');
    return this.vault;
  }

  async begin(user: { id: string; username: string; sessionVersion: number }) {
    const vault = this.requireVault();
    const token = randomBytes(32).toString('base64url');
    const secret = new Secret({ size: 20 }).base32;
    const result = await this.db.transaction(async client => {
      // Serialize setup and challenge creation for the same identity.
      const current = (await client.query(`select version_sesion, estado from temo.usuarios where id_usuario=$1 for update`, [user.id])).rows[0];
      if (!current || current.estado !== 'ACTIVO' || current.version_sesion !== user.sessionVersion) throw new UnauthorizedException('Inicie sesion nuevamente.');
      const recent = (await client.query(`select count(*)::int as total from temo.desafios_mfa where id_usuario=$1 and creado_en > now()-interval '1 minute'`, [user.id])).rows[0];
      if (recent.total >= 5) throw new HttpException('Espere un minuto antes de intentar nuevamente.', HttpStatus.TOO_MANY_REQUESTS);
      const mfa = (await client.query(`select bloqueado_hasta from temo.usuario_mfa where id_usuario=$1`, [user.id])).rows[0];
      if (mfa?.bloqueado_hasta && new Date(mfa.bloqueado_hasta).getTime() > Date.now()) throw new HttpException('Verificacion bloqueada temporalmente. Espere 15 minutos.', HttpStatus.TOO_MANY_REQUESTS);
      const enrollment = !mfa;
      if (enrollment) {
        const failed = (await client.query(`select coalesce(sum(intentos),0)::int as total from temo.desafios_mfa
          where id_usuario=$1 and creado_en > now()-interval '15 minutes'`, [user.id])).rows[0];
        if (failed.total >= 5) throw new HttpException('Verificacion bloqueada temporalmente. Espere 15 minutos.', HttpStatus.TOO_MANY_REQUESTS);
      }
      await client.query(`insert into temo.desafios_mfa(token_hash,id_usuario,version_sesion,alta,secreto_cifrado,vence_en)
        values($1,$2,$3,$4,$5,now()+interval '5 minutes')`,
      [this.hash(token), user.id, user.sessionVersion, enrollment, enrollment ? vault.encrypt(user.id, secret) : null]);
      await client.query(`delete from temo.desafios_mfa where vence_en < now()-interval '1 day'`);
      return enrollment;
    });
    const totp = new TOTP({ issuer: 'TEMO', label: user.username, algorithm: 'SHA1', digits: 6, period: 30, secret });
    return { mfaRequired: true as const, challenge: token, enrollment: result, expiresIn: 300,
      qrDataUrl: result ? await toDataURL(totp.toString(), { width: 256, margin: 2, errorCorrectionLevel: 'M' }) : null };
  }

  async verify(challenge: string, code: string, recoveryCode: string, ip: string, agent: string) {
    const vault = this.requireVault();
    if (!/^[A-Za-z0-9_-]{43}$/.test(challenge)) throw new UnauthorizedException('Verificacion invalida o vencida. Inicie sesion nuevamente.');
    const result = await this.db.transaction(async client => {
      const found = (await client.query(`select id_usuario from temo.desafios_mfa where token_hash=$1`, [this.hash(challenge)])).rows[0];
      if (!found) return null;
      const user = (await client.query(`select u.version_sesion,u.estado,r.codigo as rol,r.estado as rol_estado from temo.usuarios u
        join temo.roles r using(id_rol) where id_usuario=$1 for update of u`, [found.id_usuario])).rows[0];
      const row = (await client.query(`select * from temo.desafios_mfa where token_hash=$1 for update`, [this.hash(challenge)])).rows[0];
      if (!row || row.consumido_en || new Date(row.vence_en).getTime() <= Date.now() || row.intentos >= 5
        || !user || user.estado !== 'ACTIVO' || user.rol !== 'JEFA' || user.rol_estado !== 'ACTIVO' || user.version_sesion !== row.version_sesion) return null;
      const mfa = (await client.query(`select * from temo.usuario_mfa where id_usuario=$1 for update`, [found.id_usuario])).rows[0];
      if (row.alta === Boolean(mfa) || (mfa?.bloqueado_hasta && new Date(mfa.bloqueado_hasta).getTime() > Date.now())) return null;
      if (row.alta) {
        const failed = (await client.query(`select coalesce(sum(intentos),0)::int as total from temo.desafios_mfa
          where id_usuario=$1 and creado_en > now()-interval '15 minutes'`, [found.id_usuario])).rows[0];
        if (failed.total >= 5) return null;
      }
      let valid = false;
      let step = -1;
      const normalizedRecovery = recoveryCode.replace(/-/g, '').toUpperCase();
      if (mfa && recoveryCode) {
        if (/^[A-F0-9]{24}$/.test(normalizedRecovery)) {
          valid = Boolean((await client.query(`update temo.recuperacion_mfa set consumido_en=now()
            where id_usuario=$1 and codigo_hash=$2 and consumido_en is null returning codigo_hash`,
          [found.id_usuario, this.hash(`${found.id_usuario}:${normalizedRecovery}`)])).rowCount);
        }
      } else if (/^\d{6}$/.test(code)) {
        const secret = vault.decrypt(found.id_usuario, row.alta ? row.secreto_cifrado : mfa.secreto_cifrado);
        const timestamp = Date.now();
        const delta = new TOTP({ secret, digits: 6, period: 30, algorithm: 'SHA1' }).validate({ token: code, timestamp, window: 1 });
        step = Math.floor(timestamp / 30000) + (delta ?? 0);
        valid = delta !== null && (!mfa || step > Number(mfa.ultimo_paso));
      }
      if (!valid) {
        await client.query(`update temo.desafios_mfa set intentos=intentos+1 where token_hash=$1`, [this.hash(challenge)]);
        if (mfa) await client.query(`update temo.usuario_mfa set
          intentos_fallidos=case when bloqueado_hasta <= now() then 1 else intentos_fallidos+1 end,
          bloqueado_hasta=case when (case when bloqueado_hasta <= now() then 1 else intentos_fallidos+1 end)>=5 then now()+interval '15 minutes' else null end
          where id_usuario=$1`, [found.id_usuario]);
        await this.audit(client, found.id_usuario, 'MFA_FALLIDO', ip, agent);
        return null;
      }
      const recoveryCodes: string[] = [];
      if (row.alta) {
        await client.query(`insert into temo.usuario_mfa(id_usuario,secreto_cifrado,ultimo_paso) values($1,$2,$3)`, [found.id_usuario, row.secreto_cifrado, step]);
        for (let index = 0; index < 8; index++) {
          const recovery = randomBytes(12).toString('hex').toUpperCase();
          await client.query(`insert into temo.recuperacion_mfa(id_usuario,codigo_hash) values($1,$2)`, [found.id_usuario, this.hash(`${found.id_usuario}:${recovery}`)]);
          recoveryCodes.push(recovery.match(/.{6}/g)!.join('-'));
        }
        await client.query(`update temo.usuarios set version_sesion=version_sesion+1 where id_usuario=$1`, [found.id_usuario]);
      } else {
        await client.query(`update temo.usuario_mfa set ultimo_paso=greatest(ultimo_paso,$2),intentos_fallidos=0,bloqueado_hasta=null where id_usuario=$1`, [found.id_usuario, step]);
      }
      await client.query(`update temo.desafios_mfa set consumido_en=now() where token_hash=$1`, [this.hash(challenge)]);
      await this.audit(client, found.id_usuario, row.alta ? 'MFA_ACTIVADO' : recoveryCode ? 'MFA_RECUPERACION' : 'MFA_VERIFICADO', ip, agent);
      return { userId: found.id_usuario as string, sessionVersion: user.version_sesion + (row.alta ? 1 : 0), recoveryCodes };
    });
    if (!result) throw new UnauthorizedException('Codigo incorrecto, reutilizado o verificacion vencida. Intente con un codigo nuevo o inicie sesion nuevamente.');
    return result;
  }

  private hash(value: string) { return createHash('sha256').update(value).digest('hex'); }
  private audit(client: { query: (sql: string, params: unknown[]) => unknown }, id: string, event: string, ip: string, agent: string) {
    return client.query(`insert into temo.bitacora(id_usuario,accion,tabla,id_registro,datos_nuevos,direccion_ip,agente_usuario)
      values($1,'ACTUALIZAR','usuarios',$1,jsonb_build_object('evento',$2::text),nullif($3,'')::inet,nullif($4,''))`,
    [id, event, ip.replace(/^::ffff:/, '').slice(0, 45), agent.slice(0, 1000)]);
  }
}
