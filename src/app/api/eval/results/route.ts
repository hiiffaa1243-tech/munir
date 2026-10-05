import { bad, json } from '@/lib/http';
import { sb } from '@/lib/db';
import cases from '@/lib/eval/cases.json';
import { summarize, behaviourOk, type Case, type Row } from '@/lib/eval/metrics';
import { config } from '@/lib/config';
export const runtime = 'nodejs';

/** Public evaluation results: Munir against a closed-book general model on the same questions. */
export async function GET() {
  const { data, error } = await sb().from('eval_results').select('case_id,run,system,tier,payload,created_at').limit(1000);
  if (error) return bad(error.message, 500);
  const rows = (data ?? []) as Row[];
  const cs = cases as Case[];
  const first = new Map<string, Row>(); const second = new Map<string, Row>(); const base = new Map<string, Row>();
  for (const r of rows) { if (r.system === 'munir' && r.run === 1) first.set(r.case_id, r); if (r.system === 'munir' && r.run === 2) second.set(r.case_id, r); if (r.system === 'baseline') base.set(r.case_id, r); }
  return json({
    models: { generate: `${config.roles.gen.provider}/${config.roles.gen.model}`, verify: `${config.roles.verify.provider}/${config.roles.verify.model}`, baseline: `${config.roles.baseline.provider}/${config.roles.baseline.model}` },
    // Run 1 on the held-out split was made once with the configuration frozen. Run 2 was made after the fixes that run exposed.
    holdout: summarize(cs, rows, 'holdout', 1), holdout_after: summarize(cs, rows, 'holdout', 2), dev: summarize(cs, rows, 'dev', 1), all: summarize(cs, rows, 'all', 1),
    cases: cs.map(c => { const m = first.get(c.id); const m2 = second.get(c.id); const b = base.get(c.id); return {
      id: c.id, split: c.split, category: c.category, lang: c.lang, question: c.question, meaning_ar: c.meaning_ar, expected: c.expected,
      tier: m?.tier ?? null, ok: m ? behaviourOk(c.expected, m.tier) : null, tier2: m2?.tier ?? null, ok2: m2 ? behaviourOk(c.expected, m2.tier) : null, reason2: m2?.payload?.flags?.refer_reason ?? null, text2: m2?.payload?.text ?? null, munir: m ? { text: m.payload?.text ?? '', reason: m.payload?.flags?.refer_reason ?? null, sources: m.payload?.sources ?? 0, judge: m.payload?.judge ?? null, ms: m.payload?.timings?.total ?? null } : null,
      baseline: b ? { text: b.payload?.text ?? '', judge: b.payload?.judge ?? null } : null,
    }; }),
  });
}
