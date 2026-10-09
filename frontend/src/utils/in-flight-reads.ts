export class InFlightReads {
  private pending = new Map<string, Promise<unknown>>();

  run<T>(key: string, load: () => Promise<T>): Promise<T> {
    let request = this.pending.get(key) as Promise<T> | undefined;
    if (!request) {
      request = load().finally(() => {
        if (this.pending.get(key) === request) this.pending.delete(key);
      });
      this.pending.set(key, request);
    }
    // Each caller owns its JSON data; consumers must not mutate another view.
    return request.then(value => structuredClone(value));
  }

  clear() {
    this.pending.clear();
  }
}
