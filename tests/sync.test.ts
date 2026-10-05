import { describe, it, expect } from 'vitest';
import { chunkPage, parseIndex, parsePage } from '@/lib/sync/dorar';

const INDEX = `<ul class="mtree" id="mtree">
 <li class="mtree-node"><a href="#">كتابُ الصَّوم</a><ul class="mtree-level-1"><li><a href="/feqhia/2700">تمهيد</a></li></ul></li>
 <li class="mtree-node mtree-closed"><a href="#">كتابُ الحَجِّ</a>
  <ul class="mtree-level-1">
   <li class="mtree-node"><a href="#">الباب الأول</a><ul class="mtree-level-2"><li><a href="/feqhia/2877">الفصل الأول</a></li><li><a href="/feqhia/2879">الفصل الثاني</a></li></ul></li>
   <li><a href="https://dorar.net/feqhia/2947">المبحث الخامس</a></li>
  </ul></li>
 <li class="mtree-node"><a href="#">كتابُ الحُقوقِ</a><ul class="mtree-level-1"><li><a href="/feqhia/9000">x</a></li></ul></li>
</ul>`;

const PAGE = `<div id="cntnt" class="card-body">
 <div class="card-title"><h1 class="h5-responsive"> المبحث الخامس: الاشتراطُ في الحَجِّ والعُمْرَةِ </h1></div>
 <div class="w-100 mt-4"><br><span class="title-1">المَطْلَب الأوَّل: حُكْمُ الاشتراطِ</span><br><span class="title-2">الفرع الأول: حُكْمه</span><br>يصحُّ الاشتراطُ <span class="tip"> لا تلزَمُ صيغةٌ معيَّنة ((المغني)) (3/266). <a class="hist-link" href="/history/event/5674">ابنُ عُثيمين</a></span> في الحَجِّ والعُمْرَة، وهذا مَذْهَبُ الشَّافِعِيَّة <span class="tip">المجموع</span>، والحَنابِلَة.<br><b>الأدلَّة:</b><br>عن عائِشةَ رَضِيَ اللهُ عنها قالت: حجي واشترطي.<br><span class="title-2">الفرع الثاني: فائدة الاشتراط</span><br>فائدةُ الاشتراطِ: أنَّه إذا حُبِسَ عن النُّسُك بعُذْرٍ؛ فإنَّه يَحِلُّ منه، وليس عليه هَدْيٌ ولا صَوْمٌ، ولا قضاءٌ.</div>
 <section class="public-qa-section"><div class="public-qa-content">
  <article class="public-qa-row"><header><span class="badge">1</span><h4 class="public-qa-question mb-0">ما حكم الاشتراط في الحج والعمرة؟</h4></header><div class="public-qa-answer-wrap"><div class="public-qa-answer"> يصح الاشتراط في الحج والعمرة، وهذا مذهب الشافعية، والحنابلة. </div></div></article>
 </div></section>
</div>`;

describe('dorar sync', () => {
  it('finds only the pages of the Book of Hajj', () => { expect(parseIndex(INDEX)).toEqual([2877, 2879, 2947]); });
  it('splits a page by its headings and drops footnotes', () => {
    const p = parsePage(2947, PAGE);
    expect(p.title).toBe('المبحث الخامس: الاشتراطُ في الحَجِّ والعُمْرَةِ');
    expect(p.sections).toHaveLength(2);
    expect(p.sections[0].heading).toBe('المَطْلَب الأوَّل: حُكْمُ الاشتراطِ › الفرع الأول: حُكْمه');
    expect(p.sections[0].text).toContain('يصحُّ الاشتراطُ في الحَجِّ والعُمْرَة');
    expect(p.sections[0].text).not.toContain('المغني');
    expect(p.sections[0].text).toContain('حجي واشترطي');
    expect(p.qa).toEqual([{ question: 'ما حكم الاشتراط في الحج والعمرة؟', answer: 'يصح الاشتراط في الحج والعمرة، وهذا مذهب الشافعية، والحنابلة.' }]);
  });
  it('keeps the page address on every chunk', () => {
    const cs = chunkPage(parsePage(2947, PAGE));
    expect(cs.length).toBeGreaterThan(0);
    expect(cs[0].id).toBe('dorar_feqhia_2947_0'); expect(cs[0].page).toBe(2947); expect(cs[0].lang).toBe('ar');
    expect(cs[0].path).toContain('الاشتراطُ');
  });
});
