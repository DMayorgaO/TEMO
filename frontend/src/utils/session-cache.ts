const prefix = 'temo:session-cache:';
const ownerKey = `${prefix}owner`;

// Only nonfinancial preferences remain shared between browser sessions.
export function removeLegacyOperationalCache(storage: Storage): void {
  const preserved = new Set(['temo:remembered-username', 'temo:exchange-rate', 'temo:exchange-rate-saved-at', 'temo:operational-data-revision']);
  for (let index = storage.length - 1; index >= 0; index--) {
    const key = storage.key(index);
    if (key?.startsWith('temo:') && !preserved.has(key) && !key.startsWith('temo:role-permissions:')) storage.removeItem(key);
  }
}

export class SessionCache {
  private storage: Storage;
  private currentToken: () => string | null;

  constructor(storage: Storage, currentToken: () => string | null) {
    this.storage = storage;
    this.currentToken = currentToken;
  }

  clear(): void {
    for (let index = this.storage.length - 1; index >= 0; index--) {
      const key = this.storage.key(index);
      if (key?.startsWith(prefix)) this.storage.removeItem(key);
    }
  }

  getItem(key: string): string | null {
    const token = this.currentToken();
    if (!token || this.storage.getItem(ownerKey) !== token) {
      this.clear();
      return null;
    }
    return this.storage.getItem(`${prefix}${key}`);
  }

  setItem(key: string, value: string, expectedToken: string | null = this.currentToken()): void {
    const token = this.currentToken();
    // An old asynchronous response must not repopulate a closed or replacement session.
    if (!token || token !== expectedToken) return;
    if (this.storage.getItem(ownerKey) !== token) this.clear();
    this.storage.setItem(ownerKey, token);
    this.storage.setItem(`${prefix}${key}`, value);
  }
}
