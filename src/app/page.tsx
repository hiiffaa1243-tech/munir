'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { FAQ, UI, UI_LANGS, t, uiLang, type UiLang } from '@/lib/i18n';
import AnswerCard from '@/components/AnswerCard';
import AskBox from '@/components/AskBox';
import { useAsker } from '@/components/useAsker';
import { applyDocLang, randomId, saveLang, savedLang } from '@/components/client';

const LANGS = UI_LANGS;
const IDLE_MS = 60_000;

interface Claim { url: string; code: string; short_url: string; qr: string }

/** The service point. Opened with ?k=<point-id> on a kiosk screen; opened plainly it serves a phone or a laptop. */
export default function ServicePoint() {
  const [lang, setLang] = useState<UiLang>('ar');
  const [text, setText] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [kiosk, setKiosk] = useState<string | undefined>(undefined);
  const [claim, setClaim] = useState<Claim | null>(null);
  const [saving, setSaving] = useState(false);
  const [clar, setClar] = useState('');
  const chooseLang = useCallback((l: string) => { const u = uiLang(l); if (u !== l) return; setLang(u); saveLang(u); applyDocLang(u); }, []);
  // The whole screen follows the language the visitor actually used.
  const asker = useAsker({ lang, sessionId, kiosk, onLang: chooseLang, onAnswer: a => chooseLang(a.lang) });
  const { reset } = asker;

  const newVisitor = useCallback(() => { setSessionId(randomId(18)); setText(''); setClaim(null); setClar(''); reset(); }, [reset]);

  // First load: language, session, kiosk id, and an optional question passed in the link (used by the guided demo).
  const boot = useRef(false);
  useEffect(() => {
    if (boot.current) return; boot.current = true;
    const p = new URLSearchParams(location.search);
    const l = uiLang(p.get('lang') ?? savedLang(false)); setLang(l); applyDocLang(l);
    setKiosk(p.get('k') ?? undefined);
    const sid = randomId(18); setSessionId(sid);
    const q = p.get('q');
    if (q) { setText(q); history.replaceState(null, '', location.pathname + (p.get('k') ? `?k=${encodeURIComponent(p.get('k')!)}` : '')); setTimeout(() => runRef.current(q, l), 50); }
  }, []);
  const runRef = useRef<(q: string, l?: string) => void>(() => {});
  runRef.current = (q, l) => asker.run(q, { lang: l });

  // A kiosk clears itself after a pause, so one visitor never sees another's question.
  useEffect(() => {
    if (!kiosk) return;
    let timer = setTimeout(newVisitor, IDLE_MS);
    const bump = () => { clearTimeout(timer); timer = setTimeout(newVisitor, IDLE_MS); };
    const evs = ['pointerdown', 'keydown', 'touchstart'] as const;
    evs.forEach(e => window.addEventListener(e, bump));
    return () => { clearTimeout(timer); evs.forEach(e => window.removeEventListener(e, bump)); };
  }, [kiosk, newVisitor, asker.busy]);

  const ask = () => { setClaim(null); setClar(''); asker.run(text); };
  async function openSave() {
    if (saving) return; setSaving(true);
    try {
      const r = await fetch('/api/claim', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ session_id: sessionId }) });
      if (!r.ok) throw new Error('claim');
      const c = await r.json();
      const qr = await QRCode.toDataURL(c.url, { margin: 1, width: 480, color: { dark: '#12183F', light: '#FFFFFF' } });
      setClaim({ ...c, qr });
    } catch { asker.fail('error'); } finally { setSaving(false); }
  }
  // Once a visitor has taken their answers to their phone, the session is theirs alone: the next question starts a new one.
  function closeClaim() {
    setClaim(null);
    if (kiosk) newVisitor(); else setSessionId(randomId(18));
  }
  const sendClarification = () => { if (clar.trim().length < 1) return; asker.run(`${asker.question}\n${clar.trim()}`, { clarified: true, lang: asker.answer?.lang }); setClar(''); };

  const a = asker.answer;
  return (
    <main className={kiosk ? 'kiosk' : ''}>
      <div className="wrap">
        <header className="top">
          <div className="brand"><b>{t(lang, 'title')}</b><span>{t(lang, 'sub')}</span></div>
          <nav className="langs" aria-label="Language">
            {LANGS.map(l => <button key={l} className="chip" aria-pressed={l === lang} onClick={() => chooseLang(l)} lang={l}>{UI[l].langName}</button>)}
          </nav>
        </header>

        {!a && !asker.busy && <section className="hero"><h1>{t(lang, 'tagline')}</h1></section>}

        <AskBox lang={lang} value={text} onChange={setText} onAsk={ask} onAudio={asker.runAudio} onError={asker.fail} busy={asker.busy} />

        {asker.error && <div className="err" role="alert">{t(lang, asker.error)}</div>}
        {asker.busy && <div className="stage" role="status" aria-live="polite"><span className="spin" />{t(lang, `st_${asker.stage ?? 'understand'}`)}</div>}

        {!a && !asker.busy && (
          <section>
            <h3 className="sec center">{t(lang, 'faq')}</h3>
            <div className="faq">{FAQ[lang].map(q => <button key={q} onClick={() => { setText(q); asker.run(q); }}>{q}</button>)}</div>
          </section>
        )}

        {a && (
          <>
            <AnswerCard a={a} question={asker.question} onSave={a.tier === 'clarify' ? undefined : openSave}>
              {a.tier === 'clarify' && (
                <div className="rowbtns">
                  <input className="in" style={{ flex: 1, minWidth: 180 }} value={clar} onChange={e => setClar(e.target.value)} placeholder={t(a.lang, 'clarify_ph')} dir="auto" onKeyDown={e => { if (e.key === 'Enter') sendClarification(); }} />
                  <button className="btn sm" onClick={sendClarification}>{t(a.lang, 'send')}</button>
                </div>
              )}
            </AnswerCard>
            <div className="rowbtns noprint" style={{ justifyContent: 'center' }}>
              <button className="btn ghost" onClick={() => { setText(''); setClaim(null); reset(); }}>{t(lang, 'another')}</button>
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
        <div className="modal" role="dialog" aria-modal="true" onClick={closeClaim}>
          <div className="box" onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 22 }}>{t(lang, 'save_h')}</h2>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={claim.qr} alt="QR" />
            <p className="muted small">{t(lang, 'save_or')}</p>
            <p dir="ltr" style={{ fontWeight: 600 }}>{claim.short_url}</p>
            <p className="code">{claim.code}</p>
            <p className="muted small">{t(lang, 'save_note')}</p>
            <div className="rowbtns" style={{ justifyContent: 'center' }}><button className="btn sm ghost" onClick={closeClaim}>✕</button></div>
          </div>
        </div>
      )}
    </main>
  );
}
