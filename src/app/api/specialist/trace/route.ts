import { z } from 'zod';
import { bad, isSpecialist, json } from '@/lib/http';
import { ask } from '@/lib/pipeline';

export const runtime = 'nodejs';
export const maxDuration = 60;
const Body = z.object({ text: z.string().trim().min(2).max(500), lang: z.string().max(5).optional() });

/**
 * Runs one question and returns every intermediate result: how it was understood, which stored answers were
 * considered and why they were accepted or not, which passages were retrieved, what was drafted, and each verdict
 * of the independent check. For the specialist only; nothing is saved to a notebook and no ticket is opened.
 */
export async function POST(req: Request) {
  if (!(await isSpecialist())) return bad('unauthorized', 401);
  let b: z.infer<typeof Body>;
  try { b = Body.parse(await req.json()); } catch { return bad('invalid request'); }
  const trace: Record<string, unknown> = {};
  const a = await ask({ text: b.text, langHint: b.lang, sessionId: 'trace', kiosk: 'trace', isEval: true, trace });
  return json({ answer: { tier: a.tier, lang: a.lang, summary: a.summary, claims: a.claims, cases: a.cases, action: a.action, notice: a.notice, verified: a.verified ?? null }, flags: a.flags, timings: a.timings, trace });
}
