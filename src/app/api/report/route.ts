import { z } from 'zod';
import { bad, clientIp, json, rateLimit } from '@/lib/http';
import { sb } from '@/lib/db';
export const runtime = 'nodejs';
const Body = z.object({ interaction_id: z.string().uuid(), note: z.string().max(500).optional() });
export async function POST(req: Request) {
  if (!rateLimit(`report:${clientIp(req)}`, 10)) return bad('too many requests', 429);
  let b: z.infer<typeof Body>;
  try { b = Body.parse(await req.json()); } catch { return bad('invalid request'); }
  await sb().from('reports').insert({ interaction_id: b.interaction_id, note: b.note ?? null });
  return json({ ok: true });
}
