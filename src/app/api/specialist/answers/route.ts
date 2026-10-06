import { z } from 'zod';
import { bad, isSpecialist, json } from '@/lib/http';
import { audit, sb, vec } from '@/lib/db';
import { embedOne, toEnglish, translateStrings, understand, verifyWithModel } from '@/lib/pipeline/steps';
import { hasArabic } from '@/lib/arabic';

export const runtime = 'nodejs';

/** Language of the specialist's own text (not of the question it answers). */
function detectAnswerLang(text: string, english: string): string {
  if (/[ٹڈڑںےہھگپچ]/.test(text)) return 'ur';
  if (hasArabic(text)) return 'ar';
  if (text.trim() === english.trim()) return 'en';
  if (/\b(yang|dan|tidak|adalah|dengan|untuk)\b/i.test(text)) return 'id';
  if (/\b(les|des|est|une|pour|dans)\b/i.test(text)) return 'fr';
  return 'en';
}
export const maxDuration = 60;

const Body = z.object({
  ticket_ids: z.array(z.string().uuid()).max(50).default([]),
  question: z.string().trim().min(5).max(800),
  answer: z.string().trim().min(10).max(4000),
  source_title: z.string().trim().min(2).max(300),
  source_locator: z.string().trim().max(300).default(''),
  source_quote: z.string().trim().min(10).max(4000),  // mandatory supporting text
  author_name: z.string().trim().min(2).max(120),
});

/**
 * One-step approval. The specialist writes the answer and attaches the supporting text.
 * A model from a different provider checks that the text supports the answer:
 * supported -> published at once; otherwise it is returned with the reason and nothing is stored.
 */
export async function POST(req: Request) {
  if (!(await isSpecialist())) return bad('unauthorized', 401);
  let b: z.infer<typeof Body>;
  try { b = Body.parse(await req.json()); } catch (e) { return bad('invalid request: the answer, the source and the supporting quote are all required'); }
  try {
    const [u, en] = await Promise.all([understand(b.question), toEnglish([b.answer, b.source_quote])]);
    const [answerEn, quoteEn] = en;
    const vr = await verifyWithModel([{ id: 0, statement: answerEn, passages: [quoteEn] }]);
    const check = vr.results[0];
    if (check.verdict !== 'supported') {
      await audit(b.author_name, 'answer_rejected', b.question.slice(0, 120), { verdict: check.verdict, reason: check.reason });
      return json({ published: false, verdict: check.verdict, reason: check.reason }, 200);
    }
    const emb = await embedOne(u.q_en || b.question);
    const answerLang = detectAnswerLang(b.answer, answerEn);
    const db = sb();
    const ins = await db.from('verified_answers').insert({
      q_canon: u.q_en || b.question, q_ar: u.q_ar, q_embedding: vec(emb), answer: b.answer, answer_lang: answerLang, answer_en: answerEn,
      translations: { [answerLang]: b.answer, en: answerEn }, source_title: b.source_title, source_locator: b.source_locator || null, source_quote: b.source_quote,
      author_name: b.author_name, verification: { verdict: check.verdict, reason: check.reason, at: new Date().toISOString(), model: vr.model, independent: !vr.fallback },
    }).select('id').single();
    if (ins.error) return bad(ins.error.message, 500);
    const vaId = (ins.data as any).id as string;
    let resolved = 0;
    if (b.ticket_ids.length) {
      const { data: tks } = await db.from('tickets').update({ status: 'resolved', va_id: vaId, resolved_at: new Date().toISOString() }).in('id', b.ticket_ids).eq('status', 'open').select('id,lang');
      resolved = (tks as any[] | null)?.length ?? 0;
      // Pre-translate into the askers' languages so their notebooks open instantly.
      const langs = [...new Set(((tks ?? []) as any[]).map(t => t.lang).filter((l: string) => l && l !== answerLang && l !== 'en'))].slice(0, 4);
      const translations: Record<string, string> = { [answerLang]: b.answer, en: answerEn };
      for (const l of langs) { try { const tr = await translateStrings([answerEn], l); if (!tr.approx) translations[l] = tr.out[0]; } catch { /* translated lazily later */ } }
      await db.from('verified_answers').update({ translations }).eq('id', vaId);
    }
    await audit(b.author_name, 'answer_published', vaId, { tickets: resolved });
    return json({ published: true, id: vaId, resolved_tickets: resolved, verdict: check.verdict, reason: check.reason });
  } catch (e) { console.error('answer failed', e); return bad('processing failed', 502); }
}

export async function GET() {
  if (!(await isSpecialist())) return bad('unauthorized', 401);
  const { data, error } = await sb().from('verified_answers').select('id,code,q_canon,q_ar,answer,answer_lang,source_title,source_locator,author_name,status,created_at').order('created_at', { ascending: false }).limit(200);
  if (error) return bad(error.message, 500);
  return json({ answers: data });
}

const Patch = z.object({ id: z.string().uuid(), status: z.enum(['published', 'withdrawn']) });
/** Withdrawing an answer takes it out of every language at once. */
export async function PATCH(req: Request) {
  if (!(await isSpecialist())) return bad('unauthorized', 401);
  let b: z.infer<typeof Patch>;
  try { b = Patch.parse(await req.json()); } catch { return bad('invalid request'); }
  const { error } = await sb().from('verified_answers').update({ status: b.status }).eq('id', b.id);
  if (error) return bad(error.message, 500);
  await audit('specialist', `answer_${b.status}`, b.id);
  return json({ ok: true });
}
