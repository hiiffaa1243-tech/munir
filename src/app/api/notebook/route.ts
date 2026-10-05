import { bad, clientIp, json, rateLimit } from '@/lib/http';
import { hashKey, validKey } from '@/lib/notebook/tokens';
import { sb } from '@/lib/db';
import { translateStrings } from '@/lib/pipeline/steps';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Everything saved in a notebook. The key is sent in a header, never in the URL. */
export async function GET(req: Request) {
  if (!rateLimit(`nb:${clientIp(req)}`, 60)) return bad('too many requests', 429);
  const key = req.headers.get('x-notebook-key');
  if (!validKey(key)) return bad('invalid key', 401);
  const db = sb();
  const { data: nb } = await db.from('notebooks').select('id').eq('key_hash', hashKey(key)).maybeSingle();
  if (!nb) return json({ items: [], exists: false });
  const id = (nb as any).id;
  db.from('notebooks').update({ last_seen: new Date().toISOString() }).eq('id', id).then(() => {}, () => {});
  const [{ data: inter }, { data: tickets }] = await Promise.all([
    db.from('interactions').select('id,created_at,lang,q_text,tier,answer').eq('notebook_id', id).eq('is_eval', false).order('created_at', { ascending: false }).limit(100),
    db.from('tickets').select('id,interaction_id,status,lang,va_id,resolved_at').eq('notebook_id', id).limit(100),
  ]);
  const tks = (tickets ?? []) as any[];
  const vaIds = [...new Set(tks.filter(t => t.status === 'resolved' && t.va_id).map(t => t.va_id))];
  const vas: Record<string, any> = {};
  if (vaIds.length) {
    const { data } = await db.from('verified_answers').select('id,code,answer,answer_lang,answer_en,translations,source_title,source_locator,source_quote,author_name,status').in('id', vaIds);
    for (const v of (data ?? []) as any[]) vas[v.id] = v;
  }
  const byInteraction = new Map(tks.map(t => [t.interaction_id, t]));
  const items = [] as any[];
  for (const it of (inter ?? []) as any[]) {
    const tk = byInteraction.get(it.id); let resolution: any = null;
    if (tk?.status === 'resolved' && vas[tk.va_id] && vas[tk.va_id].status === 'published') {
      const v = vas[tk.va_id]; const lang = tk.lang ?? it.lang ?? 'en';
      let text: string = v.translations?.[lang] ?? (lang === v.answer_lang ? v.answer : lang === 'en' ? v.answer_en : '');
      if (!text) {
        try { const tr = await translateStrings([v.answer_en], lang); text = tr.out[0]; if (!tr.approx) await db.from('verified_answers').update({ translations: { ...(v.translations ?? {}), [lang]: text } }).eq('id', v.id); }
        catch { text = v.answer_en; }
      }
      resolution = { text, author: v.author_name, source_title: v.source_title, source_locator: v.source_locator, source_quote: v.source_quote, resolved_at: tk.resolved_at };
    }
    items.push({ id: it.id, created_at: it.created_at, lang: it.lang, question: it.q_text, tier: it.tier, answer: it.answer, ticket: tk ? { id: tk.id, status: tk.status } : null, resolution });
  }
  return json({ items, exists: true });
}

/** Creates the notebook for a phone-generated key on first use (idempotent). Only the key's hash is stored. */
export async function POST(req: Request) {
  if (!rateLimit(`nbc:${clientIp(req)}`, 10)) return bad('too many requests', 429);
  const key = req.headers.get('x-notebook-key');
  if (!validKey(key)) return bad('invalid key', 401);
  const db = sb(); const key_hash = hashKey(key);
  const { data: nb } = await db.from('notebooks').select('id').eq('key_hash', key_hash).maybeSingle();
  if (!nb) { const ins = await db.from('notebooks').insert({ key_hash }); if (ins.error) return bad('could not create notebook', 500); }
  return json({ ok: true });
}
