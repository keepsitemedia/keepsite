// A client's questionnaire link carries a token derived from their slug, not
// registered against a list. Nothing to maintain and no deploy per client; the
// cost is that a token cannot be revoked on its own. Rotating
// KEEPSITE_TOKEN_SECRET invalidates every outstanding link at once, and the
// blast radius of one leaked token is one client's intake file.
import { createHmac, timingSafeEqual } from 'node:crypto';

const LENGTH = 16;

export function mint(secret, slug, form) {
  return createHmac('sha256', secret)
    .update(`${slug}:${form}`)
    .digest()
    .subarray(0, LENGTH)
    .toString('base64url');
}

export function verify(secret, slug, form, token) {
  if (typeof token !== 'string' || !token) return false;
  const given = Buffer.from(token, 'base64url');
  if (given.length !== LENGTH) return false;
  return timingSafeEqual(given, Buffer.from(mint(secret, slug, form), 'base64url'));
}
