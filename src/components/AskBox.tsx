'use client';
import { useEffect, useRef, useState } from 'react';
import { t } from '@/lib/i18n';

const MicIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </svg>
);

/** Text and voice input. Voice is recorded in the browser and sent once; nothing is stored on the device. */
export default function AskBox({ lang, value, onChange, onAsk, onAudio, onError, busy }: {
  lang: string; value: string; onChange: (v: string) => void; onAsk: () => void; onAudio: (b: Blob) => void; onError: (k: string) => void; busy: boolean;
}) {
  const [rec, setRec] = useState(false);
  const mr = useRef<MediaRecorder | null>(null); const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); try { mr.current?.stop(); } catch { /* not recording */ } }, []);

  const stop = () => { if (timer.current) clearTimeout(timer.current); try { mr.current?.stop(); } catch { /* already stopped */ } setRec(false); };
  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find(m => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m));
      const r = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined);
      const chunks: Blob[] = [];
      r.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      r.onstop = () => { stream.getTracks().forEach(tk => tk.stop()); const blob = new Blob(chunks, { type: r.mimeType || 'audio/webm' }); if (blob.size > 800) onAudio(blob); else onError('try_text'); };
      mr.current = r; r.start(); setRec(true);
      timer.current = setTimeout(stop, 30_000); // a question, not a lecture
    } catch { onError('mic_denied'); }
  }

  return (
    <div>
      <div className="askbox">
        <button type="button" className={`mic${rec ? ' on' : ''}`} onClick={rec ? stop : start} disabled={busy} aria-label={t(lang, rec ? 'listening' : 'speak')} aria-pressed={rec}><MicIcon /></button>
        <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={t(lang, rec ? 'listening' : 'placeholder')} maxLength={500} rows={2} dir="auto"
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!busy && value.trim().length > 1) onAsk(); } }} aria-label={t(lang, 'placeholder')} />
        <button type="button" className="btn" onClick={onAsk} disabled={busy || value.trim().length < 2}>{t(lang, 'ask')}</button>
      </div>
    </div>
  );
}
