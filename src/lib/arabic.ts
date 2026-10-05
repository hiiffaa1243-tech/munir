// Arabic normalisation for search. The original text is always kept for display.
export function normalizeArabic(s: string): string {
  return s
    .replace(/[ً-ٰٟۖ-ۭ]/g, '') // tashkeel and Quranic marks
    .replace(/ـ/g, '')                               // tatweel
    .replace(/[آأإٱ]/g, 'ا')     // alef forms -> bare alef
    .replace(/ى/g, 'ي')                         // alef maqsura -> ya
    .replace(/ة/g, 'ه')                         // ta marbuta -> ha
    .replace(/[ؤ]/g, 'و').replace(/[ئ]/g, 'ي')
    .replace(/\s+/g, ' ').trim();
}
export const hasArabic = (s: string) => /[؀-ۿ]/.test(s);
