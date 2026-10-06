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
  // A tatweel written between a particle and the token ("للـ[[T29]]") is dropped so the joining rules below apply.
  if (lang === 'ar') text = text.replace(/ـ+\s*(?=\[\[\s*T\d+\s*\]\])/g, '');
  return text.replace(TOKEN_RE, (m: string, id: string, offset: number, whole: string) => {
    const t = BY_ID.get(id); if (!t) return m;
    let base = (t as any)[lang] as string | undefined ?? t.en;
    const before = whole.slice(0, offset); const after = whole.slice(offset + m.length);
    if (lang === 'ar') {
      // (a particle written with a tatweel and a space, "لـ ", is rejoined by tidy() afterwards)
      // Arabic joins particles to the word: "ال" must not be doubled, and "لـ" + "الـ" is written "للـ".
      if (/ال$/.test(before) || /(^|[\s(«"])[وف]?لل$/.test(before)) base = base.replace(/^ال/, '');
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

/** The glossary entry a bare term names ("Ihram", "the Farewell Tawaf"), or null when the text is anything more than one term. */
export function findTerm(name: string): Term | null {
  const m = mask(name); const ids = [...new Set(m.ids)];
  if (ids.length !== 1) return null;
  const rest = m.text.replace(TOKEN_RE, ' ').replace(/\b(?:the|al|a|an)\b/gi, ' ').replace(/[^\p{L}\p{N}]+/gu, '');
  return rest ? null : (BY_ID.get(ids[0]) ?? null);
}

export interface IntegrityReport { ok: boolean; missing: string[]; forbidden: string[]; leftover: boolean }

/** Post-check: every masked term came back, and no forbidden rendering appears for a term that was present. */
// A rendering as it would appear inside running text: lower-cased, without diacritics, Arabic article or bracketed note.
const bare = (t: string) => t.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f\u064B-\u065F\u0670\u0640]/g, '').replace(/\s*\(.*?\)/g, '').replace(/[آأإٱ]/g, 'ا').replace(/^ال/, '').trim();

/**
 * Post-check on a translated string. Every term that was protected in the source must be present in the result
 * in its approved rendering, whether the translator kept the token or wrote the approved word itself; no forbidden
 * rendering may appear for a term that was present; and no raw token may be left over.
 */
export function checkIntegrity(maskedSource: string, translatedMasked: string, finalText: string, lang: string): IntegrityReport {
  const src = [...new Set(countTokens(maskedSource))]; const kept = new Set(countTokens(translatedMasked));
  const hay = bare(finalText).replace(/[آأإٱ]/g, 'ا');
  const missing: string[] = []; const forbidden: string[] = [];
  for (const id of src) {
    const t = BY_ID.get(id); if (!t) continue;
    const want = bare(((t as any)[lang] as string | undefined) ?? t.en);
    if (!kept.has(id) && !hay.includes(want)) missing.push(id);
    for (const w of ((t.forbid as any)?.[lang] ?? []) as string[]) {
      const re = new RegExp(`(?<![\\p{L}])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'iu');
      if (re.test(finalText)) forbidden.push(`${id}:${w}`);
    }
  }
  const leftover = /\[\[\s*T\d+\s*\]\]/.test(finalText);
  return { ok: missing.length === 0 && forbidden.length === 0 && !leftover, missing, forbidden, leftover };
}

/** What each protected token will become in the target language. Given to the translator so articles, gender and particles come out right. */
export function legend(ids: string[], lang: string): string {
  return [...new Set(ids)].map(id => { const t = BY_ID.get(id); return t ? `[[${id}]] = ${((t as any)[lang] as string | undefined) ?? t.en}` : ''; }).filter(Boolean).join('\n');
}

// ---------- repeated renderings ----------
// A translator sometimes writes the word AND keeps its token ("للطواف [[T04]]"), which unmasks to «للطواف الطواف».
// Only a repetition of a locked rendering is collapsed, so ordinary prose is never touched.
const fold = (w: string) => w.toLowerCase().normalize('NFKD').replace(/[̀-ًͯ-ٰٟـ]/g, '').replace(/[آأإٱ]/g, 'ا');
const core = (w: string) => fold(w).replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
const noArticle = (w: string) => w.replace(/^ال(?=.{2})/, '');
const RENDERINGS = new Map<string, Set<string>[]>();   // lang -> [phrases of 1 word, 2 words, 3 words, 4 words]
function renderings(lang: string): Set<string>[] {
  let r = RENDERINGS.get(lang);
  if (!r) {
    r = [new Set<string>(), new Set<string>(), new Set<string>(), new Set<string>()];
    for (const t of GLOSSARY) {
      const ws = (((t as any)[lang] as string | undefined) ?? t.en).split(/\s+/).map(w => noArticle(core(w))).filter(Boolean);
      if (ws.length >= 1 && ws.length <= 4) r[ws.length - 1].add(ws.join(' '));
    }
    RENDERINGS.set(lang, r);
  }
  return r;
}
/** Every reading of an Arabic word once its particles (و ف ب ل ك) and article are set aside; other scripts have one reading. */
function readings(w: string): string[] {
  const out = new Set<string>([w, noArticle(w)]);
  for (const a of [w, w.replace(/^[وف](?=.{3})/, '')]) {
    out.add(noArticle(a));
    if (/^لل.{2}/.test(a)) out.add(a.slice(2));
    const b = a.replace(/^[بلك](?=.{3})/, ''); out.add(b); out.add(noArticle(b));
  }
  return [...out];
}

/** Collapse an immediate repetition of a glossary rendering («للطواف الطواف» → «للطواف»), keeping the first occurrence with its prefix. */
export function dedupeTerms(text: string, lang: string): string {
  const parts = text.split(/(\s+)/);           // words at even indexes, the spaces between them at odd ones
  const idx: number[] = []; parts.forEach((p, i) => { if (i % 2 === 0 && p) idx.push(i); });
  if (idx.length < 2) return text;
  const sets = renderings(lang); const arabic = lang === 'ar' || lang === 'ur';
  const cores = idx.map(i => core(parts[i]));
  const drop = new Set<number>();
  for (let w = 0; w < idx.length; w++) {
    for (let n = Math.min(4, Math.floor((idx.length - w) / 2)); n >= 1; n--) {
      const second = cores.slice(w + n, w + 2 * n).map(noArticle).join(' ');
      if (!second || !sets[n - 1].has(second)) continue;
      // Nothing but a space may stand between the two occurrences: a comma or a bracket means two separate mentions.
      if (/[^\p{L}\p{N}\p{M}]$/u.test(parts[idx[w + n - 1]]) || /^[^\p{L}\p{N}]/u.test(parts[idx[w + n]])) continue;
      const rest = cores.slice(w + 1, w + n).map(noArticle);
      const firsts = arabic ? readings(cores[w]) : [cores[w]];
      if (!firsts.some(f => [f, ...rest].join(' ') === second)) continue;
      // Punctuation that closed the repeated phrase now closes the kept one.
      const tail = parts[idx[w + 2 * n - 1]].match(/[^\p{L}\p{N}\p{M}]+$/u)?.[0] ?? '';
      if (tail) parts[idx[w + n - 1]] += tail;
      for (let k = w + n; k < w + 2 * n; k++) drop.add(idx[k]);
      w += 2 * n - 1; break;
    }
  }
  if (!drop.size) return text;
  return parts.map((p, i) => (drop.has(i) || (i % 2 === 1 && drop.has(i + 1)) ? '' : p)).join('');
}

// ---------- honorific ligatures ----------
// Many screens and voices have no glyph for ﷺ (U+FDFA) and show an empty box, so it is written out.
const SALLA: Record<string, string> = {
  ar: 'صلى الله عليه وسلم', ur: 'صلى الله عليه وسلم', en: '(peace be upon him)', fr: '(paix et salut sur lui)',
  id: "(shallallahu 'alaihi wa sallam)", hi: '(सल्लल्लाहु अलैहि व सल्लम)', zh: '（愿主福安之）',
};
const JALLA: Record<string, string> = { ar: 'جل جلاله', ur: 'جل جلاله', en: '(Glorified and Exalted is He)', fr: '(Exalté soit-Il)', id: '(Jalla Jalaluh)' };

/** The language a source excerpt is written in, as far as the honorific needs to know. */
export function textLang(text: string, fallback = 'en'): string {
  if (/[؀-ۿ]/.test(text)) return /[ٹڈڑںھہےۓ]/.test(text) ? 'ur' : 'ar';
  if (/[ऀ-ॿ]/.test(text)) return 'hi';
  if (/[一-鿿]/.test(text)) return 'zh';
  if ((text.match(/\b(?:le|la|les|des|est|que|une|dans|pour|qui)\b/gi) ?? []).length >= 3) return 'fr';
  if ((text.match(/\b(?:yang|dan|dari|untuk|tidak|dengan|adalah)\b/gi) ?? []).length >= 3) return 'id';
  return fallback;
}

/** Write the honorific ligatures ﷺ and ﷻ out in the reader's language, without doubling brackets the text already has. */
export function honorifics(text: string, lang: string): string {
  if (!text || !/[ﷺﷻ]/.test(text)) return text;
  const put = (s: string, ch: string, form: string | undefined) => {
    if (!s.includes(ch)) return s;
    if (!form) return s.replace(new RegExp(`\\s*[(（]?\\s*${ch}\\s*[)）]?`, 'g'), '');
    return s.replace(new RegExp(`[(（]\\s*${ch}\\s*[)）]`, 'g'), ` ${form} `).replace(new RegExp(ch, 'g'), ` ${form} `);
  };
  let out = put(text, 'ﷺ', SALLA[lang] ?? SALLA.en);
  out = put(out, 'ﷻ', JALLA[lang] ?? (lang === 'hi' || lang === 'zh' ? undefined : JALLA.en));
  return out.replace(/[ \t]{2,}/g, ' ').replace(/ +([،,.;:؛!?؟。，)）»])/g, '$1').replace(/([(（«]) +/g, '$1').trim();
}

/** Tidy what masking can leave behind: a term repeated in its own brackets or right after itself, and Arabic particles separated from their word. */
export function tidy(text: string, lang: string): string {
  let out = text.replace(/([^\s()（）][^()（）]{1,48}?)\s*[(（]\s*\1\s*[)）]/g, '$1');
  if (lang === 'ar') out = out.replace(/(^|\s)([وف]?)لـ\s*ال(?=[ء-ي])/g, '$1$2لل').replace(/([ء-ي])ـ\s+(?=[ء-ي])/g, '$1');
  out = dedupeTerms(out, lang);
  return out.replace(/ {2,}/g, ' ').trim();
}
