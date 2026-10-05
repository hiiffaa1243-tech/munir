import { cookies } from 'next/headers';
import { checkSpecialistCookie } from '@/lib/notebook/tokens';
import { config } from '@/lib/config';

export const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
export const bad = (msg: string, status = 400) => json({ error: msg }, status);

export function clientIp(req: Request): string {
  return (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'local';
}

// Best-effort, per-instance rate limiter. Good enough to stop accidental loops and casual abuse.
const hits = new Map<string, number[]>();
export function rateLimit(key: string, max: number, windowMs = 60_000): boolean {
  const now = Date.now(); const arr = (hits.get(key) ?? []).filter(t => now - t < windowMs);
  if (arr.length >= max) { hits.set(key, arr); return false; }
  arr.push(now); hits.set(key, arr);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > windowMs) hits.delete(k);
  return true;
}

export const SP_COOKIE = 'munir_sp';
export async function isSpecialist(): Promise<boolean> {
  if (config.mock) return true;
  const c = (await cookies()).get(SP_COOKIE)?.value;
  return checkSpecialistCookie(c);
}
export function publicBase(req: Request): string {
  if (config.publicUrl) return config.publicUrl.replace(/\/$/, '');
  const u = new URL(req.url);
  const host = req.headers.get('x-forwarded-host') ?? u.host; const proto = req.headers.get('x-forwarded-proto') ?? u.protocol.replace(':', '');
  return `${proto}://${host}`;
}
