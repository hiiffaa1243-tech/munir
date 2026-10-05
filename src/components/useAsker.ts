'use client';
import { useCallback, useRef, useState } from 'react';
import type { Answer } from '@/lib/pipeline/types';
import { streamAsk, transcribeBlob } from './client';

export interface AskerState { busy: boolean; stage: string | null; answer: Answer | null; question: string; error: string | null }

/** Drives one question from input to answer, for both the service point and the notebook. */
export function useAsker(opts: { lang: string; sessionId: string; kiosk?: string; headers?: () => Record<string, string>; onAnswer?: (a: Answer, q: string) => void; onLang?: (l: string) => void }) {
  const [s, setS] = useState<AskerState>({ busy: false, stage: null, answer: null, question: '', error: null });
  const o = useRef(opts); o.current = opts;

  const run = useCallback(async (text: string, extra: { clarified?: boolean; lang?: string } = {}) => {
    const q = text.trim(); if (q.length < 2) return;
    setS({ busy: true, stage: 'understand', answer: null, question: q, error: null });
    try {
      const a = await streamAsk({ text: q, lang: extra.lang ?? o.current.lang, session_id: o.current.sessionId, kiosk: o.current.kiosk, clarified: extra.clarified },
        o.current.headers?.() ?? {}, stage => setS(p => ({ ...p, stage })));
      setS({ busy: false, stage: null, answer: a, question: q, error: null });
      o.current.onAnswer?.(a, q);
    } catch { setS(p => ({ ...p, busy: false, stage: null, error: 'error' })); }
  }, []);

  const runAudio = useCallback(async (blob: Blob) => {
    setS({ busy: true, stage: 'transcribe', answer: null, question: '', error: null });
    try {
      const r = await transcribeBlob(blob);
      if (!r.text || r.text.trim().length < 2) { setS(p => ({ ...p, busy: false, stage: null, error: 'try_text' })); return; }
      if (r.lang) o.current.onLang?.(r.lang);
      await run(r.text, { lang: r.lang });
    } catch { setS(p => ({ ...p, busy: false, stage: null, error: 'error' })); }
  }, [run]);

  const reset = useCallback(() => setS({ busy: false, stage: null, answer: null, question: '', error: null }), []);
  const fail = useCallback((k: string) => setS(p => ({ ...p, error: k })), []);
  return { ...s, run, runAudio, reset, fail };
}
