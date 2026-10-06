# Munir accessibility audit: axe-core (WCAG 2.1 A/AA) on every public screen, plus scripted keyboard / live-region / lang / motion / error checks.
# Usage:  1) MUNIR_MOCK=1 npx next build && MUNIR_MOCK=1 npx next start -p 3141        (the app, mock mode, no keys needed)
#         2) mkdir /tmp/axe && cd /tmp/axe && npm init -y && npm i axe-core             (axe-core is NOT an app dependency)
#         3) pip install playwright && playwright install chromium
#         4) python3 scripts/a11y-audit.py http://localhost:3141 /tmp/axe/node_modules/axe-core/axe.min.js out.json
import asyncio, json, sys
from playwright.async_api import async_playwright

B = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:3141'
AXE = sys.argv[2] if len(sys.argv) > 2 else 'node_modules/axe-core/axe.min.js'
OUT = sys.argv[3] if len(sys.argv) > 3 else 'a11y-result.json'
TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
VIEW = {'desktop': {'width': 1180, 'height': 820}, 'phone': {'width': 390, 'height': 844}}

def nd(ans): return '{"stage":"understand"}\n' + json.dumps({"result": ans}, ensure_ascii=False) + '\n'
SRC = [{"n": 1, "chunk_id": "umrah_howto_011", "title": "How to do ‘Umrah, with selected supplications", "author": "Presidency of Religious Affairs", "page": 22, "path": "Prohibitions of ihram", "excerpt": "It is not permissible for one in ihram, male or female, to use perfume, including scented soap", "url": None},
       {"n": 2, "chunk_id": "umrah_howto_013", "title": "How to do ‘Umrah, with selected supplications", "author": "Presidency of Religious Affairs", "page": 24, "path": "Fidyah", "excerpt": "the individual has the choice between three things: a. Fasting for three days. b. Feeding six poor persons. c. Sacrificing a sheep.", "url": None}]
BASE = {"action": "", "clarify": None, "disagreement": False, "approx_translation": False, "level": "b"}
EXPL = {
  'ar': {**BASE, "tier": "verified", "lang": "ar", "explained": True, "summary": "إذا تطيب المحرم عمدا فعليه الفدية، وهذا باتفاق المذاهب الفقهية الأربعة.",
         "claims": [{"text": "لا يجوز لمن هو في حالة الإحرام أن يستخدم الطِّيب، بما في ذلك الصابون المعطر.", "src": [1]}],
         "cases": [{"condition": "إذا وضع الطِّيب عن قصد وعلم", "ruling": "تجب الفدية: صيام ثلاثة أيام، أو إطعام ستة مساكين، أو ذبح شاة.", "src": [2]}, {"condition": "إذا وضع الطِّيب عن جهل أو نسيان", "ruling": "لا تجب الفدية.", "src": [2]}],
         "notice": "هذه إجابة منشورة في الموسوعة الفقهية بموقع الدرر السنية، منقولة بنصها دون توليد.",
         "verified": {"code": "DR-2955-3", "author": "مؤسسة الدرر السنية", "source_title": "الموسوعة الفقهية: كتاب الحج", "source_locator": "https://dorar.net/feqhia/2955", "source_quote": "إذا تطيب المحرم عمدا فعليه الفدية"},
         "sources": SRC, "interaction_id": "11111111-1111-4111-8111-111111111111", "timings": {"total": 11800}, "flags": {}},
  'en': {**BASE, "tier": "verified", "lang": "en", "explained": True, "summary": "If a person in ihram applies perfume deliberately, the fidyah is due, by agreement of the four schools.",
         "claims": [{"text": "A person in ihram, man or woman, may not use perfume, including scented soap.", "src": [1]}],
         "cases": [{"condition": "Perfume applied knowingly and on purpose", "ruling": "The fidyah is due: fasting three days, or feeding six poor people, or sacrificing a sheep.", "src": [2]}, {"condition": "Perfume applied out of ignorance or forgetfulness", "ruling": "No fidyah is due.", "src": [2]}],
         "notice": "This is a published answer, quoted as written, not generated.",
         "verified": {"code": "DR-2955-3", "author": "Dorar", "source_title": "Encyclopedia of Fiqh: Hajj", "source_locator": "https://dorar.net/feqhia/2955", "source_quote": "If the person in ihram applies perfume deliberately the fidyah is due"},
         "sources": SRC, "interaction_id": "11111111-1111-4111-8111-111111111111", "timings": {"total": 11800}, "flags": {}},
}
CONFIRM = {
  'ar': {**BASE, "tier": "confirm", "lang": "ar", "summary": "", "claims": [], "cases": [], "notice": "هل تقصد:", "suggest": "أين ميقات أهل الطائف؟", "sources": [], "timings": {"total": 900}, "flags": {}},
  'en': {**BASE, "tier": "confirm", "lang": "en", "summary": "", "claims": [], "cases": [], "notice": "Did you mean:", "suggest": "Where is the miqat for the people of Taif?", "sources": [], "timings": {"total": 900}, "flags": {}},
}
Q = {'ar': 'تعطرت بعد الإحرام، ماذا عليّ؟', 'en': 'I used perfume after entering ihram, what is due?'}
CLAIM = {"url": "https://munir-one.vercel.app/c#token", "code": "K7M4QX", "short_url": "munir-one.vercel.app/c", "expires_at": 1791300000000}

