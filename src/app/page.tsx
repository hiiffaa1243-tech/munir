'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { FAQ, UI, UI_LANGS, t, uiLang, type UiLang } from '@/lib/i18n';
import type { Answer } from '@/lib/pipeline/types';
import AnswerCard, { Words } from '@/components/AnswerCard';
import { useAsker, type AskExtra } from '@/components/useAsker';
import { useVoice } from '@/components/useVoice';
import { speechActive, stopSpeech, useSpeaker } from '@/components/useSpeaker';
import { applyDocLang, randomId, saveLang, savedLang, sayParts, wordCount, yesNo } from '@/components/client';

const LANGS = UI_LANGS;
const IDLE_MS = 60_000;

interface Claim { url: string; code: string; short_url: string; qr: string }
const store = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };
const stored = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };

const MicIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </svg>
);

/**
 * The service point. Opened with ?k=<point-id> on a kiosk screen; opened plainly it serves a phone or a laptop.
 * Listening is the main way in: the visitor speaks, Munir notices the silence, answers, and reads the answer aloud.
 */
export default function ServicePoint() {
  const [lang, setLang] = useState<UiLang>('ar');
  const [text, setText] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [kiosk, setKiosk] = useState<string | undefined>(undefined);
  const [claim, setClaim] = useState<Claim | null>(null);
  const [saving, setSaving] = useState(false);
  const [clar, setClar] = useState('');
  const [hint, setHint] = useState<string | null>(null);
  const [auto, setAuto] = useState(false);    // hands-free: listen again after every answer
  const [micOk, setMicOk] = useState(false);  // hands-free listening may run (permission known, or the visitor pressed once)
  const [sound, setSound] = useState(true);   // answers are read aloud
  // Hands-free only: the answer on screen stays while a new utterance is looked at, and comes back if it was not a question.
  const [prev, setPrev] = useState<{ a: Answer; q: string } | null>(null);
  const spoken = useRef(false);               // the question on screen was asked by voice
  const tries = useRef(0);
  const lastActive = useRef(0);

  const chooseLang = useCallback((l: string) => { const u = uiLang(l); if (u !== l) return; setLang(u); saveLang(u); applyDocLang(u); }, []);
  // The whole screen follows the language the visitor actually used. A stray phrase that was not a question does not change it.
  const asker = useAsker({ lang, sessionId, kiosk, onAnswer: a => { if (a.tier !== 'noquestion') chooseLang(a.lang); } });
  const { reset, run } = asker;
  const speaker = useSpeaker();

  const ask = (q: string, extra: AskExtra = {}) => {
    if (q.trim().length < 2) return;
    speaker.stop(); setClaim(null); setClar(''); setHint(null); setText(''); tries.current = 0;
    const cur = live.current.shown;
    setPrev(extra.voice && auto && cur && cur.a.tier !== 'confirm' && cur.a.tier !== 'clarify' ? cur : null);
    spoken.current = !!extra.voice;
    run(q, extra);
  };
  const confirmYes = () => { const a = live.current.shown?.a; if (a?.tier === 'confirm' && a.suggest) ask(a.suggest, { confirmed: true, voice: spoken.current, lang: a.lang }); };
  const confirmNo = () => {
    speaker.stop(); reset(); setPrev(null); setText(''); voice.clearCaption(); setHint(t(lang, 'v_again'));
    if (!auto && spoken.current) void voice.start(true);
  };
  // What the visitor said, once they have fallen silent.
  const heard = (said: string, l?: string) => {
    const cur = live.current.shown; const a = cur?.a;
    if (a?.tier === 'confirm' && a.suggest) {
      const n = wordCount(said); const v = n <= 4 ? yesNo(said, a.lang) : null;
      if (v === 'yes') { confirmYes(); return; }
      if (v === 'no') { confirmNo(); return; }
      if (n <= 3) { // neither a yes, a no, nor a new question
        voice.clearCaption(); setHint(t(lang, 'v_yesno'));
        if (!auto && tries.current++ < 2) void voice.start(true);
        return;
      }
    }
    if (a?.tier === 'clarify' && cur?.q) { ask(`${cur.q}\n${said}`, { clarified: true, voice: true, lang: a.lang }); return; }
    ask(said, { voice: true, lang: l });
  };
  const voice = useVoice({
    lang, muted: !sound, onFinal: heard,
    onEmpty: () => setHint(t(lang, 'v_nohear')),
    onError: k => { setMicOk(false); asker.fail(k); },
  });
  const { phase } = voice;

  // Values that timers and callbacks need as they are now, not as they were when the callback was made.
  const fresh = asker.answer && asker.answer.tier !== 'noquestion' ? { a: asker.answer, q: asker.question } : null;
  const shown = fresh ?? (asker.busy || asker.answer ? prev : null);
  const a: Answer | null = shown?.a ?? null;
  const live = useRef({ auto, answer: asker.answer, busy: asker.busy, shown, dirty: false });
  live.current = { auto, answer: asker.answer, busy: asker.busy, shown, dirty: !!(a || text || hint || claim) };

  const newVisitor = useCallback(() => {
    speaker.stop(); voice.clearCaption();
    setSessionId(randomId(18)); setText(''); setClaim(null); setClar(''); setHint(null); setPrev(null); reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reset]);

  // First load: language, session, kiosk id, saved choices, and an optional question passed in the link (used by the guided demo).
  const runRef = useRef<(q: string, l?: string) => void>(() => {});
  runRef.current = (q, l) => ask(q, { lang: l });
  const boot = useRef(false);
  useEffect(() => {
    if (boot.current) return; boot.current = true;
    const p = new URLSearchParams(location.search);
    const l = uiLang(p.get('lang') ?? savedLang(false)); setLang(l); applyDocLang(l);
    const k = p.get('k') ?? undefined; setKiosk(k);
    setSessionId(randomId(18));
    setSound(stored('munir_sound') !== '0');
    // A kiosk listens by itself; a phone or a laptop waits for a press unless its owner chose otherwise.
    const hf = k ? true : stored('munir_hf') === '1'; setAuto(hf);
    if (hf) {
      try {
        navigator.permissions?.query({ name: 'microphone' as PermissionName }).then(s => { if (s.state === 'granted') setMicOk(true); }).catch(() => {});
      } catch { /* the first press will ask */ }
    }
    const q = p.get('q');
    if (q) { history.replaceState(null, '', location.pathname + (k ? `?k=${encodeURIComponent(k)}` : '')); setTimeout(() => runRef.current(q, l), 50); }
  }, []);

  // Any tap or key press unlocks sound for the rest of the visit.
  const { prime } = speaker; const { wake } = voice;
  useEffect(() => {
    const unlock = () => { prime(); wake(); };
    window.addEventListener('pointerdown', unlock); window.addEventListener('keydown', unlock);
    return () => { window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
  }, [prime, wake]);

  useEffect(() => () => stopSpeech(), []); // leaving the page ends the reading

  // Non-questions heard in a row while hands-free (see the answer effect). Any touch or key starts the count again.
  const idleHits = useRef(0);
  const voiceNow = useRef(voice); voiceNow.current = voice;
  useEffect(() => {
    const touched = () => { idleHits.current = 0; };
    // A hidden tab must not keep the microphone open or keep uploading audio.
    const hidden = () => { if (document.hidden) { setMicOk(false); voiceNow.current.stop(); stopSpeech(); } };
    window.addEventListener('pointerdown', touched); document.addEventListener('visibilitychange', hidden);
    return () => { window.removeEventListener('pointerdown', touched); document.removeEventListener('visibilitychange', hidden); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A new answer is read aloud as soon as it is on screen, with no extra press.
  useEffect(() => {
    const a = asker.answer; if (!a) return;
    voice.clearCaption();
    if (a.tier === 'noquestion') {
      // Three utterances in a row that were not questions, with nobody touching the screen: the hall is noisy, not asking.
      // Hands-free listening stops and waits for one tap, so an unattended kiosk does not keep transcribing the room.
      if (auto && ++idleHits.current >= 3) { idleHits.current = 0; setMicOk(false); voice.stop(); }
      // Not a question: a gentle line on the stage, no card. A hands-free kiosk stays silent so that chatter nearby does not make it talk.
      const line = a.notice || t(a.lang, 'n_noquestion');
      if (auto && prev) return; // the earlier answer is still being read on screen: leave it in peace
      setHint(line);
      if (!auto && sound) speaker.speak({ key: 'stage', lang: a.lang, parts: [{ id: 'note', text: line }] });
      return;
    }
    idleHits.current = 0;
    if (a.tier === 'confirm' && a.suggest) setText(a.suggest);
    const wantsReply = a.tier === 'confirm' || a.tier === 'clarify';
    // After "Did you mean ...?" Munir listens for the reply. Hands-free does this by itself (see below).
    const after = (done: boolean) => { if (done && wantsReply && !live.current.auto && spoken.current && live.current.answer === a && !live.current.busy) void voice.start(true); };
    if (sound) speaker.speak({ key: 'live', lang: a.lang, parts: sayParts(a), onEnd: after }); else after(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asker.answer]);

  // Hands-free: listen whenever nothing else is happening, and never while Munir is thinking or speaking.
  useEffect(() => {
    const blocked = asker.busy || speechActive() || !!claim;
    const open = phase === 'listening' || phase === 'hearing';
    if (auto && micOk) {
      if (blocked) { if (open) voice.pause(); }
      else if (phase === 'paused') voice.resume();
      else if (phase === 'off') void voice.start(false);
    } else if (blocked && open) voice.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, micOk, asker.busy, speaker.active, claim, phase]);

  // A kiosk clears itself after a pause, so one visitor never sees another's question. Speech nearby that was not a
  // question does not count as activity: only a touch, a key, a real answer or Munir's own reading does.
  useEffect(() => { lastActive.current = Date.now(); }, [a, speaker.active]);
  useEffect(() => {
    if (!kiosk) return;
    const bump = () => { lastActive.current = Date.now(); };
    const iv = setInterval(() => {
      if (Date.now() - lastActive.current < IDLE_MS || speechActive() || live.current.busy) return;
      bump(); if (live.current.dirty) newVisitor();
    }, 3000);
    const evs = ['pointerdown', 'keydown', 'touchstart'] as const;
    evs.forEach(e => window.addEventListener(e, bump));
    return () => { clearInterval(iv); evs.forEach(e => window.removeEventListener(e, bump)); };
  }, [kiosk, newVisitor]);

  const micPress = () => {
    prime(); setHint(null);
    if (speechActive()) { speaker.stop(); if (auto) setMicOk(true); else void voice.start(true); return; } // a press while Munir speaks: stop and listen
    if (asker.busy) return;
    if (auto) { if (micOk && phase !== 'off') { setMicOk(false); voice.stop(); } else setMicOk(true); return; }
    if (phase === 'off') void voice.start(true); else voice.stop();
  };
  // Space toggles the microphone, Escape stops Munir speaking or listening.
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = e => {
    const el = e.target as HTMLElement | null;
    const inControl = !!el && /^(INPUT|TEXTAREA|SELECT|BUTTON|A|SUMMARY)$/.test(el.tagName);
    if (e.key === 'Escape') {
      if (claim) { closeClaim(); return; }
      speaker.stop();
      if (auto) voice.pause(); else voice.stop();
    } else if (e.code === 'Space' && !inControl && !e.repeat && !claim) { e.preventDefault(); micPress(); }
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const toggleSound = () => { const v = !sound; setSound(v); store('munir_sound', v ? '1' : '0'); if (v) prime(); else speaker.stop(); };
  const toggleAuto = () => {
    const v = !auto; setAuto(v); if (!kiosk) store('munir_hf', v ? '1' : '0');
    if (v) { prime(); setMicOk(true); } else { setMicOk(false); voice.stop(); }
  };

  const submit = () => ask(text, a?.tier === 'confirm' ? { confirmed: true } : {});
  async function openSave() {
    const id = a?.interaction_id;
    if (saving || !id) return; setSaving(true);
    try {
      // The code covers this one answer only, never the rest of the session.
      const r = await fetch('/api/claim', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ session_id: sessionId, interaction_id: id }) });
      if (!r.ok) throw new Error('claim');
      const c = await r.json();
      const qr = await QRCode.toDataURL(c.url, { margin: 1, width: 480, color: { dark: '#12183F', light: '#FFFFFF' } });
      setClaim({ ...c, qr });
      setSessionId(randomId(18)); // from the moment the code is on screen, whoever asks next is a different visitor
    } catch { asker.fail('error'); } finally { setSaving(false); }
  }
  function closeClaim() {
    setClaim(null);
    if (kiosk) newVisitor(); else setSessionId(randomId(18));
  }
  const sendClarification = () => { if (clar.trim().length < 1 || !shown) return; ask(`${shown.q}\n${clar.trim()}`, { clarified: true, lang: shown.a.lang }); };
  const another = () => { speaker.stop(); voice.clearCaption(); setText(''); setClaim(null); setHint(null); setPrev(null); reset(); };

  // What the stage shows.
  const thinking = asker.busy || phase === 'transcribing';
  const mode = thinking ? 'thinking' : speaker.active ? 'speaking' : phase === 'listening' || phase === 'hearing' || phase === 'starting' ? 'listening' : 'idle';
  const stageText = (k: string) => { const s = t(lang, `st_${k}`); return s.startsWith('st_') ? t(lang, 'v_thinking') : s; };
  const line = asker.busy ? stageText(asker.stage ?? 'understand') : phase === 'transcribing' ? stageText('transcribe')
    : mode === 'speaking' ? t(lang, 'v_speaking') : mode === 'listening' ? t(lang, a?.tier === 'confirm' ? 'v_yesno' : 'v_listening') : t(lang, 'v_tap');
  // The visitor's own words, shown once: live while they speak, then until the answer card takes over.
  const caption = voice.caption || (asker.busy ? asker.question : '');

  // For screen readers: the kind of answer, and its text when Munir is not reading it aloud himself (no double speech).
  const tierKey = a ? (a.tier === 'verified' && /^(PC|DR)-/.test(a.verified?.code ?? '') ? 't_published' : `t_${a.tier}`) : '';
  const announce = a ? [t(a.lang, tierKey), sound ? '' : (a.suggest || a.clarify || a.summary || a.notice || '')].filter(Boolean).join('. ') : '';

  // The rings follow the live level without re-rendering the page.
  const orb = useRef<HTMLDivElement>(null);
  const { level } = voice;
  useEffect(() => {
    const el = orb.current; if (!el) return;
    if (mode !== 'listening' || (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches)) { el.style.setProperty('--lv', '0'); return; }
    let raf = 0; let cur = 0;
    const loop = () => { const to = level.current; cur += (to - cur) * (to > cur ? 0.45 : 0.1); el.style.setProperty('--lv', cur.toFixed(3)); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); el.style.setProperty('--lv', '0'); };
  }, [mode, level]);

  return (
    <main className={kiosk ? 'kiosk' : ''}>
      <div className="wrap">
        <header className="top">
          <div className="brand"><b>{t(lang, 'title')}</b><span>{t(lang, 'sub')}</span></div>
          <div className="tools noprint">
            <nav className="langs" aria-label="Language">
              {LANGS.map(l => <button key={l} type="button" className="chip" aria-pressed={l === lang} onClick={() => chooseLang(l)} lang={l}>{UI[l].langName}</button>)}
            </nav>
            <div className="prefs">
              <button type="button" className="sw" role="switch" aria-checked={sound} onClick={toggleSound}><i />{t(lang, 'v_sound')}</button>
              <button type="button" className="sw" role="switch" aria-checked={auto} onClick={toggleAuto}><i />{t(lang, 'v_auto')}</button>
            </div>
          </div>
        </header>

        <section className={`vstage noprint${a ? ' compact' : ''}`} data-mode={mode}>
          {a ? <h1 className="sr">{t(lang, 'tagline')}</h1> : <h1 className="vtitle">{t(lang, 'tagline')}</h1>}
          <div className="orb" ref={orb}>
            <span className="halo h2" aria-hidden="true" /><span className="halo h1" aria-hidden="true" />
            <button type="button" className="micbtn" onClick={micPress} disabled={thinking} aria-pressed={mode === 'listening'} aria-label={t(lang, mode === 'listening' ? 'v_mic_off' : 'v_mic_on')}><MicIcon /></button>
          </div>
          <p className="vline" role="status" aria-live="polite">{line}</p>
          <p className="vcap" dir="auto">{caption}</p>
          {hint && !thinking && <p className="vhint" role="status" dir="auto" data-say="stage"><span data-seg="note"><Words text={hint} /></span></p>}
        </section>

        <form className="typerow noprint" onSubmit={e => { e.preventDefault(); if (!asker.busy) submit(); }}>
          <input className="in" value={text} onChange={e => setText(e.target.value)} placeholder={t(lang, 'v_type')} aria-label={t(lang, 'placeholder')} maxLength={500} dir="auto" enterKeyHint="send" autoComplete="off" />
          <button type="submit" className="btn" disabled={asker.busy || text.trim().length < 2}>{t(lang, 'ask')}</button>
        </form>

        {asker.error && <div className="err" role="alert">{t(lang, asker.error)}</div>}
        {/* Always in the page, so that a new answer is announced when its text arrives. */}
        <p className="sr" role="status" aria-live="polite" data-announce lang={a?.lang} dir="auto">{announce}</p>

        {!a && !asker.busy && (
          <section className="noprint">
            <h3 className="sec center">{t(lang, 'faq')}</h3>
            <div className="faq">{FAQ[lang].map(q => <button key={q} type="button" onClick={() => ask(q)}>{q}</button>)}</div>
          </section>
        )}

        {a && (
          <>
            <AnswerCard key={a.interaction_id ?? shown?.q} a={a} question={shown?.q} sayKey="live" onSave={a.interaction_id && a.tier !== 'clarify' ? openSave : undefined}>
              {a.tier === 'confirm' && (
                <div className="rowbtns confirm">
                  <button type="button" className="btn" onClick={confirmYes}>{t(a.lang, 'yes')}</button>
                  <button type="button" className="btn ghost" onClick={confirmNo}>{t(a.lang, 'no')}</button>
                </div>
              )}
              {a.tier === 'clarify' && (
                <div className="rowbtns">
                  <input className="in" style={{ flex: 1, minWidth: 180 }} value={clar} onChange={e => setClar(e.target.value)} placeholder={t(a.lang, 'clarify_ph')} aria-label={t(a.lang, 'clarify_ph')} dir="auto" onKeyDown={e => { if (e.key === 'Enter') sendClarification(); }} />
                  <button type="button" className="btn sm" onClick={sendClarification}>{t(a.lang, 'send')}</button>
                </div>
              )}
            </AnswerCard>
            <div className="rowbtns noprint" style={{ justifyContent: 'center' }}>
              <button type="button" className="btn ghost" onClick={another}>{t(lang, 'another')}</button>
            </div>
          </>
        )}

        <p className="disclosure">{t(lang, 'disclosure')}</p>
        {kiosk
          ? <p className="disclosure" style={{ marginTop: 6 }}>{t(lang, 'idle')}</p>
          : (
            <nav className="foot noprint" dir="rtl">
              <a href="/n">{t(lang, 'nb_open')}</a><a href="/demo">{t(lang, 'how')}</a><a href="/eval">نتائج التقييم</a><a href="/insights">مؤشرات الاستخدام</a><a href="/specialist">لوحة المتخصص الشرعي</a>
            </nav>
          )}
      </div>

      {claim && (
        <div className="modal" role="dialog" aria-modal="true" aria-label={t(lang, 'save_h')} onClick={closeClaim}>
          <div className="box" onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 22 }}>{t(lang, 'save_h')}</h2>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={claim.qr} alt={`QR: ${claim.short_url}`} />
            <p className="muted small">{t(lang, 'save_or')}</p>
            <p dir="ltr" style={{ fontWeight: 600 }}>{claim.short_url}</p>
            <p className="code">{claim.code}</p>
            <p className="muted small">{t(lang, 'save_note')}</p>
            <div className="rowbtns" style={{ justifyContent: 'center' }}><button type="button" className="btn sm ghost" onClick={closeClaim} autoFocus>{t(lang, 'close')}</button></div>
          </div>
        </div>
      )}
    </main>
  );
}
