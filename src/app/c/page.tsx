'use client';
import { useEffect, useState } from 'react';
import { t, type UiLang } from '@/lib/i18n';
import { applyDocLang, notebookKey, savedLang } from '@/components/client';

/** Landing page of the QR code. The one-time token arrives in the URL fragment, which browsers never send to servers. */
export default function Claim() {
  const [lang, setLang] = useState<UiLang>('ar');
  const [state, setState] = useState<'saving' | 'form' | 'fail'>('saving');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  async function redeem(payload: { token?: string; code?: string }, l: string) {
    const key = notebookKey(true);
    if (!key) { setState('fail'); return; }
    setBusy(true);
    try {
      const r = await fetch('/api/claim/redeem', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...payload, notebook_key: key, lang: l }) });
      if (!r.ok) { setState('fail'); return; }
      location.replace('/n');
    } catch { setState('fail'); } finally { setBusy(false); }
  }

  useEffect(() => {
    const l = savedLang(); setLang(l); applyDocLang(l);
    const token = location.hash.slice(1);
    if (token) { history.replaceState(null, '', location.pathname); redeem({ token }, l); } else setState('form');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main><div className="wrap" style={{ maxWidth: 480 }}>
      <header className="top"><div className="brand"><b>{t(lang, 'nb_title')}</b></div></header>
      {state === 'saving' && <div className="stage"><span className="spin" />{t(lang, 'c_saving')}</div>}
      {state === 'fail' && <div className="err" role="alert">{t(lang, 'c_fail')}</div>}
      {state !== 'saving' && (
        <div className="card">
          <label className="f" htmlFor="code">{t(lang, 'nb_enter_code')}</label>
          <input id="code" className="in code" style={{ fontSize: 26, textAlign: 'center' }} value={code} maxLength={6} autoCapitalize="characters" autoComplete="off" onChange={e => setCode(e.target.value.toUpperCase())} />
          <div className="rowbtns"><button className="btn" disabled={busy || code.trim().length < 6} onClick={() => redeem({ code }, lang)}>{t(lang, 'nb_redeem')}</button>
            <a className="btn ghost" href="/n">{t(lang, 'nb_open')}</a></div>
        </div>
      )}
      <p className="disclosure">{t(lang, 'nb_private')}</p>
    </div></main>
  );
}
