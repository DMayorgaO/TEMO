// An uncertain write may only resend the exact original body under the same session.
// Never persist directory contents or tokens in browser storage for retry handling.
export class DirectoryWriteIntent {
  private pending?: { session: string; body: string };
  private readonly newId: () => string;
  constructor(newId: () => string) { this.newId = newId; }

  prepare(payload: object, session: string): string {
    if (!session) throw new Error('Inicie sesion antes de guardar el directorio.');
    if (this.pending) {
      if (this.pending.session !== session) throw new Error('La sesion cambio. Revise el directorio antes de iniciar otro guardado.');
      return this.pending.body;
    }
    const body = JSON.stringify({ ...payload, requestId: this.newId() });
    this.pending = { session, body };
    return body;
  }

  complete() { this.pending = undefined; }

  rejected(status?: number) {
    // A transport error, timeout or server failure may have happened after COMMIT.
    if (status !== undefined && [400, 401, 403, 404, 409, 413, 422, 429].includes(status)) this.complete();
  }

  get unresolved() { return Boolean(this.pending); }
}
