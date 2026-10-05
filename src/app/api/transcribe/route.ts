import { transcribe } from '@/lib/models';
import { bad, clientIp, json, rateLimit } from '@/lib/http';
import { config } from '@/lib/config';

export const runtime = 'nodejs';
export const maxDuration = 60;

const NAME_TO_CODE: Record<string, string> = { arabic: 'ar', english: 'en', urdu: 'ur', indonesian: 'id', malay: 'id', french: 'fr', turkish: 'tr', bengali: 'bn', hindi: 'ur' };

export async function POST(req: Request) {
  if (!rateLimit(`stt:${clientIp(req)}`, 20)) return bad('too many requests', 429);
  let file: File | null = null;
  try { file = (await req.formData()).get('audio') as File | null; } catch { return bad('invalid request'); }
  if (!file || typeof file === 'string') return bad('no audio');
  if (file.size > config.limits.maxAudioBytes) return bad('audio too long', 413);
  if (file.size < 800) return bad('audio too short');
  try {
    const ext = (file.type.split('/')[1] ?? 'webm').split(';')[0].replace('mpeg', 'mp3').replace('x-m4a', 'm4a');
    const r = await transcribe(file, `question.${ext}`);
    const lang = r.language ? (NAME_TO_CODE[r.language.toLowerCase()] ?? (r.language.length === 2 ? r.language : undefined)) : undefined;
    return json({ text: r.text.trim(), lang });
  } catch (e) { console.error('stt failed', e); return bad('transcription failed', 502); }
}
