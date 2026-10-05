'use client';
// Browser-side helpers shared by the service point, the notebook and the admin pages.
import type { Answer } from '@/lib/pipeline/types';
import { uiLang, type UiLang } from '@/lib/i18n';

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

export async function transcribeBlob(blob: Blob): Promise<{ text: string; lang?: string }> {
  const fd = new FormData(); fd.append('audio', blob, 'question');
  const r = await fetch('/api/transcribe', { method: 'POST', body: fd });
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

export function savedLang(): UiLang {
  try { const s = localStorage.getItem('munir_lang'); if (s) return uiLang(s); } catch { /* private mode */ }
  const n = typeof navigator !== 'undefined' ? navigator.language.slice(0, 2).toLowerCase() : 'ar';
  return n in { ar: 1, en: 1, ur: 1, id: 1, fr: 1 } ? (n as UiLang) : 'ar';
}
export function saveLang(l: string) { try { localStorage.setItem('munir_lang', l); } catch { /* ignore */ } }
export function applyDocLang(l: string) { document.documentElement.lang = l; document.documentElement.dir = dirOf(l); }

export const speechText = (a: Answer) => [a.summary || a.notice, ...a.claims.map(c => c.text), ...a.cases.map(c => `${c.condition}: ${c.ruling}`), a.action].filter(Boolean).join('\n');
