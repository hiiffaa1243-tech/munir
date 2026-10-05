import { describe, expect, it } from 'vitest';
import { mask, unmask, checkIntegrity } from '@/lib/glossary/mask';
import { GLOSSARY } from '@/lib/glossary/data';
import { normalizeArabic } from '@/lib/arabic';
import { enforceCitations, rrf, GenSchema } from '@/lib/pipeline/steps';
import { makeClaimToken, readClaimToken, makeShortCode, CODE_ALPHABET, normalizeCode, hashKey, newNotebookKey, validKey, makeSpecialistCookie, checkSpecialistCookie } from '@/lib/notebook/tokens';

describe('glossary masking', () => {
  it('masks sharia terms and restores the approved rendering', () => {
    const m = mask('Whoever leaves an obligatory act of Hajj must offer a Dam.');
    expect(m.text).toContain('[[T16]]'); expect(m.text).toContain('[[T30]]');
    const fr = unmask(m.text, 'fr', new Set());
    expect(fr).toContain('dam (le sacrifice expiatoire'); expect(fr).not.toMatch(/\bsang\b/);
  });
  it('prefers the longest term', () => {
    const m = mask('Tawaf al-Ifadah is a pillar, unlike the Farewell Tawaf.');
    expect(m.ids.filter(i => i === 'T01')).toHaveLength(1); expect(m.ids).toContain('T02'); expect(m.ids).not.toContain('T04');
  });
  it('does not treat ordinary English words as terms', () => {
    const m = mask('They say it is haram to hunt, and Mina is crowded.');
    expect(m.text).toContain('say'); expect(m.text).toContain('haram'); expect(m.ids).toEqual(['T22']);
  });
  it('handles transliteration variants', () => {
    for (const s of ["Sa'i", 'Sa‘y', "sa'ee", '‘Umrah', 'Umrah', 'Ihraam'.replace('aa', 'a'), 'Iḥrām', 'Ka‘bah', 'Kaaba'])
      expect(mask(`about ${s} today`).ids.length).toBe(1);
  });
  it('adds the gloss only on first mention', () => {
    const seen = new Set<string>();
    const a = unmask('[[T16]]', 'id', seen); const b = unmask('[[T16]]', 'id', seen);
    expect(a).toContain('('); expect(b).toBe('dam');
  });
  it('detects a lost token and a forbidden rendering', () => {
    const src = mask('He must offer a Dam.').text;
    expect(checkIntegrity(src, 'Il doit offrir du sang.', 'Il doit offrir du sang.', 'fr').ok).toBe(false);
    const good = 'Il doit offrir un [[T16]].';
    expect(checkIntegrity(src, good, unmask(good, 'fr', new Set()), 'fr').ok).toBe(true);
    const bad = 'Il doit offrir un [[T16]] (du sang).';
    expect(checkIntegrity(src, bad, unmask(bad, 'fr', new Set()), 'fr').forbidden).toEqual(['T16:sang']);
  });
  it('has unique ids and all five launch renderings', () => {
    expect(new Set(GLOSSARY.map(t => t.tid)).size).toBe(GLOSSARY.length);
    for (const t of GLOSSARY) for (const l of ['ar', 'ur', 'id', 'fr'] as const) expect(t[l], `${t.tid}.${l}`).toBeTruthy();
  });
});

describe('citation enforcement', () => {
  const allowed = new Set(['c1', 'c2']);
  const gen = (o: object) => GenSchema.parse({ answerable: true, summary: 's', ...o });
  it('accepts claims that cite retrieved passages', () => expect(enforceCitations(gen({ claims: [{ text: 'x', chunk_ids: ['c1'] }] }), allowed).ok).toBe(true));
  it('rejects a claim without a citation', () => expect(enforceCitations(gen({ claims: [{ text: 'x', chunk_ids: [] }] }), allowed).ok).toBe(false));
  it('rejects a citation of a passage that was not retrieved', () => expect(enforceCitations(gen({ cases: [{ condition: 'a', ruling: 'b', chunk_ids: ['c9'] }] }), allowed).problems[0]).toContain('unknown passage'));
  it('rejects an answer with no statements', () => expect(enforceCitations(gen({}), allowed).ok).toBe(false));
});

describe('retrieval fusion', () => {
  it('ranks an item found by both retrievers first', () => {
    const s = rrf([[{ id: 'a' }, { id: 'b' }], [{ id: 'b' }, { id: 'c' }]]);
    expect([...s.entries()].sort((x, y) => y[1] - x[1])[0][0]).toBe('b');
  });
});

describe('arabic normalisation', () => {
  it('unifies alef, ya, ta marbuta and strips tashkeel', () => expect(normalizeArabic('الإِحْرَامُ والعُمْرَة على')).toBe('الاحرام والعمره علي'));
});

