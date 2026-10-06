// The inference pipeline. Fail-closed: any gate that does not pass ends in a referral, never in a weaker answer.
import { config, isLang } from '@/lib/config';
import { normalizeArabic } from '@/lib/arabic';
import { findTerm, honorifics, textLang } from '@/lib/glossary/mask';
import { insert, sourcesByIds, sb, type Chunk } from '@/lib/db';
import { t } from '@/lib/i18n';
import { embed } from '@/lib/models';
import { QUOTE_MIN, quoteCoverage, enforceCitations, findVerified, generate, retrieve, translateStrings, understand, verifyWithModel, type Gen, type Retrieved, type VerifyItem } from './steps';
import type { Answer, AskInput, CaseItem, SourceRef, StageCb, Statement, Understanding } from './types';
import { PROMPT_VERSION } from './prompts';

const DEADLINE_MS = 50_000; // the platform limit is 60 s
const WIDEN_SIM_MIN = 0.45;       // the composer abstained although retrieval was confident: worth one look at a wider context
const WIDEN_BEFORE_MS = 18_000;   // ...but only while there is time left for it
const WIDE_TOP_K = 14;
const EXPLAIN_SHORT_CHARS = 260;   // a published answer shorter than this is a bare ruling
const EXPLAIN_SIM_BELOW = 0.8;      // below this the new question is not just a rewording of the stored one
const EXPLAIN_BEFORE_MS = 14_000; // no stage of an explanation starts after this much of the request has passed
const EXPLAIN_HARD_MS = 22_000;   // and the published answer is never held back longer than this
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + '…' : s);

function baseAnswer(u: Understanding, outLang: string): Answer {
  return { tier: 'referred', lang: outLang, summary: '', claims: [], cases: [], action: '', clarify: null, disagreement: false, notice: '', sources: [], approx_translation: false, level: u.level, timings: {}, flags: {} };
}

/** Two wordings compared as a listener would: without punctuation, case, diacritics or hamza spelling. */
export const sameWording = (x: string, y: string): boolean => {
  const n = (s: string) => normalizeArabic(s.normalize('NFKC').toLowerCase()).replace(/[\p{P}\p{S}\s]+/gu, ' ').trim();
  return n(x) === n(y);
};

/** A question reduced to what a listener hears: no punctuation, case, diacritics or hamza spelling. */
const wordingKey = (s: string) => normalizeArabic(s.normalize('NFKC').toLowerCase()).replace(/[\p{P}\p{S}\s]+/gu, ' ').trim();

const RECALL_DAYS = 14;
/**
 * Consistency memory. An answer that already passed every gate is given again when the same question comes back,
 * whether in the visitor's own wording (`text`) or as the same normalised question (`qEn`), in the same language.
 * Without it the same question could be answered once and referred the next time, because two model runs never
 * agree perfectly. Only answers are recalled, never referrals: a referred question is always tried afresh.
 * Answers made under another prompt version, approximate translations and withdrawn published answers are skipped.
 */
async function recall(text: string | null, qEn: string | null, lang: string | null): Promise<{ row: any; answer: Answer } | null> {
  try {
    const since = new Date(Date.now() - RECALL_DAYS * 864e5).toISOString();
    const { data } = await sb().from('interactions').select('id,lang,q_text,q_en').eq('is_eval', false).in('tier', ['grounded', 'verified']).gte('created_at', since).order('created_at', { ascending: false }).limit(400);
    const key = wordingKey(text ?? qEn ?? ''); if (!key) return null;
    const ids = ((data ?? []) as any[]).filter(r => (!lang || r.lang === lang) && wordingKey((text ? r.q_text : r.q_en) ?? '') === key).slice(0, 4).map(r => r.id);
    for (const id of ids) {
      const { data: row } = await sb().from('interactions').select('id,lang,q_en,q_ar,level,stage,nusuk,tier,answer,chunk_ids,va_id,flags').eq('id', id).maybeSingle();
      const r = row as any; const a = r?.answer as Answer | undefined;
      if (!a || r.flags?.pv !== PROMPT_VERSION || a.approx_translation) continue;
      if (!(a.summary || a.claims?.length || a.cases?.length)) continue;
      if (r.va_id) { const { data: va } = await sb().from('verified_answers').select('status').eq('id', r.va_id).maybeSingle(); if ((va as any)?.status !== 'published') continue; }
      return { row: r, answer: a };
    }
  } catch { /* the memory is a convenience: on any error the question simply runs through the pipeline */ }
  return null;
}

