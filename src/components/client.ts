'use client';
// Browser-side helpers shared by the service point, the notebook and the admin pages.
import type { Answer } from '@/lib/pipeline/types';
import { UI_LANGS, t, uiLang, type UiLang } from '@/lib/i18n';

export const RTL = new Set(['ar', 'ur']);
export const dirOf = (lang: string) => (RTL.has(lang) ? 'rtl' : 'ltr');

/** Calls /api/ask and reads its newline-delimited JSON stream: stage updates first, then the answer. */
export async function streamAsk(body: Record<string, unknown>, headers: Record<string, string>, onStage: (s: string) => void): Promise<Answer> {
  const r = await fetch('/api/ask', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  if (!r.ok || !r.body) throw new Error(`ask ${r.status}`);
  const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = ''; let result: Answer | null = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (value) buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line) continue;
      const o = JSON.parse(line);
      if (o.stage) onStage(o.stage);
      if (o.result) result = o.result as Answer;
      if (o.error) throw new Error(o.error);
    }
    if (done) break;
  }
  if (!result) throw new Error('no result');
  return result;
}

/** Speech to text. `partial` asks for the fast interim caption while the person is still speaking; `lang` is only a hint. */
export async function transcribeBlob(blob: Blob, opts: { partial?: boolean; lang?: string; signal?: AbortSignal } = {}): Promise<{ text: string; lang?: string }> {
  const fd = new FormData(); fd.append('audio', blob, 'question');
  if (opts.partial) fd.append('partial', '1');
  if (opts.lang) fd.append('lang', opts.lang);
  const r = await fetch('/api/transcribe', { method: 'POST', body: fd, signal: opts.signal });
  if (!r.ok) throw new Error(`stt ${r.status}`);
  return r.json();
}

const b64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const randomId = (bytes = 16) => { const b = new Uint8Array(bytes); crypto.getRandomValues(b); return b64u(b); };

const KEY = 'munir_nb_key';
/** The notebook key is generated on the phone and never leaves it except as a request header; the server keeps only its hash. */
export function notebookKey(create: boolean): string | null {
  try {
    let k = localStorage.getItem(KEY);
    if (!k && create) { k = randomId(32); localStorage.setItem(KEY, k); }
    return k;
  } catch { return null; }
}

/** Saved choice first. A phone falls back to its own language; a shared screen falls back to Arabic. */
export function savedLang(useDevice = true): UiLang {
  try { const s = localStorage.getItem('munir_lang'); if (s) return uiLang(s); } catch { /* private mode */ }
  if (!useDevice) return 'ar';
  const n = typeof navigator !== 'undefined' ? navigator.language.slice(0, 2).toLowerCase() : 'ar';
  return (UI_LANGS as string[]).includes(n) ? (n as UiLang) : 'ar';
}
export function saveLang(l: string) { try { localStorage.setItem('munir_lang', l); } catch { /* ignore */ } }
export function applyDocLang(l: string) { document.documentElement.lang = l; document.documentElement.dir = dirOf(l); }

export const speechText = (a: Answer) => [a.summary || a.notice, ...a.claims.map(c => c.text), ...a.cases.map(c => `${c.condition}: ${c.ruling}`), a.action].filter(Boolean).join('\n');


// ---- Speech output: what is read aloud, and how the text is cut into words for highlighting ----

/** One speakable piece of an answer. `id` matches the `data-seg` attribute of the element that shows it. */
export interface SayPart { id: string; text: string }
export function sayParts(a: Answer): SayPart[] {
  const p: SayPart[] = [];
  const add = (id: string, text: string | null | undefined) => { const s = (text ?? '').trim(); if (s) p.push({ id, text: s }); };
  if (a.tier === 'confirm') { add('note', a.notice); add('sug', a.suggest); return p; }
  // A referral or a refusal is said first: a listener must know it before any general information that follows.
  if (a.tier === 'referred' || a.tier === 'out_of_scope' || a.tier === 'noquestion') add('note', a.notice);
  if (a.tier === 'clarify') add('clar', a.clarify);
  add('main', a.summary);
  if (a.explained && (a.claims.length || a.cases.length)) add('xh', t(a.lang, 'explain_h'));
  a.claims.forEach((c, i) => add(`c${i}`, c.text));
  a.cases.forEach((c, i) => add(`k${i}`, `${c.condition}: ${c.ruling}`));
  add('act', a.action);
  if (!p.length) add('note', a.notice);
  return p;
}

const CJK = /[\u3400-\u9fff]/;
/** Cuts a text into words and the white space between them. Chinese has no spaces, so it is cut into pairs of characters. */
export function splitWords(text: string): string[] {
  const out: string[] = [];
  for (const tok of text.split(/(\s+)/)) {
    if (!tok) continue;
    if (/^\s+$/.test(tok) || !CJK.test(tok)) { out.push(tok); continue; }
    out.push(...(tok.match(/[\u3400-\u9fff]{1,2}[^\u3400-\u9fff\s]*|[^\u3400-\u9fff\s]+/g) ?? [tok]));
  }
  return out;
}
/** Rough speaking time of a word: its letters, plus the pause a reader makes at punctuation. */
export function wordWeight(w: string): number {
  const s = w.trim(); if (!s) return 0;
  const letters = s.replace(/[\u064B-\u0652\u0670\u0640]/g, '').replace(/[^\p{L}\p{N}]/gu, '');
  const base = Math.max(1, CJK.test(letters) ? letters.length * 2.2 : letters.length);
  return base + (/[.!?\u061F\u06D4\u0964\u3002\uFF01\uFF1F:]$/.test(s) ? 6 : /[,;\u060C\u061B\uFF0C\u3001\uFF1B]$/.test(s) ? 3 : 0);
}
export function wordCount(text: string): number {
  const s = text.trim(); if (!s) return 0;
  return CJK.test(s) ? Math.ceil(s.replace(/[^\p{L}\p{N}]/gu, '').length / 2) : s.split(/\s+/).length;
}

// ---- A spoken yes or no, in the visitor's language, Arabic or English ----

const norm = (s: string) => s.toLowerCase().replace(/[\u064B-\u0652\u0670\u0640]/g, '').replace(/[\u0623\u0625\u0622]/g, '\u0627').replace(/\u0649/g, '\u064A')
  .replace(/[\u2019\u2018]/g, "'").replace(/[^\p{L}\p{M}\p{N}\s']/gu, ' ').replace(/\s+/g, ' ').trim();
const wordList = (lang: string, key: string) => [...new Set([lang, 'ar', 'en'])].flatMap(l => t(l, key).split(',')).map(norm).filter(Boolean);
export function yesNo(text: string, lang: string): 'yes' | 'no' | null {
  const s = norm(text); if (!s) return null;
  const head = s.split(' ').slice(0, 2);
  const has = (list: string[]) => list.some(w => s === w || s.startsWith(w + ' ') || head.includes(w) || (CJK.test(w) && s.startsWith(w)));
  // "No" is looked for first: «لا، مو صحيح» and "不是" contain a yes word too.
  if (has(wordList(lang, 'no_words'))) return 'no';
  if (has(wordList(lang, 'yes_words'))) return 'yes';
  return null;
}
