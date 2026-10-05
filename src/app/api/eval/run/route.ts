import { z } from 'zod';
import { bad, isSpecialist, json } from '@/lib/http';
import { ask } from '@/lib/pipeline';
import { chatJson, chatText } from '@/lib/models';
import { BASELINE, JUDGE } from '@/lib/pipeline/prompts';
import { sb } from '@/lib/db';
import cases from '@/lib/eval/cases.json';
import type { Case } from '@/lib/eval/metrics';

export const runtime = 'nodejs';
export const maxDuration = 60;
const Body = z.object({ case_id: z.string(), run: z.number().int().min(1).max(3), baseline: z.boolean().default(false) });

const JUDGE_X = JUDGE.replace('Return JSON: {', 'Also set "abstained": true if the answer declines to rule or only refers the asker to a scholar without giving a ruling.\nReturn JSON: {"abstained": boolean, ');

async function judge(question: string, answer: string, passages: string[]) {
  if (!answer.trim()) return null;
  const { data } = await chatJson('verify', [
    { role: 'system', content: JUDGE_X },
    { role: 'user', content: `QUESTION:\n${question}\n\nANSWER:\n${answer}\n\nREFERENCE PASSAGES:\n${passages.length ? passages.map((p, i) => `(${i + 1}) ${p}`).join('\n\n') : '(none retrieved)'}` },
  ], { maxTokens: 400 });
  return data;
}

/** Runs one evaluation case through Munir (and optionally the closed-book baseline) and stores the outcome. */
export async function POST(req: Request) {
  if (!(await isSpecialist())) return bad('unauthorized', 401);
  let b: z.infer<typeof Body>;
  try { b = Body.parse(await req.json()); } catch { return bad('invalid request'); }
  const c = (cases as Case[]).find(x => x.id === b.case_id);
  if (!c) return bad('unknown case', 404);
  const db = sb();
  try {
    const a = await ask({ text: c.question, sessionId: `eval-${c.id}-${b.run}`, isEval: true, kiosk: 'eval' });
    // Reference passages for the judges: what retrieval found for this question.
    let passages: string[] = [];
    if (a.interaction_id) {
      const { data: it } = await db.from('interactions').select('chunk_ids').eq('id', a.interaction_id).maybeSingle();
      const ids = ((it as any)?.chunk_ids ?? []) as string[];
      if (ids.length) { const { data: ch } = await db.from('chunks').select('id,text').in('id', ids); passages = ((ch ?? []) as any[]).map(x => x.text); }
    }
    const text = [a.summary, ...a.claims.map(x => x.text), ...a.cases.map(x => `${x.condition}: ${x.ruling}`), a.action].filter(Boolean).join('\n');
    const mj = a.tier === 'grounded' && b.run <= 2 ? await judge(c.question, text, passages).catch(() => null) : null;
    const payload = { summary: a.summary, text, tier: a.tier, sources: a.sources.length, approx_translation: a.approx_translation, flags: a.flags, timings: a.timings, lang: a.lang, verified: a.verified ?? null, clarify: a.clarify, judge: mj };
    await db.from('eval_results').upsert({ case_id: c.id, run: b.run, system: 'munir', tier: a.tier, payload }, { onConflict: 'case_id,run,system' });
    let base: any = null;
    if (b.baseline) {
      const r = await chatText('baseline', [{ role: 'system', content: BASELINE }, { role: 'user', content: c.question }]);
      const bj = await judge(c.question, r.text, passages).catch(() => null);
      base = { text: r.text, judge: bj, ms: r.usage.ms, model: `${r.usage.provider}/${r.usage.model}` };
      await db.from('eval_results').upsert({ case_id: c.id, run: 1, system: 'baseline', tier: bj?.abstained ? 'abstained' : 'answered', payload: base }, { onConflict: 'case_id,run,system' });
    }
    return json({ ok: true, case_id: c.id, tier: a.tier, expected: c.expected, baseline: base ? { abstained: base.judge?.abstained ?? null } : null });
  } catch (e) { console.error('eval failed', e); return bad('eval failed: ' + String((e as Error).message).slice(0, 200), 502); }
}
