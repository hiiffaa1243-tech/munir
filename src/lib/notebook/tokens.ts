// Anonymous, capability-based notebook: one-time claim tokens, short codes, and hashed notebook keys.
import { createHmac, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { config, secretIsStrong } from '@/lib/config';

const b64u = (b: Buffer) => b.toString('base64url');
const sign = (data: string) => b64u(createHmac('sha256', config.appSecret).update(data).digest());

export interface ClaimPayload { sid: string; exp: number; n: string }

export function makeClaimToken(sessionId: string, ttlMs = 10 * 60_000, now = Date.now()): { token: string; payload: ClaimPayload } {
  const payload: ClaimPayload = { sid: sessionId, exp: now + ttlMs, n: b64u(randomBytes(9)) };
  const body = b64u(Buffer.from(JSON.stringify(payload)));
  return { token: `${body}.${sign(body)}`, payload };
}

// A claim covers exactly one answer. Its scope is stored in the free-text `claims.session_id` column and in the
// token's `sid` as "i:<interaction id>". A scope without that prefix is a legacy whole-session claim and is refused.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const claimScope = (interactionId: string): string => `i:${interactionId}`;
/** The interaction a claim scope covers, or null when the scope is not a single-answer scope. */
export function scopeInteraction(scope: unknown): string | null {
  if (typeof scope !== 'string' || !scope.startsWith('i:')) return null;
  const id = scope.slice(2);
  return UUID_RE.test(id) ? id.toLowerCase() : null;
}
export const CLAIMABLE_MS = 30 * 60_000;   // an answer can be claimed for half an hour after it was given

export function readClaimToken(token: string, now = Date.now()): ClaimPayload | null {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expect = sign(body);
  const a = Buffer.from(sig); const b = Buffer.from(expect);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString()) as ClaimPayload;
    if (typeof p.sid !== 'string' || typeof p.exp !== 'number' || p.exp < now) return null;
    return p;
  } catch { return null; }
}

// 31 symbols, no look-alikes (0/O, 1/I/L). 31^6 is about 887 million codes.
export const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export function makeShortCode(len = 6): string {
  const bytes = randomBytes(len * 2); let out = '';
  for (let i = 0; out.length < len && i < bytes.length; i++) { const v = bytes[i]; if (v < 248) out += CODE_ALPHABET[v % 31]; }
  return out.length === len ? out : makeShortCode(len);
}
export const normalizeCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');

export const newNotebookKey = () => b64u(randomBytes(32));
export const hashKey = (key: string) => createHash('sha256').update(key).digest('hex');
export const validKey = (key: unknown): key is string => typeof key === 'string' && /^[A-Za-z0-9_-]{40,64}$/.test(key);

// Specialist session cookie (single shared passcode in this version).
export function makeSpecialistCookie(ttlMs = 12 * 3600_000, now = Date.now()): string { const exp = String(now + ttlMs); return `${exp}.${sign('sp:' + exp)}`; }
export function checkSpecialistCookie(v: string | undefined, now = Date.now()): boolean {
  if (!v || !secretIsStrong()) return false; const [exp, sig] = v.split('.'); if (!exp || !sig) return false;
  const expect = sign('sp:' + exp); const a = Buffer.from(sig); const b = Buffer.from(expect);
  return a.length === b.length && timingSafeEqual(a, b) && Number(exp) > now;
}
export function passcodeMatches(given: string): boolean {
  const want = config.specialistPasscode; if (!want || !secretIsStrong()) return false;
  const a = createHash('sha256').update(given).digest(); const b = createHash('sha256').update(want).digest();
  return timingSafeEqual(a, b);
}
