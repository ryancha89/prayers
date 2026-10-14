/**
 * RFC 4122 version-4 UUID, for idempotency keys the server stores in its ledger.
 *
 * No dependency: `uuid` is only in node_modules as somebody else's transitive dep, and on RN it
 * needs a `crypto.getRandomValues` polyfill anyway. Hermes exposes `crypto.getRandomValues` in
 * recent builds but not in every one, so it is used when present and Math.random fills in when it
 * is not. The fallback is not cryptographic, but an idempotency key only has to not collide within
 * one account's purchases — it is never a secret.
 */
type Crypto = { getRandomValues?<T extends Uint8Array>(a: T): T };

function randomBytes(n: number): Uint8Array {
  const bytes = new Uint8Array(n);
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.getRandomValues === 'function') {
    try {
      c.getRandomValues(bytes);
      return bytes;
    } catch {
      // Fall through: a polyfill that throws is no worse off than none.
    }
  }
  for (let i = 0; i < n; i++) bytes[i] = Math.floor(Math.random() * 256);
  return bytes;
}

export function uuidV4(): string {
  const b = randomBytes(16);
  // Setting the version and variant bits is what makes it a v4 UUID; there is no non-bitwise way.
  /* eslint-disable no-bitwise */
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // RFC 4122 variant
  /* eslint-enable no-bitwise */
  const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
