import { z } from 'zod';
import { bad, clientIp, json, publicBase, rateLimit } from '@/lib/http';
import { makeClaimToken, makeShortCode } from '@/lib/notebook/tokens';
import { sb } from '@/lib/db';

export const runtime = 'nodejs';
const Body = z.object({ session_id: z.string().min(8).max(80) });

/** Kiosk asks for a one-time claim: a signed token (for the QR code) and a 6-character code (typed by hand). */
export async function POST(req: Request) {
  if (!rateLimit(`claim:${clientIp(req)}`, 30)) return bad('too many requests', 429);
  let b: z.infer<typeof Body>;
  try { b = Body.parse(await req.json()); } catch { return bad('invalid request'); }
  const { token, payload } = makeClaimToken(b.session_id);
  let code = makeShortCode();
  for (let i = 0; i < 3; i++) {
    const { error } = await sb().from('claims').insert({ nonce: payload.n, session_id: b.session_id, code, expires_at: new Date(payload.exp).toISOString() });
    if (!error) break;
    if (i === 2) return bad('could not create claim', 500);
    code = makeShortCode();
  }
  const base = publicBase(req);
  // The token travels in the URL fragment, so it never reaches server logs.
  return json({ url: `${base}/c#${token}`, code, short_url: `${base.replace(/^https?:\/\//, '')}/c`, expires_at: payload.exp });
}
