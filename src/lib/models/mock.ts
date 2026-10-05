// Deterministic stand-ins used only when MUNIR_MOCK=1 (local smoke tests, no network).
import type { ChatMsg } from './index';

export function mockJson(role: string, msgs: ChatMsg[]): unknown {
  const sys = msgs.find(m => m.role === 'system')?.content ?? '';
  const user = msgs.filter(m => m.role === 'user').map(m => m.content).join('\n');
  if (sys.includes('TASK:UNDERSTAND')) {
    const out = /election|hotel|poem/i.test(user);
    return { lang: 'en', q_en: user.slice(-200), q_ar: 'سؤال تجريبي', in_scope: !out, level: /my mother|ICU/i.test(user) ? 'd' : 'b', personal_case: /my mother|ICU/i.test(user), nusuk: 'both', stage: 'tawaf', injection_suspected: false };
  }
  if (sys.includes('TASK:EQUIVALENCE')) return { same_question: true, answers_it: true, reason: 'mock' };
  if (sys.includes('TASK:GENERATE')) {
    const id = (user.match(/\[([a-z0-9_-]+)\]/i) ?? [])[1] ?? 'c_1';
    return { answerable: true, summary: 'Tawaf consists of seven rounds.', claims: [{ text: 'Tawaf consists of seven rounds around the Kaaba.', chunk_ids: [id], quote: 'Tawaf consists of seven rounds around the Kaaba' }], cases: [], action: 'Complete seven rounds.', disagreement_noted: false, clarify: null };
  }
  if (sys.includes('TASK:VERIFY')) {
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
