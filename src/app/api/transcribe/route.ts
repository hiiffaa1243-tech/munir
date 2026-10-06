import { transcribe } from '@/lib/models';
import { bad, clientIp, json, rateLimit } from '@/lib/http';
import { config } from '@/lib/config';

export const runtime = 'nodejs';
export const maxDuration = 60;

const NAME_TO_CODE: Record<string, string> = { arabic: 'ar', english: 'en', urdu: 'ur', indonesian: 'id', malay: 'id', french: 'fr', turkish: 'tr', bengali: 'bn', hindi: 'hi', chinese: 'zh', mandarin: 'zh' };

/**
 * Speech to text. `partial=1` asks for an interim caption while the person is still speaking: it must be fast and
 * cheap, and it never fails loudly (the client ignores it and asks again two seconds later). `lang` is the language
 * of the screen: a hint, never a constraint, because a pilgrim may speak any language at any screen.
 */
export async function POST(req: Request) {
  // Interim captions arrive every couple of seconds, so the allowance per address is generous.
  if (!rateLimit(`stt:${clientIp(req)}`, 90)) return bad('too many requests', 429);
  let form: FormData;
  try { form = await req.formData(); } catch { return bad('invalid request'); }
  const partial = ['1', 'true'].includes(String(form.get('partial') ?? ''));
  const hint = String(form.get('lang') ?? '').toLowerCase().slice(0, 5);
  const quiet = () => json({ text: '' });
  const file = form.get('audio') as File | null;
  if (!file || typeof file === 'string') return partial ? quiet() : bad('no audio');
  if (file.size > config.limits.maxAudioBytes) return partial ? quiet() : bad('audio too long', 413);
  if (file.size < 800) return partial ? quiet() : bad('audio too short');
  try {
    const ext = (file.type.split('/')[1] ?? 'webm').split(';')[0].replace('mpeg', 'mp3').replace('x-m4a', 'm4a');
    const r = await transcribe(file, `question.${ext}`, { partial, lang: hint || undefined });
    const lang = r.language ? (NAME_TO_CODE[r.language.toLowerCase()] ?? (r.language.length === 2 ? r.language : undefined)) : undefined;
    return json({ text: r.text.trim(), lang });
  } catch (e) {
    if (partial) return quiet();
    console.error('stt failed', e); return bad('transcription failed', 502);
  }
}
