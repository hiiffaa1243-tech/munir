import { json, bad, isSpecialist } from '@/lib/http';
import { sb } from '@/lib/db';
export const runtime = 'nodejs';

const pct = (xs: number[], p: number) => { if (!xs.length) return null; const s = xs.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

/** Confusion map: aggregate, anonymous figures only. No question is tied to a person. */
export async function GET() {
  const db = sb(); const sp = await isSpecialist();
  // Question wording is shown publicly only when at least K different askers share it and it is not a personal case;
  // a one-off question may carry personal detail.
  const K = sp ? 1 : 2;
  const { data, error } = await db.from('interactions').select('created_at,lang,tier,stage,nusuk,kiosk,q_ar,q_en,latency,flags,session_id,level').eq('is_eval', false).order('created_at', { ascending: false }).limit(1000);
  if (error) return bad(error.message, 500);
  const rows = (data ?? []) as any[];
  const count = (f: (r: any) => string | null | undefined) => { const m: Record<string, number> = {}; for (const r of rows) { const k = f(r) ?? 'unknown'; m[k] = (m[k] ?? 0) + 1; } return m; };
  const referred = rows.filter(r => r.tier === 'referred');
  const gapByStage: Record<string, { total: number; referred: number }> = {};
  for (const r of rows) { const k = r.stage ?? 'general'; (gapByStage[k] ??= { total: 0, referred: 0 }).total++; if (r.tier === 'referred') gapByStage[k].referred++; }
  const topQ = new Map<string, { q_ar: string; q_en: string; n: number; langs: Set<string>; tier: string; askers: Set<string>; personal: boolean }>();
  for (const r of rows) {
    const k = (r.q_en ?? '').toLowerCase().trim(); if (!k) continue;
    const g = topQ.get(k) ?? { q_ar: r.q_ar, q_en: r.q_en, n: 0, langs: new Set<string>(), tier: r.tier, askers: new Set<string>(), personal: false };
    g.n++; g.langs.add(r.lang); g.askers.add(r.session_id ?? `row-${g.n}`); if (r.level === 'd') g.personal = true; topQ.set(k, g);
  }
  const lat = rows.map(r => r.latency?.total).filter((x: any) => typeof x === 'number');
  const hours: Record<string, number> = {}; for (const r of rows) { const h = new Date(r.created_at).toISOString().slice(11, 13); hours[h] = (hours[h] ?? 0) + 1; }
  const { count: openTickets } = await db.from('tickets').select('id', { count: 'exact', head: true }).eq('status', 'open');
  return json({
    total: rows.length, by_tier: count(r => r.tier), by_lang: count(r => r.lang), by_stage: count(r => r.stage), by_nusuk: count(r => r.nusuk), by_kiosk: count(r => r.kiosk ?? 'phone'), by_hour_utc: hours,
    knowledge_gaps: Object.entries(gapByStage).map(([stage, v]) => ({ stage, ...v, rate: v.total ? v.referred / v.total : 0 })).sort((a, b) => b.referred - a.referred),
    // The public list shows a question only when different visitors asked it, it is not a personal case, and it was
    // answered from the sources: text that the service declined or referred is never echoed on a public page.
    top_questions: [...topQ.values()].filter(g => sp || (g.askers.size >= K && !g.personal && (g.tier === 'grounded' || g.tier === 'verified'))).sort((a, b) => b.n - a.n).slice(0, 15).map(g => ({ q_ar: g.q_ar, q_en: g.q_en, n: g.n, langs: [...g.langs], tier: g.tier })),
    top_referred: (sp ? referred.slice(0, 15) : []).map(r => ({ q_ar: r.q_ar, q_en: r.q_en, lang: r.lang, reason: r.flags?.refer_reason ?? null })),
    latency_ms: { p50: pct(lat, 0.5), p90: pct(lat, 0.9) }, open_tickets: openTickets ?? 0, referred_total: referred.length, k_threshold: K,
  });
}
