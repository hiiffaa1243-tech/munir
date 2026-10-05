// The inference pipeline. Fail-closed: any gate that does not pass ends in a referral, never in a weaker answer.
import { config, isLang } from '@/lib/config';
import { insert, sourcesByIds, sb, type Chunk } from '@/lib/db';
import { t } from '@/lib/i18n';
import { embed } from '@/lib/models';
import { QUOTE_MIN, quoteCoverage, enforceCitations, findVerified, generate, retrieve, translateStrings, understand, verifyWithModel, type Gen, type VerifyItem } from './steps';
import type { Answer, AskInput, SourceRef, StageCb, Understanding } from './types';

const DEADLINE_MS = 50_000; // the platform limit is 60 s
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + '…' : s);

function baseAnswer(u: Understanding, outLang: string): Answer {
  return { tier: 'referred', lang: outLang, summary: '', claims: [], cases: [], action: '', clarify: null, disagreement: false, notice: '', sources: [], approx_translation: false, level: u.level, timings: {}, flags: {} };
}

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
  let finished = false;
  const done = async (chunkIds: string[] = [], vaId: string | null = null) => {
    if (finished) return a;   // the deadline already answered for this request
    finished = true; T.total = Date.now() - t0; a.timings = T; await persist(input, u, a, chunkIds, vaId); return a;
  };

  const main = async (): Promise<Answer> => {
  // Gate 1: scope.
  if (!u.in_scope || !u.q_en.trim()) { a.tier = 'out_of_scope'; a.notice = t(outLang, 'n_out'); return done(); }

  // One call embeds the question in both pivot languages.
  const issue = (u.issue_en ?? '').trim();
  const [qEmb, qArEmb, issueEmb] = await timed('embed', async () => {
    const texts = [u.q_en, u.q_ar.trim() || u.q_en, issue || u.q_en];
    const v = await embed(texts);
    return [v[0], u.q_ar.trim() ? v[1] : null, issue ? v[2] : null] as const;
  });

  // Gate 2: verified-answer memory (skipped for personal cases, which always go to a specialist).
  if (!u.personal_case) {
    onStage('match');
    const hit = await timed('match', () => findVerified(u.q_en, qEmb, input.trace));
    if (hit) {
      onStage('translate');
      const va = hit.va;
      let text = va.translations?.[outLang] ?? (outLang === va.answer_lang ? va.answer : outLang === 'en' ? va.answer_en : '');
      if (!text) {
        const tr = await timed('translate', () => translateStrings([va.answer_en], outLang));
        text = tr.out[0]; a.approx_translation = tr.approx;
        if (!tr.approx) { try { await sb().from('verified_answers').update({ translations: { ...(va.translations ?? {}), [outLang]: text } }).eq('id', va.id); } catch { /* cache only */ } }
      }
      a.tier = 'verified'; a.summary = text; a.notice = t(outLang, va.code?.startsWith('PC-') ? 'n_published' : va.code?.startsWith('DR-') ? 'n_dorar' : 'n_verified');
      a.verified = { code: va.code, author: va.author_name, source_title: va.source_title, source_locator: va.source_locator, source_quote: va.source_quote };
      a.flags.va_similarity = va.similarity; a.flags.va_reason = hit.reason;
      return done([], va.id);
    }
  }

  // Gate 3: answerability. No generation without enough context.
  onStage('retrieve');
  const r = await timed('retrieve', () => retrieve(u.q_en, qEmb, qArEmb, { text: issue, emb: issueEmb }));
  a.flags.best_similarity = Number(r.bestSim.toFixed(3));
  if (input.trace) input.trace.retrieved = r.chunks.map(c => ({ id: c.id, path: c.path, similarity: c.similarity ?? null, score: Number((c.score ?? 0).toFixed(4)), text: c.text.slice(0, 260) }));
  const refer = async (reason: string, chunkIds: string[] = []) => {
    a.tier = 'referred'; a.flags.refer_reason = reason;
    a.notice = t(outLang, u.personal_case ? 'n_personal_bare' : 'n_referred');
    a.summary = ''; a.claims = []; a.cases = []; a.action = ''; a.sources = [];
    return done(chunkIds);
  };
  if (!r.chunks.length || r.bestSim < config.thresholds.retrieveSimMin) return refer('no_sufficient_context');

  // Gate 4: constrained generation + programmatic citation enforcement (one retry).
  onStage('generate');
  const allowed = new Set(r.chunks.map(c => c.id));
  const texts = new Map(r.chunks.map(c => [c.id, c.text]));
  let gen: Gen | null = null; let problems: string[] = [];
  await timed('generate', async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      let g: Gen;
      // A malformed draft is a failed attempt, not a crash.
      try { g = await generate(u.q_en, r.chunks, { personal: u.personal_case, clarified: !!input.clarified, feedback: attempt ? problems.join('; ') : undefined }); }
      catch (e) { problems = [`invalid output: ${String((e as Error).message).slice(0, 80)}`]; continue; }
      const chk = enforceCitations(g, allowed, texts);
      if (chk.ok || !g.answerable) { gen = g; problems = []; a.flags.quotes = { matched: chk.quoted, unmatched: chk.unquoted }; return; }
      problems = chk.problems;
    }
  });
  const chunkIds = r.chunks.map(c => c.id);
  if (input.trace) { input.trace.generated = gen; input.trace.citation_problems = problems; }
  if (!gen) { a.flags.citation_problems = problems; return refer('citation_enforcement_failed', chunkIds); }
  const g = gen as Gen;
  if (g.clarify && !input.clarified && !u.personal_case) {
    onStage('translate');
    const tr = await timed('translate', () => translateStrings([g.clarify as string], outLang));
    a.tier = 'clarify'; a.clarify = tr.out[0]; a.approx_translation = tr.approx;
    return done(chunkIds);
  }
  if (!g.answerable || g.claims.length + g.cases.length === 0) return refer('generator_abstained', chunkIds);

  // Gate 5: independent verification by a different provider, in parallel with constrained translation.
  onStage('verify');
  const byId = new Map<string, Chunk>(r.chunks.map(c => [c.id, c]));
  const items: VerifyItem[] = [];
  const passagesOf = (ids: string[]) => ids.map(id => byId.get(id)?.text ?? '').filter(Boolean);
  // Every statement is checked against all the passages the draft cites: support may sit in a neighbouring passage,
  // but never outside what was retrieved and cited.
  const usedIds = [...new Set([...g.claims.flatMap(c => c.chunk_ids), ...g.cases.flatMap(c => c.chunk_ids)])];
  const cited = passagesOf(usedIds);
  g.claims.forEach(c => items.push({ id: items.length, statement: c.text, passages: cited }));
  g.cases.forEach(c => items.push({ id: items.length, statement: `If ${c.condition}: ${c.ruling}`, passages: cited }));
  if (g.summary.trim()) items.push({ id: items.length, statement: g.summary, passages: cited });
  // The practical instruction is checked too: it is the line a pilgrim is most likely to act on.
  if (g.action.trim()) items.push({ id: items.length, statement: g.action, passages: cited });

  const strings = [g.summary, g.action, ...g.claims.map(c => c.text), ...g.cases.flatMap(c => [c.condition, c.ruling])];
  const [vr, tr] = await Promise.all([
    timed('verify', () => verifyWithModel(items)),
    timed('translate', () => translateStrings(strings, outLang)),
  ]);
  const verdicts = vr.results;
  if (input.trace) input.trace.verification = verdicts.map(v => ({ ...v, statement: items[v.id]?.statement }));
  // What is shown is only what passed. A ruling (claim or case) that fails ends the answer in a referral.
  // The one-line summary and the practical instruction are conveniences: if one of them fails it is removed,
  // and the verified statements stand on their own.
  const nRulings = g.claims.length + g.cases.length;
  const failedAll = verdicts.filter(v => v.verdict !== 'supported');
  const failed = failedAll.filter(v => v.id < nRulings);
  const dropped: string[] = [];
  let sIdx = -1; let aIdx = -1; { let k = nRulings; if (g.summary.trim()) sIdx = k++; if (g.action.trim()) aIdx = k++; }
  if (!failed.length) {
    if (sIdx >= 0 && failedAll.some(v => v.id === sIdx)) { dropped.push('summary'); }
    if (aIdx >= 0 && failedAll.some(v => v.id === aIdx)) { dropped.push('action'); }
  }
  a.flags.verify = { checked: verdicts.length, failed: failedAll.length, dropped, model: vr.model, independent: !vr.fallback && !vr.model.startsWith(config.roles.gen.provider + '/') };
  if (failedAll.length) a.flags.verify_failures = failedAll.map(f => ({ statement: clip(items[f.id]?.statement ?? '', 160), verdict: f.verdict, reason: f.reason }));
  if (failed.length) return refer('verification_failed', chunkIds);

  // Assemble the answer in the asker's language.
  onStage('translate');
  const srcMeta = await sourcesByIds([...new Set(usedIds.map(id => byId.get(id)!.source_id))]);
  const numberOf = new Map<string, number>();
  const sources: SourceRef[] = usedIds.map((id, i) => {
    const c = byId.get(id)!; const s = srcMeta[c.source_id]; numberOf.set(id, i + 1);
    // An online reference stores the address pattern of its pages; a book stores page numbers.
    const web = !!s?.url && s.url.includes('{page}');
    // The source text shown to the reader is the very wording each statement was drawn from.
    const quotes = [...new Set([...g.claims, ...g.cases].filter(x => x.chunk_ids.includes(id) && quoteCoverage(x.quote, c.text) >= QUOTE_MIN).map(x => x.quote.trim()))];
    return { n: i + 1, chunk_id: id, title: s?.title ?? c.source_id, author: s?.author ?? null, page: web ? null : c.page, path: c.path, excerpt: quotes.length ? clip(quotes.join(' … '), 700) : clip(c.text, 520), url: web ? s!.url!.replace('{page}', String(c.page ?? '')) : (s?.url ?? null) };
  });
  const nums = (ids: string[]) => [...new Set(ids.map(id => numberOf.get(id)!).filter(Boolean))];
  let k = 0; const out = tr.out;
  a.summary = out[k++]; a.action = out[k++];
  if (dropped.includes('action')) a.action = '';
  a.claims = g.claims.map(c => ({ text: out[k++], src: nums(c.chunk_ids) }));
  a.cases = g.cases.map(c => ({ condition: out[k++], ruling: out[k++], src: nums(c.chunk_ids) }));
  // A summary that did not pass is replaced by the first verified statement.
  if (dropped.includes('summary')) a.summary = a.claims[0]?.text ?? (a.cases[0] ? `${a.cases[0].condition}: ${a.cases[0].ruling}` : '');
  a.sources = sources; a.disagreement = g.disagreement_noted; a.approx_translation = tr.approx;
  if (tr.approx) a.flags.glossary = tr.report;
  if (u.personal_case) { a.tier = 'referred'; a.notice = t(outLang, 'n_personal'); a.flags.refer_reason = 'personal_case'; }
  else { a.tier = 'grounded'; a.notice = t(outLang, (a.flags.verify as any)?.independent ? 'n_grounded' : 'n_grounded_fb'); }
  return done(chunkIds);
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
