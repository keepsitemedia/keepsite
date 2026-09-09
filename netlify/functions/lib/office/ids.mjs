// Ids sort by creation time because Blobs lists keys in byte order and the
// office shows every list newest-last. Six random base32 characters after the
// second keep two writes in the same second apart.
import { randomBytes } from 'node:crypto';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';
export const ID = /^[0-9]{8}T[0-9]{6}[a-z2-7]{6}$/;

export function newId(now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, '').slice(0, 15);
  let rand = '';
  for (const b of randomBytes(6)) rand += ALPHABET[b % 32];
  return `${stamp}${rand}`;
}
