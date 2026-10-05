import { z } from 'zod';
import { ask } from '@/lib/pipeline';
import { bad, clientIp, rateLimit } from '@/lib/http';
import { config } from '@/lib/config';
import { hashKey, validKey } from '@/lib/notebook/tokens';
import { sb } from '@/lib/db';

export const runtime = 'nodejs';
export const maxDuration = 60;

const Body = z.object({
  text: z.string().trim().min(2).max(config.limits.maxQuestionChars),
  lang: z.string().max(5).optional(),
  session_id: z.string().max(80).optional(),
  kiosk: z.string().max(40).optional(),
  clarified: z.boolean().optional(),
});

/** Streams newline-delimited JSON: {"stage": "..."} progress lines, then {"result": Answer}. */
export async function POST(req: Request) {
  let body: z.infer<typeof Body>;
  try { body = Body.parse(await req.json()); } catch { return bad('invalid request'); }
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
      const send = (o: unknown) => ctrl.enqueue(enc.encode(JSON.stringify(o) + '\n'));
      try {
        const result = await ask({ text: body.text, langHint: body.lang, sessionId: body.session_id, kiosk: body.kiosk, clarified: body.clarified, notebookId }, stage => send({ stage }));
        send({ result });
      } catch (e) {
        console.error('ask failed', e);
        send({ error: 'pipeline_error' });
      } finally { ctrl.close(); }
    },
  });
  return new Response(stream, { headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' } });
}
