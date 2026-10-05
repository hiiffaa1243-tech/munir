import { bad, clientIp, json, rateLimit } from '@/lib/http';
import { sb, vec } from '@/lib/db';
import { embed } from '@/lib/models';
import { toEnglish, understand } from '@/lib/pipeline/steps';
import { DORAR, chunkPage, fetchHtml, parseIndex, parsePage } from '@/lib/sync/dorar';

export const runtime = 'nodejs';
export const maxDuration = 60;

const BATCH = 3;            // pages per call, fetched one after another out of courtesy to the reference site
const BUDGET_MS = 38_000;   // stop starting new pages after this
const REFRESH_EVERY_MS = 20 * 3600_000;

let indexCache: { at: number; ids: number[] } | null = null;
async function hajjPages(): Promise<number[]> {
  if (indexCache && Date.now() - indexCache.at < 3600_000) return indexCache.ids;
  const ids = parseIndex(await fetchHtml(DORAR.index));
  if (ids.length) indexCache = { at: Date.now(), ids };
  return ids;
}

/** Fetch one page of the reference, replace its chunks, and store its question-and-answer summary verbatim. */
async function ingestPage(id: number) {
  const db = sb();
  const p = parsePage(id, await fetchHtml(DORAR.page(id)));
  const chunks = chunkPage(p);
  await db.from('chunks').delete().eq('source_id', DORAR.sourceId).eq('page', id);
  if (chunks.length) {
    const embs = await embed(chunks.map(c => `${c.path}. ${c.text}`.slice(0, 6000)));
    const { error } = await db.from('chunks').upsert(chunks.map((c, i) => ({ ...c, embedding: vec(embs[i]) })), { onConflict: 'id' });
    if (error) throw new Error(error.message);
  }
  const qa = p.qa.slice(0, 12);
  if (qa.length) {
    const [us, en] = await Promise.all([Promise.all(qa.map(x => understand(x.question, 'ar').catch(() => null))), toEnglish(qa.map(x => x.answer))]);
    const embs = await embed(qa.map((x, i) => us[i]?.q_en || x.question));
    const rows = qa.map((x, i) => ({
      code: `DR-${id}-${i + 1}`, q_canon: us[i]?.q_en || x.question, q_ar: x.question, q_embedding: vec(embs[i]),
      answer: x.answer, answer_lang: 'ar', answer_en: en[i], translations: { ar: x.answer, en: en[i] },
      source_title: `${DORAR.title} › ${p.title}`.slice(0, 290), source_locator: DORAR.page(id), source_quote: x.answer,
      author_name: 'الدرر السنية · الموسوعة الفقهية', verification: { verdict: 'verbatim', reason: 'published text of the reference' },
    }));
    const { error } = await db.from('verified_answers').upsert(rows, { onConflict: 'code' });
    if (error) throw new Error(error.message);
  }
  await db.from('audit_log').insert({ actor: DORAR.sourceId, action: 'sync_page', target: String(id), detail: { title: p.title, chunks: chunks.length, qa: qa.length } });
  return { id, title: p.title, chunks: chunks.length, qa: qa.length };
}

/**
 * Keeps the library in step with the approved online reference. Takes no parameters from the caller:
 * it ingests the next pages not yet stored, and once everything is stored it re-reads a few pages a day
 * so corrections on the reference reach Munir. Called by the daily schedule and by the specialist workspace.
 */
async function run(req: Request) {
  if (!rateLimit(`sync:${clientIp(req)}`, 30)) return bad('too many requests', 429);
  const url = new URL(req.url); const t0 = Date.now();
  try {
    const ids = await hajjPages();
    if (!ids.length) return json({ ok: false, error: 'the reference index could not be read' }, 502);
    if (url.searchParams.get('dry') === '1') {
      const p = parsePage(ids[0], await fetchHtml(DORAR.page(ids[0])));
      return json({ ok: true, dry: true, pages: ids.length, first: ids.slice(0, 5), sample: { title: p.title, sections: p.sections.length, qa: p.qa.length, chunks: chunkPage(p).length, excerpt: p.sections[0]?.text.slice(0, 200) ?? '' } });
    }
    const db = sb();
    const { data: log } = await db.from('audit_log').select('target,action,created_at').eq('actor', DORAR.sourceId).order('created_at', { ascending: false }).limit(1000);
    const rows = (log ?? []) as { target: string; action: string; created_at: string }[];
    const done = new Set(rows.filter(r => r.action === 'sync_page').map(r => Number(r.target)));
    let todo = ids.filter(id => !done.has(id)); let mode: 'ingest' | 'refresh' | 'idle' = 'ingest';
    if (url.searchParams.get('status') === '1') return json({ ok: true, total: ids.length, done: ids.length - todo.length, remaining: todo.length });
    if (!todo.length) {
      const last = rows.find(r => r.action === 'sync_refresh');
      if (last && Date.now() - new Date(last.created_at).getTime() < REFRESH_EVERY_MS) return json({ ok: true, mode: 'idle', total: ids.length, done: ids.length, remaining: 0 });
      const start = (Math.floor(Date.now() / 86_400_000) * BATCH) % ids.length;
      todo = [0, 1, 2].map(k => ids[(start + k) % ids.length]); mode = 'refresh';
      await db.from('audit_log').insert({ actor: DORAR.sourceId, action: 'sync_refresh', target: todo.join(',') });
    } else {
      await db.from('sources').upsert({ id: DORAR.sourceId, title: DORAR.title, author: DORAR.author, publisher: DORAR.publisher, lang: 'ar', license: DORAR.license, url: `${DORAR.index}/{page}`, pages: ids.length, active: true }, { onConflict: 'id' });
    }
    const processed: unknown[] = []; const errors: unknown[] = [];
    for (const id of todo.slice(0, BATCH)) {
      if (Date.now() - t0 > BUDGET_MS) break;
      try { processed.push(await ingestPage(id)); } catch (e) { errors.push({ id, error: String((e as Error).message).slice(0, 200) }); }
    }
    const remaining = mode === 'ingest' ? todo.length - processed.length : 0;
    return json({ ok: errors.length === 0, mode, total: ids.length, done: ids.length - remaining, remaining, processed, errors, ms: Date.now() - t0 });
  } catch (e) { return json({ ok: false, error: String((e as Error).message).slice(0, 300) }, 502); }
}

export const GET = run;   // the daily schedule
export const POST = run;  // the specialist workspace
