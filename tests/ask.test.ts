// The pipeline end to end on the deterministic stand-ins (MUNIR_MOCK=1): no network, no database.
import { beforeAll, describe, expect, it } from 'vitest';
import type { Answer, AskInput } from '@/lib/pipeline/types';

process.env.MUNIR_MOCK = '1';
let ask: (i: AskInput) => Promise<Answer>;
let db: any; let steps: typeof import('@/lib/pipeline/steps'); let models: typeof import('@/lib/models'); let pipe: typeof import('@/lib/pipeline');
const rows = async (table: string) => ((await db.from(table).select()).data ?? []) as any[];

beforeAll(async () => {
  pipe = await import('@/lib/pipeline'); ask = pipe.ask;
  db = (await import('@/lib/db')).sb(); steps = await import('@/lib/pipeline/steps'); models = await import('@/lib/models');
});

describe('gate 0: is it a question, and was it heard right', () => {
  it('does not store or refer a remark to the device', async () => {
    const before = (await rows('interactions')).length; const tk = (await rows('tickets')).length;
    const a = await ask({ text: 'اتكلم عربي', sessionId: 'kiosk-session-1', voice: true });
    expect(a.tier).toBe('noquestion'); expect(a.lang).toBe('ar'); expect(a.interaction_id).toBeUndefined(); expect(a.ticket).toBeUndefined();
    expect((await rows('interactions')).length).toBe(before); expect((await rows('tickets')).length).toBe(tk);
    expect((await ask({ text: 'hello' })).tier).toBe('noquestion');
  });
  it('asks "did you mean" for a misheard word, and answers once the wording is confirmed', async () => {
    const before = (await rows('interactions')).length;
    const a = await ask({ text: 'أين ميقات أهل الطائر', voice: true });
    expect(a.tier).toBe('confirm'); expect(a.suggest).toBe('أين ميقات أهل الطائف'); expect(a.interaction_id).toBeUndefined();
    expect((await rows('interactions')).length).toBe(before);
    const b = await ask({ text: a.suggest as string, confirmed: true, sessionId: 'kiosk-session-1' });
    expect(b.tier).toBe('grounded'); expect(b.interaction_id).toBeTruthy();
    // Declining the suggestion sends the original wording back as confirmed: it is answered or referred, not asked again.
    expect((await ask({ text: 'أين ميقات أهل الطائر', confirmed: true })).tier).not.toBe('confirm');
    // Evaluation runs behave as before the gate.
    expect((await ask({ text: 'أين ميقات أهل الطائر', isEval: true })).tier).not.toBe('confirm');
  });
  it('treats a difference of punctuation or hamza as the same wording', () => {
    expect(pipe.sameWording('اين ميقات اهل الطائف', 'أين ميقات أهل الطائف؟')).toBe(true);
    expect(pipe.sameWording('أين ميقات أهل الطائر', 'أين ميقات أهل الطائف؟')).toBe(false);
  });
});

describe('grounded path', () => {
  it('answers with numbered sources', async () => {
    const a = await ask({ text: 'How many rounds are there in tawaf?' });
    expect(a.tier).toBe('grounded'); expect(a.claims).toHaveLength(1); expect(a.claims[0].src).toEqual([1]); expect(a.sources).toHaveLength(1);
  });
  it('drops a statement that fails verification and keeps the supported one', async () => {
    const a = await ask({ text: 'Must tawaf be performed barefoot?' });
    expect(a.tier).toBe('grounded'); expect(a.claims).toHaveLength(1);
    expect(a.claims[0].text).toBe('Tawaf consists of seven rounds around the Kaaba.'); expect(a.claims[0].src).toEqual([1]);
    // The dropped statement appears nowhere in what is shown (the server-side diagnostics keep it).
    expect(JSON.stringify([a.summary, a.claims, a.cases, a.action, a.sources])).not.toContain('MOCK_UNSUPPORTED');
    expect((a.flags.verify as any).dropped_statements).toBe(1);
  });
});

