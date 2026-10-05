// Constrained translation: mask sharia terms -> translate -> restore from the locked table -> verify.
import { GLOSSARY, type Term } from './data';

const TOKEN = (id: string) => `[[${id}]]`;
const TOKEN_RE = /\[\[\s*(T\d+)\s*\]\]/g;

// Longest variants first so "Tawaf al-Ifadah" wins over "Tawaf".
const COMPILED: { term: Term; re: RegExp }[] = GLOSSARY
  .map(term => ({ term, src: term.variants.slice().sort((a, b) => b.length - a.length).join('|') }))
  .sort((a, b) => b.src.length - a.src.length)
  .map(({ term, src }) => ({ term, re: new RegExp(`(?<![\\p{L}\\[])(?:${src})(?![\\p{L}\\]])`, 'giu') }));

const BY_ID = new Map(GLOSSARY.map(t => [t.tid, t]));

export interface Masked { text: string; ids: string[] }

/** Replace every recognised English-form term with a protected token. */
export function mask(text: string): Masked {
  const ids: string[] = [];
  let out = text;
  for (const { term, re } of COMPILED) {
    out = out.replace(re, (m, offset: number, whole: string) => {
      // Skip matches that fall inside an existing token.
      const before = whole.lastIndexOf('[[', offset); const closed = whole.indexOf(']]', before);
      if (before >= 0 && closed >= offset) return m;
      return TOKEN(term.tid);
    });
  }
  out.replace(TOKEN_RE, (_m, id: string) => { ids.push(id); return _m; });
  return { text: out, ids };
}

export const countTokens = (text: string): string[] => { const ids: string[] = []; text.replace(TOKEN_RE, (_m, id: string) => { ids.push(id); return _m; }); return ids; };

/** Restore tokens with the approved rendering. `seen` tracks first mentions so the gloss is added once per answer. */
export function unmask(text: string, lang: string, seen: Set<string>): string {
  return text.replace(TOKEN_RE, (m: string, id: string, offset: number, whole: string) => {
    const t = BY_ID.get(id); if (!t) return m;
    let base = (t as any)[lang] as string | undefined ?? t.en;
    const before = whole.slice(0, offset); const after = whole.slice(offset + m.length);
    if (lang === 'ar') {
      // Arabic joins particles to the word: "ال" must not be doubled, and "لـ" + "الـ" is written "للـ".
      if (/ال$/.test(before)) base = base.replace(/^ال/, '');
      else if (/(^|[\s(«"])[وف]?ل$/.test(before) && base.startsWith('ال')) base = base.slice(1);
    }
    // A short explanation follows the first mention, except for Arabic readers (the term is their own word)
    // and where the sentence already brackets the term.
    const gloss = lang === 'ar' ? undefined : (t.gloss as any)?.[lang] as string | undefined;
    const bracketed = /[(（]\s*$/.test(before) || /^\s*[)）(（]/.test(after);
    const first = !seen.has(id); seen.add(id);
    return gloss && first && !bracketed ? `${base} (${gloss})` : base;
  });
}

export interface IntegrityReport { ok: boolean; missing: string[]; forbidden: string[]; leftover: boolean }

/** Post-check: every masked term came back, and no forbidden rendering appears for a term that was present. */
export function checkIntegrity(maskedSource: string, translatedMasked: string, finalText: string, lang: string): IntegrityReport {
  const src = countTokens(maskedSource).sort(); const got = countTokens(translatedMasked).sort();
  const missing = src.filter((id, i) => got[i] !== id);
  const forbidden: string[] = [];
  for (const id of new Set(src)) {
    const t = BY_ID.get(id);
    for (const w of ((t?.forbid as any)?.[lang] ?? []) as string[]) {
      const re = new RegExp(`(?<![\\p{L}])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'iu');
      if (re.test(finalText)) forbidden.push(`${id}:${w}`);
    }
  }
  const leftover = /\[\[\s*T\d+\s*\]\]/.test(finalText);
  return { ok: src.length === got.length && missing.length === 0 && forbidden.length === 0 && !leftover, missing, forbidden, leftover };
}

export const termById = (id: string) => BY_ID.get(id);
