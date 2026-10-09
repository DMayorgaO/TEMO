export function createTemporaryPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const random = Array.from(bytes, value => alphabet[value & 31]).join('');
  return `Temo1-${random.match(/.{4}/g)!.join('-')}`;
}
