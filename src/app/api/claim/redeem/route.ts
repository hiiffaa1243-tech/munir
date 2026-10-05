import { z } from 'zod';
import { bad, clientIp, json, rateLimit } from '@/lib/http';
import { hashKey, normalizeCode, readClaimToken, validKey } from '@/lib/notebook/tokens';
import { sb } from '@/lib/db';

export const runtime = 'nodejs';
const Body = z.object({ token: z.string().max(400).optional(), code: z.string().max(16).optional(), notebook_key: z.string(), lang: z.string().max(5).optional() });

/** Phone redeems a claim. Creates the notebook on first use, otherwise merges the kiosk session into it. */
export async function POST(req: Request) {
  const ip = clientIp(req);
  let b: z.infer<typeof Body>;
  try { b = Body.parse(await req.json()); } catch { return bad('invalid request'); }
  if (!validKey(b.notebook_key)) return bad('invalid key');
  const db = sb();

  let claim: { nonce: string; session_id: string } | null = null;
  if (b.token) {
    const p = readClaimToken(b.token);
    if (!p) return bad('expired or invalid', 410);
    const { data } = await db.from('claims').select('nonce,session_id,used,expires_at').eq('nonce', p.n).maybeSingle();
    const row = data as any;
    if (!row || row.used || row.session_id !== p.sid) return bad('already used or invalid', 410);
    claim = row;
  } else if (b.code) {
    // Hand-typed codes are guessable in principle, so failed attempts are tightly limited per address.
    if (!rateLimit(`code:${ip}`, 5, 10 * 60_000)) return bad('too many attempts', 429);
    const { data } = await db.from('claims').select('nonce,session_id,used,expires_at').eq('code', normalizeCode(b.code)).maybeSingle();
    const row = data as any;
    if (!row || row.used || new Date(row.expires_at).getTime() < Date.now()) return bad('expired or invalid', 410);
    claim = row;
  } else return bad('token or code required');

  const key_hash = hashKey(b.notebook_key);
  let { data: nb } = await db.from('notebooks').select('id').eq('key_hash', key_hash).maybeSingle();
  if (!nb) {
    const ins = await db.from('notebooks').insert({ key_hash, lang: b.lang ?? null }).select('id').single();
    if (ins.error) return bad('could not create notebook', 500);
    nb = ins.data;
  }
  const notebookId = (nb as any).id as string;
  const upd = await db.from('claims').update({ used: true }).eq('nonce', claim!.nonce).eq('used', false).select('nonce');
  if (upd.error || !(upd.data as any[])?.length) return bad('already used', 410);
  await db.from('interactions').update({ notebook_id: notebookId }).eq('session_id', claim!.session_id).is('notebook_id', null);
  await db.from('tickets').update({ notebook_id: notebookId }).eq('session_id', claim!.session_id).is('notebook_id', null);
  return json({ ok: true });
}
