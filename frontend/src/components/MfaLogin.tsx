import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowLeft, Download, ShieldCheck } from 'lucide-react';

export type MfaChallenge = { mfaRequired: true; challenge: string; enrollment: boolean; expiresIn: number; qrDataUrl: string | null };

export function MfaLogin<T extends { recoveryCodes?: string[] }>({ challenge, verify, complete, cancel }: {
  challenge: MfaChallenge;
  verify: (code: string, recoveryCode: string) => Promise<T>;
  complete: (response: T) => void;
  cancel: () => void;
}) {
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState<T | null>(null);
  const [saved, setSaved] = useState(false);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setExpired(true), challenge.expiresIn * 1000);
    return () => window.clearTimeout(timer);
  }, [challenge]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || expired) return;
    setSaving(true); setError('');
    try {
      const response = await verify(recovery ? '' : code, recovery ? code : '');
      setCode('');
      if (response.recoveryCodes?.length) setConfirmed(response);
      else complete(response);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No fue posible verificar el codigo.');
      setCode('');
    } finally { setSaving(false); }
  }

  function downloadCodes() {
    const url = URL.createObjectURL(new Blob(['TEMO - Codigos de recuperacion de un uso\n\n', ...(confirmed?.recoveryCodes ?? []).map(value => value + '\n')], { type: 'text/plain' }));
    const link = document.createElement('a'); link.href = url; link.download = 'TEMO-recuperacion.txt'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <div className="mfa-content">
    <ShieldCheck className="mfa-shield" size={30} aria-hidden="true" />
    <h1>{confirmed ? 'Verificación activada' : expired ? 'Verificación vencida' : challenge.enrollment ? 'Vincular VIP Access' : 'Verificar acceso'}</h1>
    {confirmed ? <>
      <p className="muted-copy">Guarda estos códigos en un lugar seguro, separado de tu teléfono. Cada código permite un acceso y solo se muestra una vez.</p>
      <div className="mfa-recovery-codes">{confirmed.recoveryCodes?.map(value => <code key={value}>{value}</code>)}</div>
      <button type="button" className="secondary-button login-submit" onClick={downloadCodes}><Download size={18} />Descargar códigos</button>
      <label className="remember-control"><input type="checkbox" checked={saved} onChange={event => setSaved(event.target.checked)} />He guardado mis códigos</label>
      <button type="button" className="primary-button login-submit" disabled={!saved} onClick={() => complete(confirmed)}><ShieldCheck size={18} />Continuar</button>
    </> : expired ? <>
      <p className="muted-copy">Inicia sesión nuevamente para continuar la verificación.</p>
      <button type="button" className="secondary-button login-submit" onClick={cancel}><ArrowLeft size={18} />Volver</button>
    </> : <>
      {challenge.enrollment && challenge.qrDataUrl && <>
        <p className="muted-copy">Agrega una cuenta en VIP Access y escanea este QR de TEMO.</p>
        <img className="mfa-qr" src={challenge.qrDataUrl} alt="QR para vincular tu cuenta TEMO con VIP Access" />
      </>}
      <form className="login-form" onSubmit={submit}>
        <label className="form-field">{recovery ? 'Código de recuperación' : 'Código de VIP Access'}
          <input key={recovery ? 'recovery' : 'otp'} className={recovery ? 'mfa-recovery-input' : 'mfa-otp-input'} autoFocus
            autoComplete={recovery ? 'off' : 'one-time-code'} inputMode={recovery ? 'text' : 'numeric'}
            value={code} onChange={event => setCode(recovery ? event.target.value.toUpperCase().replace(/[^A-F0-9-]/g, '').slice(0, 27) : event.target.value.replace(/\D/g, '').slice(0, 6))}
            minLength={recovery ? 24 : 6} maxLength={recovery ? 27 : 6} pattern={recovery ? '[A-Fa-f0-9-]{24,27}' : '[0-9]{6}'} required />
        </label>
        {error && <p className="login-error" role="alert">{error}</p>}
        <button type="submit" className="primary-button login-submit" disabled={saving}><ShieldCheck size={18} />{saving ? 'Verificando...' : challenge.enrollment ? 'Activar y verificar' : 'Verificar'}</button>
        {!challenge.enrollment && <button type="button" className="login-recovery-link" disabled={saving} onClick={() => { setRecovery(!recovery); setCode(''); setError(''); }}>{recovery ? 'Usar VIP Access' : 'Usar código de recuperación'}</button>}
        <button type="button" className="secondary-button login-submit" disabled={saving} onClick={cancel}><ArrowLeft size={18} />Volver</button>
      </form>
    </>}
  </div>;
}