async def new_page(b, lang, view, answer=None, delay=0, **kw):
    ctx = await b.new_context(viewport=VIEW[view], locale='ar-SA' if lang == 'ar' else 'en-US', **kw)
    await ctx.add_init_script(f"try{{if(!sessionStorage.getItem('a11y_init')){{sessionStorage.setItem('a11y_init','1');localStorage.setItem('munir_lang','{lang}');localStorage.setItem('munir_sound','0')}}}}catch(e){{}}")  # sound off: the audit must not depend on audio playback
    pg = await ctx.new_page()
    if answer is not None:
        async def ask(route):
            if delay: await asyncio.sleep(delay)
            await route.fulfill(status=200, content_type='application/x-ndjson', body=nd(answer))
        await pg.route('**/api/ask', ask)
    async def claim(route): await route.fulfill(status=200, content_type='application/json', body=json.dumps(CLAIM))
    await pg.route('**/api/claim', claim)
    return ctx, pg

async def type_ask(pg, lang):
    await pg.fill('.typerow input', Q[lang]); await pg.keyboard.press('Enter')

async def axe(pg):
    await pg.add_script_tag(path=AXE)
    r = await pg.evaluate("async (tags) => { const r = await axe.run(document, {runOnly:{type:'tag', values:tags}}); return {v: r.violations.map(v => ({id:v.id, impact:v.impact, help:v.help, nodes:v.nodes.length, example:v.nodes[0].target.join(' '), summary:(v.nodes[0].failureSummary||'').slice(0,260)})), passes:r.passes.length, incomplete:r.incomplete.map(v => ({id:v.id, nodes:v.nodes.length}))}; }", TAGS)
    return r

STATES = ['home-idle', 'home-answer', 'home-confirm', 'home-save-dialog', '/n', '/c', '/demo', '/eval', '/insights', '/specialist']

async def audit(b):
    pages = []
    for lang in ('ar', 'en'):
        for view in VIEW:
            for st in STATES:
                ans = EXPL[lang] if st in ('home-answer', 'home-save-dialog') else CONFIRM[lang] if st == 'home-confirm' else None
                ctx, pg = await new_page(b, lang, view, ans)
                try:
                    await pg.goto(B + (st if st.startswith('/') else f'/?lang={lang}'), wait_until='networkidle'); await pg.wait_for_timeout(500)
                    if ans is not None:
                        await type_ask(pg, lang); await pg.wait_for_selector('article.card', timeout=8000); await pg.wait_for_timeout(400)
                    if st == 'home-save-dialog':
                        await pg.click('article.card .rowbtns .btn.sm:not(.ghost)'); await pg.wait_for_selector('.modal img', timeout=5000)
                    r = await axe(pg)
                    pages.append({'page': st, 'lang': lang, 'viewport': view, 'html_lang': await pg.evaluate("document.documentElement.lang"), 'violations': r['v'], 'passes': r['passes'], 'incomplete': r['incomplete']})
                except Exception as e:
                    pages.append({'page': st, 'lang': lang, 'viewport': view, 'error': str(e)[:300], 'violations': []})
                await ctx.close()
    return pages

