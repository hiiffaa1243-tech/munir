// Evaluation metrics, computed from stored runs. Pure functions so they are unit-tested.
export type Expected = 'verified' | 'grounded' | 'clarify' | 'referred' | 'out_of_scope' | 'not_verified';
export interface Case { id: string; split: 'dev' | 'holdout'; category: string; category_label: string; level: string; expected: Expected; lang: string; question: string; meaning_ar: string; must_include: string; must_not: string }
export interface Row { case_id: string; run: number; system: 'munir' | 'baseline'; tier: string | null; payload: any }

export const isAbstain = (t: string | null | undefined) => t === 'referred' || t === 'out_of_scope';
export const isAnswer = (t: string | null | undefined) => t === 'verified' || t === 'grounded';
export const expectsAbstain = (e: Expected) => e === 'referred' || e === 'out_of_scope';

/** Did the system behave as expected? Answer / clarify / abstain, with the near-miss rule for look-alike questions. */
export function behaviourOk(expected: Expected, tier: string | null): boolean {
  if (!tier) return false;
  if (expected === 'not_verified') return tier !== 'verified';       // a look-alike question must not reuse the stored answer
  if (expectsAbstain(expected)) return isAbstain(tier);
  if (expected === 'clarify') return tier === 'clarify' || isAnswer(tier); // answering by cases is the preferred alternative to asking
  return isAnswer(tier);
}

const pct = (xs: number[], p: number) => { if (!xs.length) return null; const s = xs.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const ratio = (a: number, b: number) => (b ? a / b : null);

/**
 * Metrics for one split and one run of Munir. `run` selects which stored run is scored;
 * stability compares that run with the next one (same system version, run twice).
 */
export function summarize(cases: Case[], rows: Row[], split: 'dev' | 'holdout' | 'all' = 'holdout', run = 1) {
  const use = cases.filter(c => split === 'all' || c.split === split);
  const byCase = new Map<string, Row[]>(); for (const r of rows) (byCase.get(r.case_id) ?? byCase.set(r.case_id, []).get(r.case_id)!).push(r);
  let n = 0, ok = 0, tp = 0, predAbs = 0, expAbs = 0, stableN = 0, stable = 0, approx = 0, translated = 0;
  let mSup = 0, mUns = 0, bSup = 0, bUns = 0, bN = 0, bCites = 0, bAbstainOk = 0, bExpAbs = 0, mAnswered = 0, mWithSource = 0, bAnsweredWhenShouldAbstain = 0;
  const lat: number[] = []; const cat: Record<string, { n: number; ok: number }> = {}; const lang: Record<string, { n: number; ok: number }> = {};
  for (const c of use) {
    const rs = byCase.get(c.id) ?? []; const m = rs.filter(r => r.system === 'munir').sort((a, b) => a.run - b.run); const b = rs.find(r => r.system === 'baseline');
    const first = m.find(r => r.run === run);
    if (first) {
      n++; const good = behaviourOk(c.expected, first.tier); if (good) ok++;
      (cat[c.category] ??= { n: 0, ok: 0 }).n++; if (good) cat[c.category].ok++;
      (lang[c.lang] ??= { n: 0, ok: 0 }).n++; if (good) lang[c.lang].ok++;
      if (isAbstain(first.tier)) predAbs++; if (expectsAbstain(c.expected)) expAbs++; if (isAbstain(first.tier) && expectsAbstain(c.expected)) tp++;
      if (typeof first.payload?.timings?.total === 'number') lat.push(first.payload.timings.total);
      if (isAnswer(first.tier)) { mAnswered++; if ((first.payload?.sources ?? 0) > 0 || first.tier === 'verified') mWithSource++; if (c.lang !== 'en') { translated++; if (first.payload?.approx_translation) approx++; } }
      const j = first.payload?.judge; if (j) { mSup += j.supported_claims ?? 0; mUns += j.unsupported_claims ?? 0; }
      const again = m.find(r => r.run === run + 1);
      if (again) { stableN++; if (again.tier === first.tier) stable++; }
    }
    if (b) {
      bN++; const j = b.payload?.judge;
      if (j) { bSup += j.supported_claims ?? 0; bUns += j.unsupported_claims ?? 0; if (j.cites_source) bCites++; }
      if (expectsAbstain(c.expected)) { bExpAbs++; if (b.payload?.judge?.abstained) bAbstainOk++; else bAnsweredWhenShouldAbstain++; }
    }
  }
  return {
    split, run, cases: use.length, munir_runs: n, baseline_runs: bN,
    behaviour_accuracy: ratio(ok, n), abstention_precision: ratio(tp, predAbs), abstention_recall: ratio(tp, expAbs), stability: ratio(stable, stableN),
    munir: { answered: mAnswered, answers_with_source: ratio(mWithSource, mAnswered), unsupported_claim_rate: ratio(mUns, mSup + mUns), glossary_intact_rate: translated ? 1 - approx / translated : null },
    baseline: { unsupported_claim_rate: ratio(bUns, bSup + bUns), answers_citing_source: ratio(bCites, bN), abstained_when_required: ratio(bAbstainOk, bExpAbs), answered_when_should_abstain: bAnsweredWhenShouldAbstain },
    latency_ms: { p50: pct(lat, 0.5), p90: pct(lat, 0.9) },
    by_category: Object.entries(cat).map(([k, v]) => ({ category: k, n: v.n, accuracy: ratio(v.ok, v.n) })),
    by_lang: Object.entries(lang).map(([k, v]) => ({ lang: k, n: v.n, accuracy: ratio(v.ok, v.n) })),
  };
}
