// Sync with an approved online reference: the Book of Hajj in the Fiqh Encyclopedia of al-Durar al-Saniyyah
// (dorar.net/feqhia), named in the challenge's scientific annex. Pages are fetched on the server, split along
// the encyclopedia's own headings, and stored with the address of the page they came from, so every answer
// links back to the original. The site's robots.txt allows crawling; requests are sequential and few.
import { parse, type HTMLElement } from 'node-html-parser';
import { normalizeArabic } from '@/lib/arabic';

export const DORAR = {
  sourceId: 'dorar_feqhia',
  index: 'https://dorar.net/feqhia',
  page: (id: number) => `https://dorar.net/feqhia/${id}`,
  title: 'الموسوعة الفقهية: كتاب الحج',
  author: 'الدرر السنية، بإشراف الشيخ علوي بن عبد القادر السقاف',
  publisher: 'مؤسسة الدرر السنية',
  license: 'جميع الحقوق محفوظة لمؤسسة الدرر السنية. مرجع معتمد في الحزمة العلمية للتحدي، تُعرض منه مقتطفات منسوبة مع رابط الصفحة الأصلية.',
  book: 'كتاب الحج',
};
const UA = 'MunirBot/1.0 (+https://github.com/hiiffaa1243-tech/munir; educational, non-commercial)';

export async function fetchHtml(url: string): Promise<string> {
  const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html', 'accept-language': 'ar' }, signal: AbortSignal.timeout(15_000), cache: 'no-store' });
  if (!r.ok) throw new Error(`fetch ${url}: ${r.status}`);
  return r.text();
}

const squash = (s: string) => s.replace(/ /g, ' ').replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{2,}/g, '\n').trim();

/** Page ids of every topic under the Book of Hajj, in reading order, taken from the encyclopedia's own tree. */
export function parseIndex(html: string): number[] {
  const root = parse(html);
  for (const ul of root.querySelectorAll('ul.mtree-level-1')) {
    const li = ul.parentNode as HTMLElement | null;
    // The book title is the text of the node that owns this list, before the list itself.
    const head = normalizeArabic((li?.childNodes ?? []).filter(n => n !== ul).map(n => n.text).join(' ')).replace(/\s+/g, ' ').trim();
    // Exact book title: "كتاب الحج" must not also match "كتاب الحجر".
    if (!new RegExp(`^${normalizeArabic(DORAR.book)}(\\s|$)`).test(head)) continue;
    const ids = ul.querySelectorAll('a').map(a => Number((a.getAttribute('href') ?? '').match(/\/feqhia\/(\d+)$/)?.[1])).filter(n => Number.isInteger(n) && n > 0);
    if (ids.length) return [...new Set(ids)];
  }
  return [];
}

export interface DorarPage { id: number; title: string; sections: { heading: string; text: string }[]; qa: { question: string; answer: string }[] }

/** One topic page: its title, its body split by sub-headings (footnotes removed), and its question-and-answer summary. */
export function parsePage(id: number, html: string): DorarPage {
  const root = parse(html);
  const c = root.querySelector('#cntnt');
  if (!c) return { id, title: '', sections: [], qa: [] };
  const title = squash(c.querySelector('h1')?.text ?? '');
  const qa = c.querySelectorAll('article.public-qa-row').map(r => ({ question: squash(r.querySelector('.public-qa-question')?.text ?? ''), answer: squash(r.querySelector('.public-qa-answer')?.text ?? '') }))
    .filter(x => x.question.length >= 8 && x.answer.length >= 15);

  const sections: { heading: string; text: string }[] = [];
  const main = c.querySelectorAll('div').find(d => (d.getAttribute('class') ?? '').trim() === 'w-100 mt-4');
  if (main) {
    main.querySelectorAll('span.tip').forEach(t => t.remove());      // footnotes: references and long quotations
    main.querySelectorAll('i').forEach(t => t.remove());              // icons
    main.querySelectorAll('a.btn').forEach(t => t.remove());
    let h1 = ''; let h2 = ''; let buf = '';
    const flush = () => { const text = squash(buf).replace(/\s+([،؛.:])/g, '$1'); if (text.length >= 40) sections.push({ heading: [h1, h2].filter(Boolean).join(' › '), text }); buf = ''; };
    const walk = (n: any) => {
      if (n.nodeType === 3) { buf += n.text; return; }
      const tag = (n.rawTagName ?? '').toLowerCase(); const cls = n.getAttribute?.('class') ?? '';
      if (tag === 'br') { buf += '\n'; return; }
      if (tag === 'span' && /\btitle-1\b/.test(cls)) { flush(); h1 = squash(n.text); h2 = ''; return; }
      if (tag === 'span' && /\btitle-2\b/.test(cls)) { flush(); h2 = squash(n.text); return; }
      for (const k of n.childNodes ?? []) walk(k);
    };
    for (const k of main.childNodes) walk(k);
    flush();
  }
  return { id, title, sections, qa };
}

export interface DorarChunk { id: string; source_id: string; path: string; page: number; lang: string; text: string }

/** Chunks follow the encyclopedia's headings; a long section is cut at sentence ends, a short one joins its neighbour. */
export function chunkPage(p: DorarPage, target = 1100, max = 1700): DorarChunk[] {
  const out: { path: string; text: string }[] = [];
  for (const s of p.sections) {
    const path = [p.title, s.heading].filter(Boolean).join(' › ').slice(0, 190);
    if (s.text.length <= max) { out.push({ path, text: s.text }); continue; }
    const sents = s.text.split(/(?<=[.؛\n])\s*/); let buf = '';
    for (const snt of sents) { if (buf && buf.length + snt.length > target) { out.push({ path, text: buf.trim() }); buf = ''; } buf += snt + ' '; }
    if (buf.trim()) out.push({ path, text: buf.trim() });
  }
  // Merge fragments too small to stand alone into the previous chunk of the same page.
  const merged: { path: string; text: string }[] = [];
  for (const c of out) { const last = merged[merged.length - 1]; if (last && c.text.length < 160 && last.text.length + c.text.length <= max) last.text += '\n' + c.text; else merged.push({ ...c }); }
  return merged.filter(c => c.text.length >= 40).map((c, i) => ({ id: `${DORAR.sourceId}_${p.id}_${i}`, source_id: DORAR.sourceId, path: c.path, page: p.id, lang: 'ar', text: c.text.slice(0, 5900) }));
}
