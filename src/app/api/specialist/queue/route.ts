import { bad, isSpecialist, json } from '@/lib/http';
import { sb } from '@/lib/db';
export const runtime = 'nodejs';
/** Open referrals, grouped by their normalised Arabic question so one answer can serve many askers. */
export async function GET() {
  if (!(await isSpecialist())) return bad('unauthorized', 401);
  const { data, error } = await sb().from('tickets').select('id,q_text,q_en,q_ar,lang,created_at,status').eq('status', 'open').order('created_at', { ascending: false }).limit(300);
  if (error) return bad(error.message, 500);
  const groups = new Map<string, any>();
  for (const t of (data ?? []) as any[]) {
    const k = (t.q_en ?? t.q_text ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
    const g = groups.get(k) ?? { key: k, q_ar: t.q_ar, q_en: t.q_en, sample: t.q_text, ticket_ids: [], langs: {} as Record<string, number>, latest: t.created_at };
    g.ticket_ids.push(t.id); g.langs[t.lang ?? '?'] = (g.langs[t.lang ?? '?'] ?? 0) + 1; groups.set(k, g);
  }
  const list = [...groups.values()].sort((a, b) => b.ticket_ids.length - a.ticket_ids.length);
  return json({ groups: list, total: (data ?? []).length });
}
