import { z } from 'zod';
import { ask } from '@/lib/pipeline';
import { bad, clientIp, rateLimit } from '@/lib/http';
import { config } from '@/lib/config';
import { hashKey, validKey } from '@/lib/notebook/tokens';
import { sb } from '@/lib/db';

export const runtime = 'nodejs';
export const maxDuration = 60;

const Body = z.object({
  text: z.string().trim().min(2).max(config.limits.maxQuestionChars * 2 + 100),   // a clarification travels with the question it answers
  lang: z.string().max(5).optional(),
  session_id: z.string().max(80).optional(),
  kiosk: z.string().max(40).optional(),
  clarified: z.boolean().optional(),
  voice: z.boolean().optional(),       // the text came from speech recognition
  confirmed: z.boolean().optional(),   // the asker confirmed this wording after a "did you mean" (or declined the suggestion)
});

/** Streams newline-delimited JSON: {"stage": "..."} progress lines, then {"result": Answer}. */
export async function POST(req: Request) {
  let body: z.infer<typeof Body>;
  try { body = Body.parse(await req.json()); } catch { return bad('invalid request'); }
  if (!body.clarified && body.text.length > config.limits.maxQuestionChars) body.text = body.text.slice(0, config.limits.maxQuestionChars);
  if (!rateLimit(`ask:${body.session_id ?? clientIp(req)}`, config.limits.askPerMinute) || !rateLimit(`ask-ip:${clientIp(req)}`, config.limits.askPerMinute * 3)) return bad('too many requests', 429);

  // A question asked from the notebook is attached to that notebook directly.
  let notebookId: string | null = null;
  const key = req.headers.get('x-notebook-key');
  if (validKey(key)) {
    try { const { data } = await sb().from('notebooks').select('id').eq('key_hash', hashKey(key)).maybeSingle(); notebookId = (data as any)?.id ?? null; } catch { /* ignore */ }
  }

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(ctrl) {
      // If the visitor walks away mid-answer the stream closes; the pipeline must still finish so the question is recorded and a referral still opens its ticket.
      const send = (o: unknown) => { try { ctrl.enqueue(enc.encode(JSON.stringify(o) + '\n')); } catch { /* client gone */ } };
      try {
        const result = await ask({ text: body.text, langHint: body.lang, sessionId: body.session_id, kiosk: body.kiosk, clarified: body.clarified, voice: body.voice, confirmed: body.confirmed, notebookId }, stage => send({ stage }));
        // Internal diagnostics stay on the server.
        // Only the facts a visitor may see travel to the browser: which model checked the answer and how long it took.
        const f = result.flags as Record<string, any>;
        const flags = { verify: f.verify ? { checked: f.verify.checked, model: f.verify.model, independent: f.verify.independent } : undefined, refer_reason: f.refer_reason, explain: f.explain ? { shown: !!f.explain.shown, reason: f.explain.reason } : undefined };
        // `suggest` (tier 'confirm') and `explained` (tier 'verified') are fields of the answer itself and travel with it.
        send({ result: { ...result, flags, timings: { total: result.timings.total } } });
      } catch (e) {
        console.error('ask failed', e);
        send({ error: 'pipeline_error' });
      } finally { try { ctrl.close(); } catch { /* already closed */ } }
    },
  });
  return new Response(stream, { headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' } });
}
