// The pure decision behind the office guard, split out of src/middleware.ts
// so it can run under node --test instead of only inside an Astro/Netlify
// Edge request. middleware.ts is left as a thin adapter over this.

// netlify.toml headers reach static files only, so every rendered office
// response carries its own. These are the "/*" values from netlify.toml,
// verbatim, plus the two office-only additions (X-Robots-Tag, Cache-Control)
// that make an office response uncacheable and unindexable everywhere.
export const OFFICE_HEADERS = {
  'X-Robots-Tag': 'noindex, nofollow',
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  'Content-Security-Policy':
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'; upgrade-insecure-requests",
};

export const isOffice = (pathname) => /^\/office(\/|$)/.test(pathname);
export const isPublic = (pathname) => pathname === '/office/login/' || pathname === '/office/api/login';
export const isApi = (pathname) => pathname.startsWith('/office/api/');

// auth is a requireAdmin() result; only read when the path is office and
// not public, so decide() never needs it for skip/public paths.
export function decide(pathname, auth) {
  if (!isOffice(pathname)) return { kind: 'skip' };
  if (isPublic(pathname)) return { kind: 'public' };
  if (!auth.ok) {
    return isApi(pathname)
      ? { kind: 'refuse', status: 401 }
      : { kind: 'refuse', status: 302, location: `/office/login/?next=${encodeURIComponent(pathname)}` };
  }
  return { kind: 'pass', admin: auth.user ?? null, csrf: auth.csrf };
}

export function applyHeaders(res) {
  for (const [k, v] of Object.entries(OFFICE_HEADERS)) res.headers.set(k, v);
  return res;
}
