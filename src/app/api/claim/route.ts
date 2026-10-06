import { z } from 'zod';
import { bad, clientIp, json, publicBase, rateLimit } from '@/lib/http';
import { CLAIMABLE_MS, claimScope, makeClaimToken, makeShortCode } from '@/lib/notebook/tokens';
import { sb } from '@/lib/db';

export const runtime = 'nodejs';
const Body = z.object({ session_id: z.string().min(8).max(80), interaction_id: z.string().uuid() });

/**
 * Kiosk asks for a one-time claim: a signed token (for the QR code) and a 6-character code (typed by hand).
 * The claim covers ONE answer, never the session: a kiosk session is shared by everyone who stands at the device,
 * so the phone that scans the code receives the answer on screen and nothing else.
 */
export async function POST(req: Request) {
  if (!rateLimit(`claim:${clientIp(req)}`, 30)) return bad('too many requests', 429);
  let b: z.infer<typeof Body>;
  try { b = Body.parse(await req.json()); } catch { return bad('invalid request'); }
  const db = sb();
  const interactionId = b.interaction_id.toLowerCase();
  const { data: it, error: e0 } = await db.from('interactions').select('id,session_id,notebook_id,created_at').eq('id', interactionId).maybeSingle();
  if (e0) return bad('could not create claim', 500);
  const row = it as { id: string; session_id: string | null; notebook_id: string | null; created_at: string } | null;
  // Only the session that asked may hand its answer over, only once, and only while it is still fresh.
  if (!row || row.session_id !== b.session_id) return bad('unknown answer', 404);
  if (row.notebook_id) return bad('already saved');
  if (Date.now() - new Date(row.created_at).getTime() > CLAIMABLE_MS) return bad('answer too old');

  const scope = claimScope(interactionId);
  const { token, payload } = makeClaimToken(scope);
  let code = makeShortCode();
  for (let i = 0; i < 3; i++) {
    const { error } = await db.from('claims').insert({ nonce: payload.n, session_id: scope, code, expires_at: new Date(payload.exp).toISOString() });
    if (!error) break;
    if (i === 2) return bad('could not create claim', 500);
    code = makeShortCode();
  }
  const base = publicBase(req);
  // The token travels in the URL fragment, so it never reaches server logs.
  return json({ url: `${base}/c#${token}`, code, short_url: `${base.replace(/^https?:\/\//, '')}/c`, expires_at: payload.exp });
}
