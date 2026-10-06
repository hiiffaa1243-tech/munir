'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Answer } from '@/lib/pipeline/types';
import { streamAsk, transcribeBlob } from './client';

export interface AskerState { busy: boolean; stage: string | null; answer: Answer | null; question: string; error: string | null }
export interface AskExtra { clarified?: boolean; lang?: string; voice?: boolean; confirmed?: boolean }
const IDLE: AskerState = { busy: false, stage: null, answer: null, question: '', error: null };

/** Drives one question from input to answer, for both the service point and the notebook. */
export function useAsker(opts: { lang: string; sessionId: string; kiosk?: string; headers?: () => Record<string, string>; onAnswer?: (a: Answer, q: string) => void; onLang?: (l: string) => void }) {
  const [s, setS] = useState<AskerState>(IDLE);
  const o = useRef(opts); o.current = opts;
  // Every request has a number: an answer that arrives after a newer question, a reset or a page change is dropped.
  const seq = useRef(0); const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const run = useCallback(async (text: string, extra: AskExtra = {}) => {
    const q = text.trim(); if (q.length < 2) return;
    const id = ++seq.current; const live = () => alive.current && seq.current === id;
    setS({ busy: true, stage: 'understand', answer: null, question: q, error: null });
    try {
      const a = await streamAsk({ text: q, lang: extra.lang ?? o.current.lang, session_id: o.current.sessionId, kiosk: o.current.kiosk, clarified: extra.clarified, voice: extra.voice || undefined, confirmed: extra.confirmed || undefined },
        o.current.headers?.() ?? {}, stage => { if (live()) setS(p => ({ ...p, stage })); });
      if (!live()) return;
      setS({ busy: false, stage: null, answer: a, question: q, error: null });
      o.current.onAnswer?.(a, q);
    } catch { if (live()) setS(p => ({ ...p, busy: false, stage: null, error: 'error' })); }
  }, []);

  const runAudio = useCallback(async (blob: Blob) => {
    const id = ++seq.current; const live = () => alive.current && seq.current === id;
    setS({ busy: true, stage: 'transcribe', answer: null, question: '', error: null });
    try {
      const r = await transcribeBlob(blob, { lang: o.current.lang });
      if (!live()) return;
      if (!r.text || r.text.trim().length < 2) { setS(p => ({ ...p, busy: false, stage: null, error: 'try_text' })); return; }
      if (r.lang) o.current.onLang?.(r.lang);
      await run(r.text, { lang: r.lang, voice: true });
    } catch { if (live()) setS(p => ({ ...p, busy: false, stage: null, error: 'error' })); }
  }, [run]);

  const reset = useCallback(() => { seq.current++; setS(IDLE); }, []);
  const fail = useCallback((k: string) => setS(p => ({ ...p, error: k })), []);
  return { ...s, run, runAudio, reset, fail };
}
