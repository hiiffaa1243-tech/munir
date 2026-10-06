'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Answer } from '@/lib/pipeline/types';
import { UI, UI_LANGS, t, uiLang, type UiLang } from '@/lib/i18n';
import AnswerCard from '@/components/AnswerCard';
import AskBox from '@/components/AskBox';
import { useAsker } from '@/components/useAsker';
import { applyDocLang, dirOf, notebookKey, randomId, saveLang, savedLang } from '@/components/client';

interface Item {
  id: string; created_at: string; lang: string; question: string; tier: string; answer: Answer;
  ticket: { id: string; status: string } | null;
  resolution: { text: string; author: string; source_title: string; source_locator: string | null; source_quote: string; resolved_at: string } | null;
}
const CACHE = 'munir_nb_items';
const LANGS = UI_LANGS;

/** The pilgrim's notebook: no account, no name. Saved answers stay readable without a connection. */
export default function Notebook() {
  const [lang, setLang] = useState<UiLang>('ar');
  const [items, setItems] = useState<Item[]>([]);
  const [online, setOnline] = useState(true);
  const [text, setText] = useState('');
  const [code, setCode] = useState(''); const [codeMsg, setCodeMsg] = useState<string | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const sessionId = useRef(''); const known = useRef<Map<string, boolean>>(new Map());
  const chooseLang = (l: string) => { const u = uiLang(l); if (u !== l) return; setLang(u); saveLang(u); applyDocLang(u); };

  const load = useCallback(async () => {
    const key = notebookKey(true); if (!key || !navigator.onLine) return;
    try {
      const r = await fetch('/api/notebook', { headers: { 'x-notebook-key': key } });
      if (!r.ok) return;
      const d = await r.json(); const list = (d.items ?? []) as Item[];
      // Flag answers that arrived from a specialist since the last look.
      const justAnswered = new Set<string>();
      for (const it of list) { const was = known.current.get(it.id); if (was === false && it.resolution) justAnswered.add(it.id); known.current.set(it.id, !!it.resolution); }
      if (justAnswered.size) setFresh(p => new Set([...p, ...justAnswered]));
      setItems(list);
      try { localStorage.setItem(CACHE, JSON.stringify(list.slice(0, 60))); } catch { /* storage full */ }
    } catch { /* offline: the cached copy stays */ }
  }, []);

  useEffect(() => {
    const l = savedLang(); setLang(l); applyDocLang(l);
    sessionId.current = `nb-${randomId(12)}`;
    try { const c = localStorage.getItem(CACHE); if (c) { const list = JSON.parse(c) as Item[]; setItems(list); list.forEach(it => known.current.set(it.id, !!it.resolution)); } } catch { /* no cache */ }
    setOnline(navigator.onLine);
    const on = () => { setOnline(true); load(); }; const off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
    load();
    const poll = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 45_000);
    return () => { clearInterval(poll); window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, [load]);

  const ensured = useRef(false);
  const asker = useAsker({
    lang, sessionId: sessionId.current, kiosk: 'phone', onLang: chooseLang,
    headers: (): Record<string, string> => { const k = notebookKey(true); return k ? { 'x-notebook-key': k } : {}; },
    onAnswer: () => { setText(''); load(); },
  });
  async function ensure() {
    const key = notebookKey(true);
    if (!key || ensured.current) return;
    try { const r = await fetch('/api/notebook', { method: 'POST', headers: { 'x-notebook-key': key } }); if (r.ok) ensured.current = true; } catch { /* the question is still answered, just not saved */ }
  }
  async function ask(q: string, extra?: { clarified?: boolean; lang?: string }) { await ensure(); asker.run(q, extra); }
  async function askAudio(b: Blob) { await ensure(); asker.runAudio(b); }
  const [clar, setClar] = useState('');
  const sendClarification = () => { if (!clar.trim()) return; ask(`${asker.question}\n${clar.trim()}`, { clarified: true, lang: asker.answer?.lang }); setClar(''); };
  async function redeem() {
    const key = notebookKey(true); if (!key) return;
    setCodeMsg(null);
    try {
      const r = await fetch('/api/claim/redeem', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, notebook_key: key, lang }) });
      if (!r.ok) { setCodeMsg(t(lang, 'c_fail')); return; }
      setCode(''); load();
    } catch { setCodeMsg(t(lang, 'error')); }
  }

  const pending = items.filter(i => i.ticket?.status === 'open').length;
  return (
    <main><div className="wrap" style={{ maxWidth: 760 }}>
      <header className="top">
        <div className="brand"><b>{t(lang, 'nb_title')}</b></div>
        <nav className="langs noprint" aria-label="Language">{LANGS.map(l => <button key={l} className="chip" aria-pressed={l === lang} onClick={() => chooseLang(l)} lang={l}>{UI[l].langName}</button>)}</nav>
      </header>
      {!online && <div className="banner" role="status">{t(lang, 'offline_now')}</div>}

      <section className="noprint">
        <h3 className="sec">{t(lang, 'nb_ask')}</h3>
        <AskBox lang={lang} value={text} onChange={setText} onAsk={() => ask(text)} onAudio={askAudio} onError={asker.fail} busy={asker.busy || !online} />
        {asker.error && <div className="err" role="alert">{t(lang, asker.error)}</div>}
        {asker.busy && <div className="stage" role="status" aria-live="polite"><span className="spin" />{t(lang, `st_${asker.stage ?? 'understand'}`)}</div>}
      </section>

      {pending > 0 && <p className="notice">{t(lang, 'nb_pending')}: {pending}</p>}
      {items.length === 0 && !asker.busy && !asker.answer && <div className="card center muted">{t(lang, 'nb_empty')}</div>}

      {/* The answer just received is shown at once, whether or not the saved list has caught up. */}
      {asker.answer && !items.some(i => i.id === asker.answer?.interaction_id) && (
        <AnswerCard a={asker.answer} question={asker.question}>
          {asker.answer.tier === 'clarify' && (
            <div className="rowbtns">
              <input className="in" style={{ flex: 1, minWidth: 160 }} value={clar} onChange={e => setClar(e.target.value)} placeholder={t(asker.answer.lang, 'clarify_ph')} dir="auto" onKeyDown={e => { if (e.key === 'Enter') sendClarification(); }} />
              <button className="btn sm" onClick={sendClarification}>{t(asker.answer.lang, 'send')}</button>
            </div>
          )}
        </AnswerCard>
      )}

      {items.filter(it => it.tier !== 'clarify').map(it => (
        <AnswerCard key={it.id} a={{ ...it.answer, interaction_id: it.id }} question={it.question}>
          {it.resolution ? (
            <div className="resolved" dir={dirOf(it.lang)}>
              <b>{t(it.lang, fresh.has(it.id) ? 'nb_answered' : 'sp_answer')}</b>
              <p style={{ whiteSpace: 'pre-line', marginTop: 4 }}>{it.resolution.text}</p>
              <p className="small muted" style={{ marginTop: 6 }}>{t(it.lang, 'by')}: {it.resolution.author} · {it.resolution.source_title}{it.resolution.source_locator ? ` · ${it.resolution.source_locator}` : ''}</p>
              <details className="src"><summary>{t(it.lang, 'excerpt')}</summary><div className="srcitem"><blockquote dir="auto" style={{ whiteSpace: 'pre-line' }}>{it.resolution.source_quote}</blockquote></div></details>
            </div>
          ) : it.ticket?.status === 'open' ? <div className="pending">{t(it.lang, 'nb_pending')}</div> : null}
        </AnswerCard>
      ))}

      <section className="card noprint">
        <label className="f" htmlFor="code">{t(lang, 'nb_enter_code')}</label>
        <div className="rowbtns" style={{ marginTop: 0 }}>
          <input id="code" className="in" style={{ flex: 1, minWidth: 140, letterSpacing: 4, textAlign: 'center', direction: 'ltr' }} value={code} maxLength={6} autoCapitalize="characters" autoComplete="off" onChange={e => setCode(e.target.value.toUpperCase())} />
          <button className="btn sm" disabled={code.trim().length < 6 || !online} onClick={redeem}>{t(lang, 'nb_redeem')}</button>
          {items.length > 0 && <button className="btn sm ghost" onClick={() => window.print()}>{t(lang, 'nb_print')}</button>}
        </div>
        {codeMsg && <div className="err" role="alert">{codeMsg}</div>}
      </section>
      <p className="disclosure">{t(lang, 'nb_private')} {t(lang, 'nb_install')}.</p>
      <p className="disclosure" style={{ marginTop: 6 }}>{t(lang, 'disclosure')}</p>
    </div></main>
  );
}