/** The honorific ligatures (ﷺ) have no glyph on many screens: every string that leaves the pipeline has them written out. */
export function cleanAnswer(a: Answer): void {
  const h = (s: string) => honorifics(s, a.lang);
  a.summary = h(a.summary); a.action = h(a.action); if (a.clarify) a.clarify = h(a.clarify);
  a.claims = a.claims.map(c => ({ ...c, text: h(c.text) }));
  a.cases = a.cases.map(c => ({ ...c, condition: h(c.condition), ruling: h(c.ruling) }));
  // A source is quoted in its own language, whatever language the answer is in.
  a.sources = a.sources.map(x => ({ ...x, excerpt: honorifics(x.excerpt, textLang(x.excerpt, 'en')) }));
  if (a.verified?.source_quote) a.verified = { ...a.verified, source_quote: honorifics(a.verified.source_quote, textLang(a.verified.source_quote, a.lang)) };
}

// What the grounded path produces: either statements that passed every gate, or the reason it stopped.
type Composed =
  | { ok: true; summary: string; action: string; claims: Statement[]; cases: CaseItem[]; sources: SourceRef[]; disagreement: boolean; approx: boolean; report: { missing: string[]; forbidden: string[] }; chunkIds: string[]; flags: Record<string, unknown> }
  | { ok: false; reason: string; chunkIds: string[]; clarify?: string; flags: Record<string, unknown> };

async function persist(input: AskInput, u: Understanding, a: Answer, chunkIds: string[], vaId: string | null): Promise<void> {
  try {
    const row = await insert('interactions', {
      session_id: input.sessionId ?? null, notebook_id: input.notebookId ?? null, kiosk: input.kiosk ?? null,
      lang: a.lang, q_text: input.text, q_en: u.q_en, q_ar: u.q_ar, tier: a.tier, level: u.level, stage: u.stage, nusuk: u.nusuk,
      answer: a, chunk_ids: chunkIds, va_id: vaId, latency: a.timings, flags: a.flags, is_eval: !!input.isEval,
    });
    a.interaction_id = row?.id;
    if (a.tier === 'referred' && !input.isEval) {
      const tk = await insert('tickets', { interaction_id: row?.id ?? null, notebook_id: input.notebookId ?? null, session_id: input.sessionId ?? null, q_text: input.text, q_en: u.q_en, q_ar: u.q_ar, lang: a.lang });
      a.ticket = tk?.id ? { id: tk.id } : null;
      if (row?.id && a.ticket) await sb().from('interactions').update({ answer: a }).eq('id', row.id);
    }
  } catch (e) { a.flags.persist_error = String((e as Error).message ?? e); }
}