describe('notebook tokens', () => {
  it('round-trips a claim token and rejects tampering and expiry', () => {
    const { token, payload } = makeClaimToken('sess-1', 1000, 1_000_000);
    expect(readClaimToken(token, 1_000_500)?.sid).toBe('sess-1');
    expect(readClaimToken(token, 1_002_000)).toBeNull();
    expect(readClaimToken(token.slice(0, -2) + 'xx', 1_000_500)).toBeNull();
    expect(payload.n.length).toBeGreaterThan(8);
  });
  it('makes unambiguous short codes', () => {
    for (let i = 0; i < 200; i++) { const c = makeShortCode(); expect(c).toHaveLength(6); for (const ch of c) expect(CODE_ALPHABET).toContain(ch); }
    expect(normalizeCode(' ab-2 3c ')).toBe('AB23C');
  });
  it('stores only a hash of the notebook key', () => { const k = newNotebookKey(); expect(validKey(k)).toBe(true); expect(hashKey(k)).toMatch(/^[0-9a-f]{64}$/); expect(hashKey(k)).not.toContain(k); });
  it('validates the specialist cookie', () => { const c = makeSpecialistCookie(1000, 5000); expect(checkSpecialistCookie(c, 5500)).toBe(true); expect(checkSpecialistCookie(c, 7000)).toBe(false); expect(checkSpecialistCookie('1.x', 0)).toBe(false); });
});

import { unmask as unmaskAr } from '@/lib/glossary/mask';
describe('arabic joins and glosses', () => {
  it('does not double the article or gloss for Arabic readers', () => {
    const seen = new Set<string>();
    expect(unmaskAr('في [[T05]] ول[[T05]] وال[[T05]] ب[[T05]]', 'ar', seen)).toBe('في الإحرام وللإحرام والإحرام بالإحرام');
    expect(unmaskAr('دخل الإحرام للـ[[T29]] ثم لـ[[T29]] وبالـ[[T29]]', 'ar', new Set())).toBe('دخل الإحرام للعمرة ثم للعمرة وبالعمرة');
  });
  it('adds one gloss in other languages, never inside brackets', () => {
    const seen = new Set<string>();
    const out = unmaskAr('expiation ([[T15]]) then [[T15]]', 'fr', seen);
    expect(out).toBe('expiation (fidya) then fidya');
    expect(unmaskAr('[[T05]] puis [[T05]]', 'fr', new Set())).toMatch(/^ihram \(.+\) puis ihram$/);
  });
});

import { tidy, legend } from '@/lib/glossary/mask';
describe('tidy and legend', () => {
  it('removes a term repeated in its own brackets', () => { expect(tidy('tawaf wada (tawaf wada) tidak wajib', 'id')).toBe('tawaf wada tidak wajib'); });
  it('rejoins an Arabic particle written with a tatweel', () => { expect(tidy('من كسب حلال لـ الحج والعمرة', 'ar')).toBe('من كسب حلال للحج والعمرة'); });
  it('tells the translator what a token stands for', () => { expect(legend(['T37', 'T37'], 'fr')).toBe('[[T37]] = Pierre noire'); });
});

import { quoteCoverage, enforceCitations as enforceQ, GenSchema as GS } from '@/lib/pipeline/steps';
describe('quotation check', () => {
  const passage = 'If the pilgrim forgets how many circuits he has performed, i.e. whether three or four, he should regard them as three (that is, the lesser of the two numbers). The same procedure applies to the Sa’y.';
  it('accepts an exact quotation despite punctuation differences', () => expect(quoteCoverage("whether three or four he should regard them as three, that is the lesser of the two numbers", passage)).toBeGreaterThan(0.9));
  it('rejects an invented quotation', () => expect(quoteCoverage('certainty is not removed by doubt, so he builds on what he is sure of', passage)).toBeLessThan(0.2));
  it('matches Arabic regardless of diacritics', () => expect(quoteCoverage('يصح الاشتراط في الحج والعمرة وهذا مذهب الشافعية', 'يصحُّ الاشتراطُ في الحَجِّ والعُمْرَة، وهذا مَذْهَبُ الشَّافِعِيَّة، والحَنابِلَة')).toBeGreaterThan(0.9));
  it('counts a claim whose quotation is not in the cited passage as unquoted', () => {
    const g = GS.parse({ answerable: true, claims: [{ text: 'x', chunk_ids: ['c1'], quote: 'this sentence does not appear anywhere in the source text' }] });
    const r = enforceQ(g, new Set(['c1']), new Map([['c1', passage]]));
    expect(r.ok).toBe(true); expect(r.unquoted).toBe(1); expect(r.quoted).toBe(0);
  });
});
