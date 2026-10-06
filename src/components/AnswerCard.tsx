'use client';
import { useId, useState } from 'react';
import type { Answer } from '@/lib/pipeline/types';
import { t } from '@/lib/i18n';
import { dirOf, sayParts, splitWords } from './client';
import { useSpeaker } from './useSpeaker';

const isUrl = (s: string | null | undefined) => !!s && /^https?:\/\//.test(s);
const Refs = ({ ns }: { ns: number[] }) => <>{ns.map(n => <span key={n} className="ref">{n}</span>)}</>;
/** A text as separate words, so that the word being read aloud can be marked. */
export const Words = ({ text }: { text: string }) => <>{splitWords(text).map((w, i) => (/^\s+$/.test(w) ? w : <span key={i} className="w">{w}</span>))}</>;
/** A speakable piece: `id` is the name the speech player looks for. */
const Say = ({ id, text }: { id: string; text: string }) => <span data-seg={id}><Words text={text} /></span>;

/** One answer, rendered in the asker's language. The trust tier is always the first thing shown. */
export default function AnswerCard({ a, question, onSave, sayKey, children }: { a: Answer; question?: string; onSave?: () => void; sayKey?: string; children?: React.ReactNode }) {
  const L = a.lang; const tr = (k: string) => t(L, k);
  const [reported, setReported] = useState(false);
  const own = useId(); const key = sayKey ?? own;
  const sp = useSpeaker();
  const reading = sp.active && sp.key === key;
  const hasBody = !!(a.summary || a.claims.length || a.cases.length);
  const parts = sayParts(a);
  const explained = !!a.explained && (a.claims.length > 0 || a.cases.length > 0);

  // The tap itself primes the audio element; phones refuse playback that starts after a network wait.
  function listen() {
    if (reading) { sp.stop(); return; }
    sp.prime(); sp.speak({ key, lang: L, parts });
  }
  async function report() {
    if (!a.interaction_id || reported) return;
    setReported(true);
    fetch('/api/report', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ interaction_id: a.interaction_id }) }).catch(() => {});
  }

  return (
    <article className="card" dir={dirOf(L)} lang={L} data-say={key} aria-labelledby={`${own}-tier`}>
      {question && <div className="q" dir="auto">{question}</div>}
      <span id={`${own}-tier`} className={`badge b-${a.tier}`}><i aria-hidden="true" />{tr(a.tier === 'verified' && /^(PC|DR)-/.test(a.verified?.code ?? '') ? 't_published' : `t_${a.tier}`)}</span>
      {a.notice && <p className="notice"><Say id="note" text={a.notice} /></p>}
      {a.tier === 'confirm' && a.suggest && <p className="sum suggest" dir="auto"><Say id="sug" text={a.suggest} /></p>}
      {a.tier === 'clarify' && a.clarify && <p className="sum"><Say id="clar" text={a.clarify} /></p>}
      {a.summary && <p className="sum" style={{ whiteSpace: 'pre-line' }}><Say id="main" text={a.summary} /></p>}
      {a.verified && (
        <p className="muted small">{tr('by')}: {a.verified.author} · {a.verified.source_title}{a.verified.source_locator && !isUrl(a.verified.source_locator) ? ` · ${a.verified.source_locator}` : ''}
          {isUrl(a.verified.source_locator) && <> · <a href={a.verified.source_locator!} target="_blank" rel="noopener noreferrer">{tr('open_source')}</a></>}</p>
      )}
      {/* A generated explanation never blends into the published text: it sits in its own amber block under it. */}
      <div className={explained ? 'explain' : undefined}>
        {explained && (<>
          <span className="badge b-grounded"><i aria-hidden="true" /><Say id="xh" text={tr('explain_h')} /></span>
          <p className="notice">{tr('explain_note')}</p>
        </>)}
        {a.claims.length > 0 && (
          <ul className="claims">{a.claims.map((c, i) => <li key={i}><Say id={`c${i}`} text={c.text} /><Refs ns={c.src} /></li>)}</ul>
        )}
        {a.cases.length > 0 && (<>
          <h3 className="sec">{tr('cases')}</h3>
          <div className="cases">{a.cases.map((c, i) => <div className="case" key={i} data-seg={`k${i}`}><b><Words text={c.condition} /></b><Words text={c.ruling} /><Refs ns={c.src} /></div>)}</div>
        </>)}
      </div>
      {a.action && <div className="action"><b>{tr('action')}: </b><Say id="act" text={a.action} /></div>}
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
              <blockquote dir="auto">{s.excerpt}</blockquote>
              {s.url && <a className="small" href={s.url} target="_blank" rel="noopener noreferrer">{tr('open_source')}</a>}
            </div>
          ))}
        </details>
      )}
      {a.verified && a.verified.source_quote && a.verified.source_quote !== a.summary && (
        <details className="src"><summary>{tr('excerpt')}</summary><div className="srcitem"><blockquote dir="auto" style={{ whiteSpace: 'pre-line' }}>{a.verified.source_quote}</blockquote></div></details>
      )}
      {(a.flags as any)?.verify?.model && a.tier === 'grounded' && (
        <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }} dir="ltr">verified by {(a.flags as any).verify.model} · {(a.flags as any).verify.checked} statements{a.timings?.total ? ` · ${(a.timings.total / 1000).toFixed(1)} s` : ''}</p>
      )}
      <div className="rowbtns noprint">
        {parts.length > 0 && <button className="btn sm ghost" onClick={listen} aria-pressed={reading}>{tr(reading ? 'v_stop' : sayKey ? 'v_replay' : 'listen')}</button>}
        {onSave && <button className="btn sm" onClick={onSave}>{tr('save')}</button>}
        {a.interaction_id && hasBody && <button className="btn sm ghost" onClick={report} disabled={reported}>{reported ? tr('reported') : tr('report')}</button>}
      </div>
    </article>
  );
}