export async function ask(input: AskInput, onStage: StageCb = () => {}): Promise<Answer> {
  const T: Record<string, number> = {}; const t0 = Date.now();
  const timed = async <X>(name: string, f: () => Promise<X>): Promise<X> => { const s = Date.now(); try { return await f(); } finally { T[name] = Date.now() - s; } };

  const hint = input.langHint && (isLang(input.langHint) || ['tr', 'bn'].includes(input.langHint)) ? input.langHint : 'en';

  // The same question, answered before: the answer that passed every gate then is given again now.
  const remembered = !input.isEval && !input.trace && !input.clarified;
  const serve = async (hit: { row: any; answer: Answer }): Promise<Answer> => {
    const r = hit.row; const old = hit.answer;
    const uu: Understanding = { lang: r.lang ?? old.lang, q_en: r.q_en ?? '', q_ar: r.q_ar ?? '', in_scope: true, level: r.level ?? 'b', personal_case: false, nusuk: r.nusuk ?? 'both', stage: r.stage ?? 'general', injection_suspected: false };
    const a2: Answer = { ...old, interaction_id: undefined, ticket: undefined, timings: {}, flags: { pv: PROMPT_VERSION, recalled: r.id, verify: (old.flags as any)?.verify } };
    T.total = Date.now() - t0; a2.timings = T;
    await persist(input, uu, a2, r.chunk_ids ?? [], r.va_id ?? null);
    return a2;
  };
  if (remembered) { const hit = await timed('recall', () => recall(input.text.trim(), null, null)); if (hit) return serve(hit); }

  // A question the system cannot even classify is recorded and referred, never dropped.
  onStage('understand');
  let u: Understanding;
  try { u = await timed('understand', () => understand(input.text, input.langHint)); }
  catch (e) {
    u = { lang: hint, q_en: input.text, q_ar: '', in_scope: true, level: 'b', personal_case: false, nusuk: 'both', stage: 'general', injection_suspected: false };
    const f = baseAnswer(u, hint); f.flags = { refer_reason: 'understand_failed', error: String((e as Error)?.message ?? e).slice(0, 200) }; f.notice = t(hint, 'n_referred');
    T.total = Date.now() - t0; f.timings = T; await persist(input, u, f, [], null); return f;
  }
  if (input.trace) input.trace.understanding = u;
  const outLang = isLang(u.lang) || ['tr', 'bn'].includes(u.lang) ? u.lang : hint;
  const a = baseAnswer(u, outLang);
  a.flags.injection_suspected = u.injection_suspected; a.flags.beta_language = ['tr', 'bn'].includes(outLang);

  // Gate 0: is this a question at all, and was it heard right? Neither outcome is stored and neither opens a ticket:
  // a remark to the device is not a question, and a misheard question is put back to the asker before it is answered.
  // An evaluation run, or a wording the asker has confirmed, goes straight on.
  if (!input.confirmed && !input.isEval) {
    const kind = u.utterance ?? 'question';
    const early = (tier: 'noquestion' | 'confirm', notice: string, suggest: string | null = null): Answer => {
      a.tier = tier; a.notice = t(outLang, notice); a.suggest = suggest; a.flags.utterance = kind; if (input.voice) a.flags.voice = true;
      T.total = Date.now() - t0; a.timings = T; return a;
    };
    // If the classifier contradicts itself (not a question, yet in scope with a question extracted) the text is treated as a question.
    if (kind !== 'question' && !(u.in_scope && u.q_en.trim())) return early('noquestion', kind === 'greeting' ? 'n_greeting' : 'n_noquestion');
    const fix = (u.heard_fix ?? '').trim();
    if (fix && fix.length <= config.limits.maxQuestionChars && !sameWording(fix, input.text)) return early('confirm', 'n_confirm', fix);
  }

  // Asked in other words but understood as the very same question, in the same language: also recalled.
  if (remembered && u.in_scope && u.q_en.trim() && !u.personal_case) { const hit = await timed('recall', () => recall(null, u.q_en.trim(), outLang)); if (hit) return serve(hit); }

  let finished = false;
  const done = async (chunkIds: string[] = [], vaId: string | null = null) => {
    if (finished) return a;   // the deadline already answered for this request
    cleanAnswer(a);   // before the answer is declared finished: if tidying throws, the request ends in a recorded referral
    a.flags.pv = PROMPT_VERSION;
    finished = true; T.total = Date.now() - t0; a.timings = T; await persist(input, u, a, chunkIds, vaId); return a;
  };
  const stage = (s: string) => { if (!finished) onStage(s); };

  const main = async (): Promise<Answer> => {
  // Gate 1: scope.
  if (!u.in_scope || !u.q_en.trim()) { a.tier = 'out_of_scope'; a.notice = t(outLang, 'n_out'); return done(); }

  // A question that only asks what one sharia term means, or how it is rendered, is answered from the locked
  // terminology table itself: no generation, so nothing to verify. Terms the table says too little about go on.
  const term = u.term_query && !u.personal_case ? findTerm(u.term_query) : null;
  if (term) {
    const rendering = ((term as any)[outLang] as string | undefined) ?? term.en;
    const gloss = (term.gloss as Record<string, string> | undefined)?.[outLang];
    if (gloss || term.jamhara) {
      const both = outLang !== 'en' && rendering.toLowerCase() !== term.en.toLowerCase() ? `${rendering} (${term.en})` : rendering;
      a.tier = 'grounded'; a.summary = gloss ? `${both}: ${gloss}` : both; a.flags.term_answer = term.tid;
      const n = t(outLang, 'n_term'); a.notice = n === 'n_term' ? '' : n;   // shown once the interface defines the line
      a.sources = [{ n: 1, chunk_id: `glossary:${term.tid}`, title: 'معجم المصطلحات الشرعية (الجمهرة)', author: null, page: null, path: term.en, excerpt: gloss ? `${rendering}: ${gloss}` : rendering, url: term.jamhara ? `https://islamic-content.com/dictionary/word/${term.jamhara}` : null }];
      return done();
    }
  }

  // One call embeds the question in both pivot languages, as its legal issue, and (when it was asked in a third
  // language) as it was asked, so that a book in that language is searched in its own words too.
  const issue = (u.issue_en ?? '').trim();
  const third = !['en', 'ar'].includes(u.lang) && input.text.trim().length > 1;
  const [qEmb, qArEmb, issueEmb, origEmb] = await timed('embed', async () => {
    const texts = [u.q_en, u.q_ar.trim() || u.q_en, issue || u.q_en];
    if (third) texts.push(input.text.trim());
    const v = await embed(texts);
    return [v[0], u.q_ar.trim() ? v[1] : null, issue ? v[2] : null, third ? (v[3] ?? null) : null] as const;
  });

  /**
   * The grounded path: retrieval → constrained generation → citation checks in code → independent verification →
   * constrained translation. With `explain` (the text of a published answer already on screen) the composer adds
   * only what the passages say beyond that text. Nothing here touches the answer: the caller decides what to show.
   */
  const compose = async (explain: string | null, cutoff: number): Promise<Composed> => {
    const fl: Record<string, unknown> = {};
    const fail = (reason: string, chunkIds: string[] = [], clarify?: string): Composed => ({ ok: false, reason, chunkIds, clarify, flags: fl });
    const late = () => Date.now() > cutoff;
    const tm = (name: string) => (explain ? `explain_${name}` : name);
    const search = (topK?: number) => retrieve(u.q_en, qEmb, qArEmb, { text: issue, emb: issueEmb }, { origEmb, topK });

    // Gate 3: answerability. No generation without enough context.
    stage('retrieve');
    let r: Retrieved = await timed(tm('retrieve'), () => search());
    fl.best_similarity = Number(r.bestSim.toFixed(3));
    const traceRetrieved = () => { if (!explain && input.trace) input.trace.retrieved = r.chunks.map(c => ({ id: c.id, path: c.path, similarity: c.similarity ?? null, score: Number((c.score ?? 0).toFixed(4)), text: c.text.slice(0, 260) })); };
    traceRetrieved();
    if (!r.chunks.length || r.bestSim < config.thresholds.retrieveSimMin) return fail('no_sufficient_context');
    if (late()) return fail('time');

    // Gate 4: constrained generation + programmatic citation enforcement (one retry).
    stage('generate');
    const draft = async (ctx: Retrieved) => {
      const allowed = new Set(ctx.chunks.map(c => c.id));
      const texts = new Map(ctx.chunks.map(c => [c.id, c.text]));
      let problems: string[] = []; let unavailable = false;
      for (let attempt = 0; attempt < 2; attempt++) {
        let g: Gen;
        // A malformed draft is a failed attempt, not a crash.
        try { g = await generate(u.q_en, ctx.chunks, { personal: u.personal_case, clarified: !!input.clarified || !!explain, feedback: attempt ? problems.join('; ') : undefined, explain: explain ?? undefined }); }
        catch (e) {
          // The composer's provider failed (rate limit, timeout) or returned something unreadable: one more try after a short pause.
          problems = [`invalid output: ${String((e as Error).message).slice(0, 80)}`]; unavailable = true;
          if (!attempt) await new Promise(res => setTimeout(res, 1500));
          continue;
        }
        unavailable = false;
        const chk = enforceCitations(g, allowed, texts);
        if (chk.ok || !g.answerable) return { gen: g as Gen | null, problems: [] as string[], quotes: { matched: chk.quoted, unmatched: chk.unquoted }, unavailable: false };
        problems = chk.problems;
      }
      return { gen: null as Gen | null, problems, quotes: null, unavailable };
    };
    const mayClarify = !explain && !input.clarified && !u.personal_case;
    const abstained = (g: Gen | null) => !!g && !(g.clarify && mayClarify) && (!g.answerable || g.claims.length + g.cases.length === 0);
    let d = await timed(tm('generate'), () => draft(r));
    // The composer found nothing although retrieval was confident: the ruling may sit just below the cut. One wider look, once.
    if (!explain && abstained(d.gen) && r.bestSim >= WIDEN_SIM_MIN && Date.now() - t0 < WIDEN_BEFORE_MS) {
      const wide = await timed('retrieve_wide', () => search(WIDE_TOP_K)).catch(() => null);
      if (wide && wide.chunks.length > r.chunks.length) {
        fl.widened = true;
        const d2 = await timed('generate_wide', () => draft(wide));
        if (d2.gen) { r = wide; d = d2; }
      }
    }
    const chunkIds = r.chunks.map(c => c.id);
    traceRetrieved();
    if (!explain && input.trace) { input.trace.generated = d.gen; input.trace.citation_problems = d.problems; }
    // A draft that broke the citation rules twice and a composer that could not be reached are different failures, and are recorded as such.
    if (!d.gen) { fl.citation_problems = d.problems; return fail(d.unavailable ? 'model_unavailable' : 'citation_enforcement_failed', chunkIds); }
    const g = d.gen; fl.quotes = d.quotes;
    if (g.clarify && mayClarify) return fail('clarify', chunkIds, g.clarify);
    if (!g.answerable || g.claims.length + g.cases.length === 0) return fail('generator_abstained', chunkIds);
    if (late()) return fail('time', chunkIds);

    // Gate 5: independent verification by a different provider, in parallel with constrained translation.
    stage('verify');
    const byId = new Map<string, Chunk>(r.chunks.map(c => [c.id, c]));
    // Every statement is checked against ALL the retrieved passages: support often sits in a neighbouring passage the
    // draft did not cite. It can never come from outside what was retrieved from the approved sources.
    const context = r.chunks.map(c => c.text).filter(Boolean);
    const summary = explain ? '' : g.summary;   // under a published text there is no second summary
    const items: VerifyItem[] = [];
    g.claims.forEach(c => items.push({ id: items.length, statement: c.text, passages: context }));
    g.cases.forEach(c => items.push({ id: items.length, statement: `If ${c.condition}: ${c.ruling}`, passages: context }));
    const nRulings = items.length;
    let sIdx = -1; let aIdx = -1;
    if (summary.trim()) { sIdx = items.length; items.push({ id: sIdx, statement: summary, passages: context }); }
    // The practical instruction is checked too: it is the line a pilgrim is most likely to act on.
    if (g.action.trim()) { aIdx = items.length; items.push({ id: aIdx, statement: g.action, passages: context }); }

    const strings = [summary, g.action, ...g.claims.map(c => c.text), ...g.cases.flatMap(c => [c.condition, c.ruling])];
    const [vr, tr] = await Promise.all([
      timed(tm('verify'), () => verifyWithModel(items)),
      timed(tm('translate'), () => translateStrings(strings, outLang)),
    ]);
    const verdicts = vr.results;
    if (!explain && input.trace) input.trace.verification = verdicts.map(v => ({ ...v, statement: items[v.id]?.statement }));
    // What is shown is only what passed, statement by statement. A ruling that did not pass is removed and the
    // supported ones stand; the question is referred only when no ruling is left. The one-line summary and the
    // practical instruction are conveniences: one that fails is removed as well.
    const passed = new Set(verdicts.filter(v => v.verdict === 'supported').map(v => v.id));
    const failedAll = verdicts.filter(v => v.verdict !== 'supported');
    const keepClaim = g.claims.map((_, i) => passed.has(i));
    const keepCase = g.cases.map((_, i) => passed.has(g.claims.length + i));
    const kept = keepClaim.filter(Boolean).length + keepCase.filter(Boolean).length;
    const dropped: string[] = [];
    if (sIdx >= 0 && !passed.has(sIdx)) dropped.push('summary');
    if (aIdx >= 0 && !passed.has(aIdx)) dropped.push('action');
    fl.verify = { checked: verdicts.length, failed: failedAll.length, dropped, dropped_statements: nRulings - kept, kept_statements: kept, model: vr.model, independent: !vr.fallback && !vr.model.startsWith(config.roles.gen.provider + '/') };
    if (failedAll.length) fl.verify_failures = failedAll.map(f => ({ statement: clip(items[f.id]?.statement ?? '', 160), verdict: f.verdict, reason: f.reason }));
    if (!kept) return fail('verification_failed', chunkIds);
    // When rulings were removed, what is left must still answer the question. The one-line summary is the direct
    // answer: if it did not pass either, the surviving statements are side remarks and the question is referred.
    if (!explain && kept < nRulings && sIdx >= 0 && !passed.has(sIdx)) return fail('verification_failed', chunkIds);

    // Assemble in the asker's language. Sources are numbered over the statements that are shown, so the numbers
    // beside a statement always match the list below it.
    stage('translate');
    const shown = [...g.claims.filter((_, i) => keepClaim[i]), ...g.cases.filter((_, i) => keepCase[i])];
    const usedIds = [...new Set(shown.flatMap(c => c.chunk_ids))].filter(id => byId.has(id));
    const srcMeta = await sourcesByIds([...new Set(usedIds.map(id => byId.get(id)!.source_id))]);
    const numberOf = new Map<string, number>();
    const sources: SourceRef[] = usedIds.map((id, i) => {
      const c = byId.get(id)!; const s = srcMeta[c.source_id]; numberOf.set(id, i + 1);
      // An online reference stores the address pattern of its pages; a book stores page numbers.
      const web = !!s?.url && s.url.includes('{page}');
      // The source text shown to the reader is the very wording each statement was drawn from.
      const quotes = [...new Set(shown.filter(x => x.chunk_ids.includes(id) && quoteCoverage(x.quote, c.text) >= QUOTE_MIN).map(x => x.quote.trim()))];
      return { n: i + 1, chunk_id: id, title: s?.title ?? c.source_id, author: s?.author ?? null, page: web ? null : c.page, path: c.path, excerpt: quotes.length ? clip(quotes.join(' … '), 700) : clip(c.text, 520), url: web ? s!.url!.replace('{page}', String(c.page ?? '')) : (s?.url ?? null) };
    });
    const nums = (ids: string[]) => [...new Set(ids.map(id => numberOf.get(id)!).filter(Boolean))];
    const out = tr.out; const nc = g.claims.length;
    const claims: Statement[] = g.claims.map((c, i) => ({ text: out[2 + i], src: nums(c.chunk_ids) })).filter((_, i) => keepClaim[i]);
    const cases: CaseItem[] = g.cases.map((c, i) => ({ condition: out[2 + nc + 2 * i], ruling: out[3 + nc + 2 * i], src: nums(c.chunk_ids) })).filter((_, i) => keepCase[i]);
    // A summary that did not pass is replaced by the first verified statement.
    const sum = dropped.includes('summary') ? (claims[0]?.text ?? (cases[0] ? `${cases[0].condition}: ${cases[0].ruling}` : '')) : (out[0] ?? '');
    return { ok: true, summary: explain ? '' : sum, action: dropped.includes('action') ? '' : (out[1] ?? ''), claims, cases, sources, disagreement: g.disagreement_noted, approx: tr.approx, report: tr.report, chunkIds, flags: fl };
  };

  // Gate 2: verified-answer memory (skipped for personal cases, which always go to a specialist).
  if (!u.personal_case) {
    stage('match');
    const hit = await timed('match', () => findVerified(u.q_en, qEmb, input.trace));
    if (hit) {
      stage('translate');
      const va = hit.va;
      let text = va.translations?.[outLang] ?? (outLang === va.answer_lang ? va.answer : outLang === 'en' ? va.answer_en : '');
      if (!text) {
        const tr = await timed('translate', () => translateStrings([va.answer_en], outLang));
        text = tr.out[0]; a.approx_translation = tr.approx;
        if (!tr.approx) { try { await sb().from('verified_answers').update({ translations: { ...(va.translations ?? {}), [outLang]: text } }).eq('id', va.id); } catch { /* cache only */ } }
      }
      a.summary = text;
      a.verified = { code: va.code, author: va.author_name, source_title: va.source_title, source_locator: va.source_locator, source_quote: va.source_quote };
      a.flags.va_similarity = va.similarity; a.flags.va_reason = hit.reason;
      // The asker wants a verdict on their own act or circumstances: that is a specialist's to give. The published
      // answer on the general ruling is shown as help, and the question is referred with a ticket like any other.
      if (hit.own_case) {
        a.tier = 'referred'; a.flags.refer_reason = 'personal_case'; a.notice = t(outLang, 'n_personal_general');
        return done([], va.id);
      }
      a.tier = 'verified'; a.notice = t(outLang, va.code?.startsWith('PC-') ? 'n_published' : va.code?.startsWith('DR-') ? 'n_dorar' : 'n_verified');
      // The published text is right but leaves the asker short: a generated, labelled explanation from the sources
      // is added under it, if and only if it passes every gate in time. A failed explanation costs nothing:
      // the published answer is shown exactly as it would have been.
      // An explanation is prepared when the checker asks for one, when the stored question is not a near-identical
      // wording of the new one, or when the published text is a bare ruling of a line or two.
      const thin = (va.answer_en ?? '').length < EXPLAIN_SHORT_CHARS || (va.similarity ?? 1) < EXPLAIN_SIM_BELOW;
      if ((hit.needs_explanation || thin) && Date.now() - t0 < EXPLAIN_BEFORE_MS) {
        let x: Composed | null = null; let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          x = await Promise.race([
            compose(va.answer_en || text, t0 + EXPLAIN_BEFORE_MS),
            new Promise<null>(res => { timer = setTimeout(() => res(null), Math.max(0, EXPLAIN_HARD_MS - (Date.now() - t0))); }),
          ]);
        } catch { x = null; } finally { if (timer) clearTimeout(timer); }
        if (x?.ok && !x.approx && x.claims.length + x.cases.length > 0) {
          a.explained = true; a.claims = x.claims; a.cases = x.cases; a.action = x.action; a.sources = x.sources; a.disagreement = x.disagreement;
          a.flags.verify = x.flags.verify; a.flags.explain = { ...x.flags, shown: true };
          return done(x.chunkIds, va.id);
        }
        a.flags.explain = { ...(x?.flags ?? {}), shown: false, reason: !x ? 'time' : x.ok ? 'approx_translation' : x.reason };
      }
      return done([], va.id);
    }
  }

  const refer = async (reason: string, chunkIds: string[] = []) => {
    a.tier = 'referred'; a.flags.refer_reason = reason;
    a.notice = t(outLang, u.personal_case ? 'n_personal_bare' : 'n_referred');
    a.summary = ''; a.claims = []; a.cases = []; a.action = ''; a.sources = [];
    return done(chunkIds);
  };
  const c = await compose(null, Number.POSITIVE_INFINITY);
  Object.assign(a.flags, c.flags);
  if (!c.ok) {
    if (c.reason === 'clarify' && c.clarify) {
      stage('translate');
      const tr = await timed('translate', () => translateStrings([c.clarify as string], outLang));
      a.tier = 'clarify'; a.clarify = tr.out[0]; a.approx_translation = tr.approx;
      return done(c.chunkIds);
    }
    return refer(c.reason, c.chunkIds);
  }
  a.summary = c.summary; a.action = c.action; a.claims = c.claims; a.cases = c.cases;
  a.sources = c.sources; a.disagreement = c.disagreement; a.approx_translation = c.approx;
  if (c.approx) a.flags.glossary = c.report;
  if (u.personal_case) { a.tier = 'referred'; a.notice = t(outLang, 'n_personal'); a.flags.refer_reason = 'personal_case'; }
  else { a.tier = 'grounded'; a.notice = t(outLang, (a.flags.verify as any)?.independent ? 'n_grounded' : 'n_grounded_fb'); }
  return done(c.chunkIds);
  };

  // Fail closed: any error or a blown time budget ends in a recorded referral, not in a broken screen.
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([main(), new Promise<Answer>((_, rej) => { timer = setTimeout(() => rej(new Error('deadline')), DEADLINE_MS); })]);
  } catch (e) {
    if (finished) return a;
    finished = true;
    const f = baseAnswer(u, outLang);
    f.flags = { ...a.flags, refer_reason: (e as Error)?.message === 'deadline' ? 'deadline' : 'internal_error', error: String((e as Error)?.message ?? e).slice(0, 200) };
    f.notice = t(outLang, u.personal_case ? 'n_personal_bare' : 'n_referred');
    T.total = Date.now() - t0; f.timings = T; await persist(input, u, f, [], null);
    return f;
  } finally { if (timer) clearTimeout(timer); }
}