describe('terminology questions', () => {
  it('answers the meaning of a locked term from the glossary, without generation', async () => {
    const a = await ask({ text: 'What does Tawaf al-Ifadah mean?' });
    expect(a.tier).toBe('grounded'); expect(a.summary).toBe('Tawaf al-Ifadah: the obligatory tawaf of Hajj after Arafah');
    expect(a.sources[0].url).toBe('https://islamic-content.com/dictionary/word/6627'); expect(a.timings.generate).toBeUndefined();
  });
  it('goes down the normal path when the text is more than one term', async () => {
    expect((await ask({ text: 'What does Tawaf during Hajj mean?' })).flags.term_answer).toBeUndefined();
  });
});

// Long enough not to count as a bare one-line ruling (those always get an explanation).
const PUBLISHED = 'A man in ihram may cover his face. ' + 'This is the position of the Shafi\'i and Hanbali schools and of a group of the early scholars, and it was chosen by Ibn Hazm and by Ibn Uthaymin, because nothing authentic forbids a man in ihram from covering his face, unlike his head. '.repeat(2).trim();

describe('published answers', () => {
  it('explains a thin published answer, and refers a personal case with the general ruling', async () => {
    await db.from('verified_answers').insert({ code: 'PC-1', q_canon: 'Covering the face in ihram', answer: 'يجوز للمحرم أن يغطي وجهه ﷺ', answer_lang: 'ar', answer_en: PUBLISHED, translations: {}, source_title: 'Fatawa', source_locator: null, source_quote: 'q', author_name: 'Committee' });
    const plain = await ask({ text: 'May a man in ihram cover his face?' });
    expect(plain.tier).toBe('verified'); expect(plain.explained).toBeUndefined(); expect(plain.claims).toHaveLength(0);
    const x = await ask({ text: 'May I wear a face mask in ihram?' });
    expect(x.tier).toBe('verified'); expect(x.explained).toBe(true); expect(x.summary).toBe(PUBLISHED);
    expect(x.claims.length).toBeGreaterThan(0); expect(x.sources.length).toBeGreaterThan(0);
    const p = await ask({ text: 'I covered my face in ihram, is my umrah valid?', sessionId: 'kiosk-session-2' });
    expect(p.tier).toBe('referred'); expect(p.flags.refer_reason).toBe('personal_case'); expect(p.summary).toBe(PUBLISHED);
    expect(p.verified?.code).toBe('PC-1'); expect(p.ticket?.id).toBeTruthy();
  });
});

describe('quotation check across scripts', () => {
  it('matches a Chinese quotation character by character', () => {
    const passage = '受戒者不得使用香水，也不得剪指甲。如果忘记而使用，则无须赎罪。';
    expect(steps.quoteCoverage('受戒者不得使用香水,也不得剪指甲', passage)).toBeGreaterThan(0.9);
    expect(steps.quoteCoverage('朝觐者必须赤脚环游天房七圈', passage)).toBeLessThan(0.2);
  });
  it('matches a Hindi quotation with its vowel signs', () => {
    const passage = 'एहराम की हालत में ख़ुशबू लगाना मना है और नाख़ून काटना भी मना है।';
    expect(steps.quoteCoverage('एहराम की हालत में ख़ुशबू लगाना मना है', passage)).toBeGreaterThan(0.9);
    expect(steps.quoteCoverage('एहराम की हालत में ख़ुशबू लगाना जायज़ है और अच्छा है', passage)).toBeLessThan(0.7);
  });
});

describe('speech stand-ins', () => {
  it('returns a valid silent WAV in mock mode', async () => {
    const b = new Uint8Array(await models.speak('hello', 'English'));
    expect(String.fromCharCode(...b.slice(0, 4))).toBe('RIFF'); expect(String.fromCharCode(...b.slice(8, 12))).toBe('WAVE');
    expect(b.length).toBe(44 + 1.5 * 8000 * 2); expect(models.speechType()).toBe('audio/wav');
  });
});