FOCUS = """() => { const e = document.activeElement; if (!e || e === document.body) return null; const s = getComputedStyle(e);
  return {tag:e.tagName, cls:e.className && e.className.toString(), label:(e.getAttribute('aria-label') || e.textContent || e.getAttribute('placeholder') || '').trim().slice(0,40),
          ring: s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2, inCard: !!e.closest('article.card')}; }"""

async def checks(b):
    out = {}
    # (a) keyboard only
    ctx, pg = await new_page(b, 'ar', 'desktop', EXPL['ar'], permissions=['microphone'])
    await pg.goto(B + '/?lang=ar', wait_until='networkidle'); await pg.wait_for_timeout(500)
    seq = []
    for _ in range(40):
        await pg.keyboard.press('Tab'); f = await pg.evaluate(FOCUS)
        if f is None or (seq and f == seq[0]): break
        seq.append(f)
    has = lambda pred: any(pred(f) for f in seq)
    a = {'tab_stops_idle': len(seq), 'reaches_mic': has(lambda f: 'micbtn' in (f['cls'] or '')), 'reaches_textbox': has(lambda f: f['tag'] == 'INPUT'),
         'reaches_language_buttons': sum(1 for f in seq if 'chip' in (f['cls'] or '')), 'reaches_switches': sum(1 for f in seq if (f['cls'] or '') == 'sw'),
         'all_stops_have_visible_focus_ring': all(f['ring'] for f in seq), 'stops_without_ring': [f for f in seq if not f['ring']]}
    # Enter on a language button switches the page language
    await pg.focus('.langs .chip[lang=en]'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(200)
    a['enter_activates_language'] = await pg.evaluate("document.documentElement.lang") == 'en'
    await pg.focus('.langs .chip[lang=ar]'); await pg.keyboard.press('Space'); await pg.wait_for_timeout(200)
    a['space_activates_language'] = await pg.evaluate("document.documentElement.lang") == 'ar'
    # Enter on the microphone starts listening (fake microphone)
    await pg.focus('.micbtn'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(1200)
    a['enter_activates_mic'] = await pg.evaluate("document.querySelector('.vstage').dataset.mode") == 'listening' and await pg.get_attribute('.micbtn', 'aria-pressed') == 'true'
    await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
    a['escape_stops_listening'] = await pg.evaluate("document.querySelector('.vstage').dataset.mode") != 'listening'
    # typed question with Enter, then Tab into the answer's actions
    await pg.focus('.typerow input'); await pg.keyboard.type(Q['ar']); await pg.keyboard.press('Enter'); await pg.wait_for_selector('article.card', timeout=8000)
    await pg.focus('.typerow input'); card = []
    for _ in range(25):
        await pg.keyboard.press('Tab'); f = await pg.evaluate(FOCUS)
        if f and f['inCard']: card.append(f)
    a['answer_actions_reached'] = [f['label'] for f in card]; a['answer_actions_have_focus_ring'] = bool(card) and all(f['ring'] for f in card)
    await pg.focus('article.card .rowbtns .btn.sm:not(.ghost)'); await pg.keyboard.press('Enter')
    try: await pg.wait_for_selector('.modal[role=dialog]', timeout=4000); a['enter_opens_save_dialog'] = True
    except Exception: a['enter_opens_save_dialog'] = False
    a['focus_inside_dialog_after_open'] = await pg.evaluate("!!document.activeElement.closest('.modal')")
    await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300); a['escape_closes_dialog'] = await pg.locator('.modal').count() == 0
    a['pass'] = all([a['reaches_mic'], a['reaches_textbox'], a['reaches_language_buttons'] >= 7, a['all_stops_have_visible_focus_ring'], a['enter_activates_language'], a['space_activates_language'],
                     a['enter_activates_mic'], len(card) >= 2, a['answer_actions_have_focus_ring'], a['enter_opens_save_dialog'], a['escape_closes_dialog']])
    out['a_keyboard'] = a
    await ctx.close()

    # (b) screen-reader announcements: status line and the answer
    ctx, pg = await new_page(b, 'ar', 'desktop', EXPL['ar'], delay=1.2)
    await pg.goto(B + '/?lang=ar', wait_until='networkidle'); await pg.wait_for_timeout(400)
    LIVE = "(sel) => { const e = document.querySelector(sel); if (!e) return null; const l = e.closest('[aria-live],[role=status],[role=alert]'); return l ? {role:l.getAttribute('role'), live:l.getAttribute('aria-live'), text:l.textContent.trim().slice(0,120)} : false; }"
    bb = {'status_line_idle': await pg.evaluate(LIVE, '.vline')}
    # a live region must exist BEFORE its text changes, or the change is not announced
    bb['answer_announcer_present_before_answer'] = await pg.evaluate("!!document.querySelector('[data-announce]')")
    await type_ask(pg, 'ar'); await pg.wait_for_timeout(500)
    bb['status_line_thinking'] = await pg.evaluate(LIVE, '.vline')
    await pg.wait_for_selector('article.card', timeout=8000); await pg.wait_for_timeout(300)
    bb['answer_announcement'] = await pg.evaluate(LIVE, '[data-announce]')
    bb['answer_card_labelled'] = await pg.evaluate("(() => { const c = document.querySelector('article.card'); return !!c && !!(c.getAttribute('aria-label') || c.getAttribute('aria-labelledby')); })()")
    bb['pass'] = bool(bb['status_line_idle']) and bool(bb['status_line_thinking']) and bb['answer_announcer_present_before_answer'] and bool(bb['answer_announcement']) and bool((bb['answer_announcement'] or {}).get('text'))
    out['b_live_regions'] = bb
    await ctx.close()

    # (c) <html lang dir> follows the language
    ctx, pg = await new_page(b, 'ar', 'desktop')
    HD = "[document.documentElement.lang, document.documentElement.dir]"; c = {}
    await pg.goto(B + '/?lang=en', wait_until='networkidle'); await pg.wait_for_timeout(300); c['load_?lang=en'] = await pg.evaluate(HD)
    for l in ('ar', 'en', 'ur', 'id', 'fr', 'hi', 'zh'):
        await pg.click(f'.langs .chip[lang={l}]'); await pg.wait_for_timeout(120); c[f'click_{l}'] = await pg.evaluate(HD)
    await pg.goto(B + '/n', wait_until='networkidle'); await pg.wait_for_timeout(300); c['/n_keeps_choice(zh)'] = await pg.evaluate(HD)
    exp = {'ar': 'rtl', 'ur': 'rtl'}
    c['pass'] = c['load_?lang=en'] == ['en', 'ltr'] and all(c[f'click_{l}'] == [l, exp.get(l, 'ltr')] for l in ('ar', 'en', 'ur', 'id', 'fr', 'hi', 'zh')) and c['/n_keeps_choice(zh)'] == ['zh', 'ltr']
    out['c_lang_dir'] = c
    await ctx.close()

    # (d) prefers-reduced-motion
    d = {}
    for motion in ('no-preference', 'reduce'):
        ctx, pg = await new_page(b, 'ar', 'desktop', EXPL['ar'], delay=2.5, reduced_motion=motion)
        await pg.goto(B + '/?lang=ar', wait_until='networkidle'); await pg.wait_for_timeout(300)
        await type_ask(pg, 'ar'); await pg.wait_for_selector('.vstage[data-mode=thinking]', timeout=4000)
        d[motion] = await pg.evaluate("(() => { const h = getComputedStyle(document.querySelector('.vstage .h1')); const m = getComputedStyle(document.querySelector('.micbtn')); return {thinking_ring_animation:h.animationName, mic_transition:m.transitionDuration}; })()")
        await ctx.close()
    d['pass'] = d['no-preference']['thinking_ring_animation'] == 'orbit' and d['reduce']['thinking_ring_animation'] == 'none' and set(d['reduce']['mic_transition'].replace(' ', '').split(',')) == {'0s'}
    out['d_reduced_motion'] = d

    # (e) error states say what happened and what to do next
    e = {}
    ERR = "() => { const x = document.querySelector('.err[role=alert]'); const h = document.querySelector('.vhint'); return {alert: x ? x.textContent.trim() : null, hint: h ? h.textContent.trim() : null, hint_role: h ? h.getAttribute('role') : null}; }"
    ctx, pg = await new_page(b, 'en', 'desktop')   # microphone refused
    await ctx.add_init_script("navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('denied','NotAllowedError'))")
    await pg.goto(B + '/?lang=en', wait_until='networkidle'); await pg.wait_for_timeout(300); await pg.click('.micbtn'); await pg.wait_for_timeout(800)
    e['mic_denied'] = await pg.evaluate(ERR); await ctx.close()
    ctx, pg = await new_page(b, 'en', 'desktop')   # the network fails while asking
    async def dead(route): await route.abort()
    await pg.route('**/api/ask', dead)
    await pg.goto(B + '/?lang=en', wait_until='networkidle'); await pg.wait_for_timeout(300); await type_ask(pg, 'en'); await pg.wait_for_timeout(900)
    e['ask_network_failure'] = await pg.evaluate(ERR)
    e['ask_network_failure']['textbox_still_usable'] = await pg.is_enabled('.typerow input'); await ctx.close()
    ctx, pg = await new_page(b, 'en', 'desktop', permissions=['microphone'])   # speech heard but not understood (transcription fails)
    async def stt(route): await route.fulfill(status=500, content_type='application/json', body='{"error":"stt"}')
    await pg.route('**/api/transcribe', stt)
    await pg.goto(B + '/?lang=en', wait_until='networkidle'); await pg.wait_for_timeout(300); await pg.click('.micbtn')
    try: await pg.wait_for_selector('.vhint', timeout=20000)
    except Exception: pass
    e['speech_not_recognised'] = await pg.evaluate(ERR); await ctx.close()
    nxt = lambda s: bool(s) and any(w in s.lower() for w in ('type', 'try again', 'tap'))
    e['pass'] = nxt(e['mic_denied']['alert']) and nxt(e['ask_network_failure']['alert']) and nxt(e['speech_not_recognised']['hint'])
    out['e_error_states'] = e
    return out

def summarise(pages):
    by_rule, by_impact, nodes = {}, {}, 0
    for p in pages:
        for v in p['violations']:
            r = by_rule.setdefault(v['id'], {'impact': v['impact'], 'help': v['help'], 'occurrences': 0, 'nodes': 0, 'pages': []})
            r['occurrences'] += 1; r['nodes'] += v['nodes']; nodes += v['nodes']
            if p['page'] not in r['pages']: r['pages'].append(p['page'])
            i = by_impact.setdefault(v['impact'], {'occurrences': 0, 'nodes': 0}); i['occurrences'] += 1; i['nodes'] += v['nodes']
    return {'screens_audited': len(pages), 'screens_with_violations': sum(1 for p in pages if p['violations']), 'screens_failed_to_load': sum(1 for p in pages if p.get('error')),
            'violations_total': sum(len(p['violations']) for p in pages), 'nodes_total': nodes, 'by_impact': by_impact, 'by_rule': by_rule}

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'])
        pages = await audit(b)
        try: ck = await checks(b)
        except Exception as ex: ck = {'error': str(ex)[:400]}
        await b.close()
    res = {'tool': 'axe-core', 'standard': 'WCAG 2.1 A + AA (tags ' + ', '.join(TAGS) + ')', 'summary': summarise(pages), 'checks': ck, 'pages': pages}
    json.dump(res, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(json.dumps(res['summary'], ensure_ascii=False, indent=1)); print(json.dumps(ck, ensure_ascii=False, indent=1))
asyncio.run(main())
