'use client';
import { useRef, useState } from 'react';
import type { Answer } from '@/lib/pipeline/types';
import { t } from '@/lib/i18n';
import { dirOf, speechText } from './client';

const Refs = ({ ns }: { ns: number[] }) => <>{ns.map(n => <span key={n} className="ref">{n}</span>)}</>;

/** One answer, rendered in the asker's language. The trust tier is always the first thing shown. */
export default function AnswerCard({ a, question, onSave, children }: { a: Answer; question?: string; onSave?: () => void; children?: React.ReactNode }) {
  const L = a.lang; const tr = (k: string) => t(L, k);
  const [playing, setPlaying] = useState(false); const [loadingAudio, setLoadingAudio] = useState(false);
  const [reported, setReported] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const hasBody = !!(a.summary || a.claims.length || a.cases.length);

  async function listen() {
    if (playing) { audio.current?.pause(); setPlaying(false); return; }
    setLoadingAudio(true);
    // The element is created and primed inside the tap itself; phones refuse playback that starts after a network wait.
    const el = new Audio(); audio.current = el;
    el.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='; el.play().catch(() => {});
    try {
      const r = await fetch('/api/tts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: speechText(a), lang: L }) });
      if (!r.ok) throw new Error('tts');
      const url = URL.createObjectURL(await r.blob());
      el.onended = () => { setPlaying(false); URL.revokeObjectURL(url); };
      el.src = url; await el.play(); setPlaying(true);
    } catch { /* speech is an enhancement; the text stays on screen */ } finally { setLoadingAudio(false); }
  }
  async function report() {
    if (!a.interaction_id || reported) return;
    setReported(true);
    fetch('/api/report', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ interaction_id: a.interaction_id }) }).catch(() => {});
  }

  return (
    <article className="card" dir={dirOf(L)} lang={L}>
      {question && <div className="q">{question}</div>}
      <span className={`badge b-${a.tier}`}><i />{tr(`t_${a.tier}`)}</span>
      {a.notice && <p className="notice">{a.notice}</p>}
      {a.tier === 'clarify' && a.clarify && <p className="sum">{a.clarify}</p>}
      {a.summary && <p className="sum" style={{ whiteSpace: 'pre-line' }}>{a.summary}</p>}
      {a.verified && (
        <p className="muted small">{tr('by')}: {a.verified.author} · {a.verified.source_title}{a.verified.source_locator ? ` · ${a.verified.source_locator}` : ''}</p>
      )}
      {a.claims.length > 0 && (
        <ul className="claims">{a.claims.map((c, i) => <li key={i}>{c.text}<Refs ns={c.src} /></li>)}</ul>
      )}
      {a.cases.length > 0 && (<>
        <h3 className="sec">{tr('cases')}</h3>
        <div className="cases">{a.cases.map((c, i) => <div className="case" key={i}><b>{c.condition}</b>{c.ruling}<Refs ns={c.src} /></div>)}</div>
      </>)}
      {a.action && <div className="action"><b>{tr('action')}: </b>{a.action}</div>}
      {a.disagreement && <p className="notice">{tr('n_disagree')}</p>}
      {a.approx_translation && <p className="notice">{tr('approx')}</p>}
      {a.ticket?.id && <p className="muted small">{tr('ticket')} #{a.ticket.id.slice(0, 8).toUpperCase()}</p>}
      {children}
      {a.sources.length > 0 && (
        <details className="src">
          <summary>{tr('sources')} ({a.sources.length})</summary>
          {a.sources.map(s => (
            <div className="srcitem" key={s.n}>
              <div className="t"><span className="ref">{s.n}</span> {s.title}</div>
              <div className="muted">{[s.author, s.path, s.page ? `${tr('page')} ${s.page}` : ''].filter(Boolean).join(' · ')}</div>
              <blockquote>{s.excerpt}</blockquote>
            </div>
          ))}
        </details>
      )}
      {a.verified && a.verified.source_quote && a.verified.source_quote !== a.summary && (
        <details className="src"><summary>{tr('excerpt')}</summary><div className="srcitem"><blockquote dir="auto" style={{ whiteSpace: 'pre-line' }}>{a.verified.source_quote}</blockquote></div></details>
      )}
      <div className="rowbtns noprint">
        {hasBody && <button className="btn sm ghost" onClick={listen} disabled={loadingAudio}>{loadingAudio ? '…' : playing ? tr('stop') : tr('listen')}</button>}
        {onSave && <button className="btn sm" onClick={onSave}>{tr('save')}</button>}
        {a.interaction_id && hasBody && <button className="btn sm ghost" onClick={report} disabled={reported}>{reported ? tr('reported') : tr('report')}</button>}
      </div>
    </article>
  );
}
