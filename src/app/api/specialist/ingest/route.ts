import { z } from 'zod';
import { bad, isSpecialist, json } from '@/lib/http';
import { audit, sb, vec } from '@/lib/db';
import { embed } from '@/lib/models';
import { toEnglish, understand } from '@/lib/pipeline/steps';

export const runtime = 'nodejs';
export const maxDuration = 60;

const Src = z.object({ id: z.string().max(60), title: z.string().max(300), author: z.string().max(300).nullish(), publisher: z.string().max(300).nullish(), lang: z.string().max(5).default('en'), license: z.string().max(400).nullish(), url: z.string().max(400).nullish(), pages: z.number().nullish() });
const Chk = z.object({ id: z.string().max(80), source_id: z.string().max(60), path: z.string().max(200).nullish(), page: z.number().nullish(), lang: z.string().max(5).default('en'), text: z.string().min(20).max(6000) });
// A published answer taken verbatim from an approved reference. `lang` is the language it was published in; `locator` may be a page address.
const Fat = z.object({ code: z.string().max(40), section: z.string().max(200).default(''), page: z.number().nullish(), question: z.string().min(5).max(3000), answer: z.string().min(5).max(6000), reference: z.string().max(300).default(''), source_title: z.string().max(300), author_name: z.string().max(200), lang: z.string().max(5).default('en'), locator: z.string().max(300).nullish() });
const Body = z.object({ sources: z.array(Src).max(50).optional(), chunks: z.array(Chk).max(64).optional(), fatwas: z.array(Fat).max(8).optional(), replace_source: z.string().max(60).optional() });

/** Batched ingestion of an approved-source pack. The client sends small batches so each call stays well inside the time limit. */
export async function POST(req: Request) {
  if (!(await isSpecialist())) return bad('unauthorized', 401);
  let b: z.infer<typeof Body>;
  try { b = Body.parse(await req.json()); } catch (e) { return bad('invalid pack: ' + String((e as Error).message).slice(0, 200)); }
  const db = sb(); const out = { sources: 0, chunks: 0, fatwas: 0 };
  try {
    // Re-importing a reference replaces its earlier passages instead of leaving stale ones behind.
    if (b.replace_source) { const { error } = await db.from('chunks').delete().eq('source_id', b.replace_source); if (error) return bad(error.message, 500); }
    if (b.sources?.length) {
      const { error } = await db.from('sources').upsert(b.sources.map(s => ({ ...s, active: true })), { onConflict: 'id' });
      if (error) return bad(error.message, 500); out.sources = b.sources.length;
    }
    if (b.chunks?.length) {
      const embs = await embed(b.chunks.map(c => `${c.path ? c.path + '. ' : ''}${c.text}`.slice(0, 6000)));
      const { error } = await db.from('chunks').upsert(b.chunks.map((c, i) => ({ id: c.id, source_id: c.source_id, path: c.path ?? null, page: c.page ?? null, lang: c.lang, text: c.text, embedding: vec(embs[i]) })), { onConflict: 'id' });
      if (error) return bad(error.message, 500); out.chunks = b.chunks.length;
    }
    if (b.fatwas?.length) {
      // Published fatwas enter the verified-answer memory verbatim; only the question is normalised for matching.
      const us = await Promise.all(b.fatwas.map(f => understand(f.question, f.lang).catch(() => null)));
      // Answers published in another language keep their original text; an English rendering is stored beside it for matching and translation.
      const foreign = b.fatwas.map((f, i) => (f.lang !== 'en' ? i : -1)).filter(i => i >= 0);
      const enOf = new Map<number, string>();
      if (foreign.length) { const tr = await toEnglish(foreign.map(i => b.fatwas![i].answer)); foreign.forEach((i, k) => enOf.set(i, tr[k])); }
      const embs = await embed(b.fatwas.map((f, i) => us[i]?.q_en || f.question));
      const rows = b.fatwas.map((f, i) => ({
        code: f.code, q_canon: us[i]?.q_en || f.question, q_ar: f.lang === 'ar' ? f.question : (us[i]?.q_ar ?? null), q_embedding: vec(embs[i]), answer: f.answer, answer_lang: f.lang, answer_en: enOf.get(i) ?? f.answer,
        translations: f.lang === 'en' ? { en: f.answer } : { [f.lang]: f.answer, en: enOf.get(i) ?? f.answer }, source_title: f.source_title, source_locator: f.locator || [f.reference, f.page ? `p. ${f.page}` : ''].filter(Boolean).join(' · ') || null,
        source_quote: f.answer, author_name: f.author_name, verification: { verdict: 'verbatim', reason: 'answer text is the published fatwa itself' },
      }));
      const { error } = await db.from('verified_answers').upsert(rows, { onConflict: 'code' });
      if (error) return bad(error.message, 500); out.fatwas = rows.length;
    }
    await audit('specialist', 'ingest', 'pack', out);
    return json({ ok: true, ...out });
  } catch (e) { console.error('ingest failed', e); return bad('ingest failed: ' + String((e as Error).message).slice(0, 300), 502); }
}

/** Activate or withdraw a whole source. A withdrawn source drops out of retrieval immediately. */
export async function PATCH(req: Request) {
  if (!(await isSpecialist())) return bad('unauthorized', 401);
  const { id, active } = await req.json().catch(() => ({}));
  if (typeof id !== 'string' || typeof active !== 'boolean') return bad('invalid request');
  const { error } = await sb().from('sources').update({ active }).eq('id', id);
  if (error) return bad(error.message, 500);
  await audit('specialist', active ? 'source_activated' : 'source_withdrawn', id);
  return json({ ok: true });
}

export async function GET() {
  if (!(await isSpecialist())) return bad('unauthorized', 401);
  const db = sb();
  const { data: sources } = await db.from('sources').select('id,title,author,publisher,lang,pages,active').order('id');
  const counts: Record<string, number> = {};
  for (const s of (sources ?? []) as any[]) { const { count } = await db.from('chunks').select('id', { count: 'exact', head: true }).eq('source_id', s.id); counts[s.id] = count ?? 0; }
  return json({ sources: ((sources ?? []) as any[]).map(s => ({ ...s, chunks: counts[s.id] ?? 0 })) });
}
