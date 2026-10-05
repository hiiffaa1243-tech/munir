import { cookies } from 'next/headers';
import { bad, clientIp, json, rateLimit, SP_COOKIE } from '@/lib/http';
import { makeSpecialistCookie, passcodeMatches } from '@/lib/notebook/tokens';
import { audit } from '@/lib/db';
export const runtime = 'nodejs';
export async function POST(req: Request) {
  if (!rateLimit(`login:${clientIp(req)}`, 8, 10 * 60_000)) return bad('too many attempts', 429);
  const { passcode } = await req.json().catch(() => ({}));
  if (typeof passcode !== 'string' || !passcodeMatches(passcode)) return bad('wrong passcode', 401);
  (await cookies()).set(SP_COOKIE, makeSpecialistCookie(), { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 12 * 3600 });
  await audit('specialist', 'login', clientIp(req));
  return json({ ok: true });
}
export async function DELETE() { (await cookies()).delete(SP_COOKIE); return json({ ok: true }); }
