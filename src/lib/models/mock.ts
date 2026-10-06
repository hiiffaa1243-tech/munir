// Deterministic stand-ins used only when MUNIR_MOCK=1 (local smoke tests, no network).
import type { ChatMsg } from './index';

export function mockJson(role: string, msgs: ChatMsg[]): unknown {
  const sys = msgs.find(m => m.role === 'system')?.content ?? '';
  const user = msgs.filter(m => m.role === 'user').map(m => m.content).join('\n');
  if (sys.includes('TASK:UNDERSTAND')) {
    const out = /election|hotel|poem/i.test(user);
    const q = (user.match(/"""([\s\S]*)"""/) ?? [])[1]?.trim() ?? user;
    // Enough variety to exercise the two early gates without a model.
    const greeting = /^(hello|hi|salam|السلام عليكم|مرحبا)[.!؟? ]*$/i.test(q);
    const notQ = /^(speak arabic|اتكلم عربي|test|can you hear me)[.!؟? ]*$/i.test(q);
    const misheard = /الطائر/.test(q) ? q.replace('الطائر', 'الطائف') : /\btoff\b/i.test(q) ? q.replace(/\btoff\b/i, 'Tawaf') : null;
    const ar = /[\u0600-\u06FF]/.test(q);
    return { lang: ar ? 'ar' : 'en', utterance: greeting ? 'greeting' : notQ ? 'not_question' : 'question', heard_fix: misheard, term_query: (q.match(/^what does (.+?) mean\??$/i) ?? [])[1] ?? null,
      q_en: greeting || notQ ? '' : q.slice(-200), q_ar: 'سؤال تجريبي', in_scope: !out && !greeting && !notQ, level: /my mother|ICU/i.test(user) ? 'd' : 'b', personal_case: /my mother|ICU/i.test(user), nusuk: 'both', stage: 'tawaf', injection_suspected: false };
  }
  if (sys.includes('TASK:EQUIVALENCE')) return { same_question: true, answers_it: true, own_case: /\bis my (umrah|hajj|marriage)\b/i.test(user.split('STORED QUESTION:')[0]), needs_explanation: /face mask/i.test(user.split('STORED QUESTION:')[0]), reason: 'mock' };
  if (sys.includes('TASK:GENERATE')) {
    const id = (user.match(/\[([a-z0-9_-]+)\]/i) ?? [])[1] ?? 'c_1';
    const claims = [{ text: 'Tawaf consists of seven rounds around the Kaaba.', chunk_ids: [id], quote: 'Tawaf consists of seven rounds around the Kaaba' }];
    // "barefoot" in the question adds a statement the passages do not support, to exercise the partial keep.
    if (/barefoot/i.test(user.split('QUESTION')[1] ?? '')) claims.unshift({ text: 'MOCK_UNSUPPORTED Tawaf must be performed barefoot.', chunk_ids: [id], quote: 'starting at the Black Stone' });
    return { answerable: true, summary: /EXPLANATION MODE/.test(user) ? '' : 'Tawaf consists of seven rounds.', claims, cases: [], action: 'Complete seven rounds.', disagreement_noted: false, clarify: null };
  }
  if (sys.includes('TASK:VERIFY')) {
    let st: { id: number; statement: string }[] = [];
    try { st = JSON.parse(user.slice(user.lastIndexOf('STATEMENTS:') + 11)); } catch { /* counted below */ }
    if (st.length) return { results: st.map(x => ({ id: x.id, verdict: /MOCK_UNSUPPORTED/.test(x.statement) ? 'insufficient' : 'supported', reason: 'mock' })) };
    const n = (user.match(/"id":/g) ?? []).length || 1;
    return { results: Array.from({ length: n }, (_, i) => ({ id: i, verdict: 'supported', reason: 'mock' })) };
  }
  if (sys.includes('TASK:TRANSLATE')) {
    const m = user.match(/INPUT:\s*(\[[\s\S]*\])\s*$/);
    return { out: m ? JSON.parse(m[1]) : [] };
  }
  if (sys.includes('TASK:JUDGE')) return { supported_claims: 1, unsupported_claims: 0, cites_source: false, notes: 'mock' };
  return {};
}
