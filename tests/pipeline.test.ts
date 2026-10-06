import { describe, expect, it } from 'vitest';
import { tidy, dedupeTerms, honorifics, textLang } from '@/lib/glossary/mask';
import { claimScope, scopeInteraction, makeClaimToken, readClaimToken } from '@/lib/notebook/tokens';

describe('repeated glossary renderings', () => {
  it('collapses a term written next to its own token (Arabic)', () => {
    expect(tidy('يشترط للطواف الطواف الطهارة', 'ar')).toBe('يشترط للطواف الطهارة');
    expect(tidy('يستلم الركن اليماني الركن اليماني والحجر الأسود الحجر الأسود إن تيسر', 'ar')).toBe('يستلم الركن اليماني والحجر الأسود إن تيسر');
    expect(tidy('وهذا من السنة السنة.', 'ar')).toBe('وهذا من السنة.');
    expect(tidy('يبدأ بالطواف الطواف ثم السعي', 'ar')).toBe('يبدأ بالطواف ثم السعي');
  });
  it('collapses it in Latin-script languages too', () => {
    expect(tidy('Le tawaf tawaf (les sept tours autour de la Kaaba) est un pilier.', 'fr')).toBe('Le tawaf (les sept tours autour de la Kaaba) est un pilier.');
    expect(dedupeTerms('He performs Tawaf tawaf first.', 'en')).toBe('He performs Tawaf first.');
  });
  it('leaves legitimate sentences alone', () => {
    for (const s of ['طواف الإفاضة ركن، والطواف بالبيت سبعة أشواط', 'السنة في الطواف، الطواف على طهارة', 'لبس المخيط من محظورات الإحرام', 'من ترك واجبا واجبا عليه دم'])
      expect(tidy(s, 'ar')).toBe(s);
    const fr = 'Le tawaf est un pilier, le tawaf se fait en sept tours.';
    expect(tidy(fr, 'fr')).toBe(fr);
  });
});

describe('honorific ligatures', () => {
  it('writes the honorific out in the reader\'s language', () => {
    expect(honorifics('قال النبي ﷺ: خذوا عني مناسككم', 'ar')).toBe('قال النبي صلى الله عليه وسلم: خذوا عني مناسككم');
    expect(honorifics('The Prophet ﷺ said so.', 'en')).toBe('The Prophet (peace be upon him) said so.');
    expect(honorifics('Le Prophète ﷺ a dit', 'fr')).toBe('Le Prophète (paix et salut sur lui) a dit');
  });
  it('does not double brackets and leaves no glyph', () => {
    expect(honorifics('The Prophet (ﷺ) said so.', 'en')).toBe('The Prophet (peace be upon him) said so.');
    expect(honorifics('النبي (ﷺ) قال', 'ar')).toBe('النبي صلى الله عليه وسلم قال');
    expect(honorifics('先知ﷺ说', 'zh')).not.toMatch(/ﷺ/);
  });
  it('guesses the language of a source excerpt', () => {
    expect(textLang('قال النبي')).toBe('ar'); expect(textLang('The Prophet said')).toBe('en'); expect(textLang('朝觐的条件')).toBe('zh');
  });
});

describe('single-answer claim scope', () => {
  const id = '3f2b8c1e-4a5d-4e6f-8a9b-0c1d2e3f4a5b';
  it('round-trips an interaction id through the scope and the token', () => {
    expect(claimScope(id)).toBe('i:' + id);
    expect(scopeInteraction(claimScope(id))).toBe(id);
    const { token } = makeClaimToken(claimScope(id), 1000, 1_000_000);
    expect(scopeInteraction(readClaimToken(token, 1_000_500)?.sid)).toBe(id);
  });
  it('refuses a legacy whole-session scope and malformed ids', () => {
    expect(scopeInteraction('kiosk-session-123456')).toBeNull();
    expect(scopeInteraction('i:not-a-uuid')).toBeNull();
    expect(scopeInteraction('i:')).toBeNull(); expect(scopeInteraction(null)).toBeNull(); expect(scopeInteraction(id)).toBeNull();
  });
});
