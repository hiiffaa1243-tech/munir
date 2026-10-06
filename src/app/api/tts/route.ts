import { z } from 'zod';
import { speak, speechType } from '@/lib/models';
import { bad, clientIp, rateLimit } from '@/lib/http';
import { LANG_NAMES } from '@/lib/config';

export const runtime = 'nodejs';
export const maxDuration = 60;
const Body = z.object({ text: z.string().min(1).max(4000), lang: z.string().max(5).default('en') });

// The player asks for one short segment at a time, so an answer is several requests.
export async function POST(req: Request) {
  if (!rateLimit(`tts:${clientIp(req)}`, 60)) return bad('too many requests', 429);
  let b: z.infer<typeof Body>;
  try { b = Body.parse(await req.json()); } catch { return bad('invalid request'); }
  try {
    const audio = await speak(b.text, LANG_NAMES[b.lang] ?? 'English');
    return new Response(audio, { headers: { 'content-type': speechType(), 'cache-control': 'private, max-age=3600' } });
  } catch (e) { console.error('tts failed', e); return bad('speech failed', 502); }
}
