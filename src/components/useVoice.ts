'use client';
// The listening side of the service point: one open microphone, voice activity detection that decides when the
// visitor has finished, a live caption while they speak, and the final transcription when they fall silent.
import { useCallback, useEffect, useRef, useState } from 'react';
import { transcribeBlob } from './client';
import { earcon } from './useSpeaker';

export type VoicePhase = 'off' | 'starting' | 'listening' | 'hearing' | 'transcribing' | 'paused';
export interface VoiceOpts {
  lang: string;
  muted?: boolean;                                  // no tones
  onFinal: (text: string, lang?: string) => void;   // a finished utterance, transcribed
  onEmpty?: () => void;                             // one press, nothing usable heard
  onError?: (key: string) => void;                  // 'mic_denied'
}

const MIMES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
const TICK = 40;            // ms between level readings
const ONSET = 150;          // ms above the threshold before it counts as speech
const SILENCE = 1300;       // ms of quiet that ends the utterance
const MIN_SPEECH = 350;     // shorter than this is a cough or a knock, not a question
const MAX_UTTERANCE = 30_000;
const FRESH_EVERY = 6_000;  // while nobody speaks the recording restarts, so what is sent never opens with a long silence
const PARTIAL_GAP = 1_800;
const ONE_SHOT_WAIT = 12_000;

interface Engine {
  alive: boolean; phase: VoicePhase; oneShot: boolean; tok: number; utt: number;
  stream: MediaStream | null; ctx: AudioContext | null; an: AnalyserNode | null; buf: Float32Array<ArrayBuffer> | null; timer: ReturnType<typeof setInterval> | null;
  rec: MediaRecorder | null; chunks: Blob[]; recAt: number;
  noise: number; above: number; since: number; speechAt: number; lastVoice: number; voiced: number; last: number;
  partialAc: AbortController | null; partialAt: number;
}
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export function useVoice(opts: VoiceOpts) {
  const [phase, setPhase] = useState<VoicePhase>('off');
  const [caption, setCaption] = useState('');
  const level = useRef(0); // 0..1, read by the animation without re-rendering
  const o = useRef(opts); o.current = opts;
  const eng = useRef<Engine>({
    alive: true, phase: 'off', oneShot: false, tok: 0, utt: 0, stream: null, ctx: null, an: null, buf: null, timer: null,
    rec: null, chunks: [], recAt: 0, noise: 0.004, above: 0, since: 0, speechAt: 0, lastVoice: 0, voiced: 0, last: 0, partialAc: null, partialAt: 0,
  });

  // All engine functions live in one ref-stable object so that the timer and the callbacks always see the same state.
  const api = useRef<{ start: (oneShot: boolean) => Promise<boolean>; stop: () => void; pause: () => void; resume: () => void } | null>(null);
  if (!api.current) {
    const e = eng.current;
    const setP = (p: VoicePhase) => { e.phase = p; if (e.alive) setPhase(p); };
    const cap = (s: string) => { if (e.alive) setCaption(s); };
    const tone = (k: 'up' | 'down') => { if (!o.current.muted) earcon(k); };

    const startRec = () => {
      const s = e.stream; if (!s) return;
      try {
        const mime = MIMES.find(m => MediaRecorder.isTypeSupported(m));
        const r = new MediaRecorder(s, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined);
        const chunks: Blob[] = [];
        r.ondataavailable = ev => { if (ev.data.size) chunks.push(ev.data); };
        e.rec = r; e.chunks = chunks; e.recAt = now();
        r.start(250);
      } catch { e.rec = null; e.chunks = []; }
    };
    /** Stops the current recording and returns what it holds. The chunks start at the recorder's own start, so the file is valid. */
    const stopRec = (): Promise<Blob | null> => {
      const r = e.rec; const chunks = e.chunks; e.rec = null; e.chunks = [];
      if (!r) return Promise.resolve(null);
      return new Promise(resolve => {
        const done = () => resolve(chunks.length ? new Blob(chunks, { type: r.mimeType || 'audio/webm' }) : null);
        if (r.state === 'inactive') { done(); return; }
        r.onstop = done;
        try { r.stop(); } catch { done(); }
        setTimeout(done, 1500); // a recorder that never reports its stop must not hang the visitor
      });
    };
    const dropPartial = () => { try { e.partialAc?.abort(); } catch { /* ignore */ } e.partialAc = null; };
    const release = () => {
      if (e.timer) clearInterval(e.timer); e.timer = null;
      try { e.stream?.getTracks().forEach(tk => tk.stop()); } catch { /* ignore */ }
      try { e.ctx?.close().catch(() => {}); } catch { /* ignore */ }
      e.stream = null; e.ctx = null; e.an = null; e.buf = null; level.current = 0;
    };
    const listen = (quiet = false) => {
      const t = now();
      e.above = 0; e.voiced = 0; e.since = t; e.last = t;
      startRec(); setP('listening');
      if (!quiet) tone('up');
    };

    const partial = (t: number) => {
      if (e.partialAc || t - e.partialAt < PARTIAL_GAP || !e.chunks.length || !e.rec) return;
      const utt = e.utt; const ac = new AbortController(); e.partialAc = ac;
      transcribeBlob(new Blob(e.chunks.slice(), { type: e.rec.mimeType || 'audio/webm' }), { partial: true, lang: o.current.lang, signal: ac.signal })
        // A caption that comes back after the utterance has ended is dropped: it must never replace the final text.
        .then(r => { const s = (r.text ?? '').trim(); if (s && e.utt === utt && e.phase === 'hearing') cap(s); })
        .catch(() => { /* the caption is a courtesy */ })
        .finally(() => { if (e.partialAc === ac) { e.partialAc = null; e.partialAt = now(); } });
    };

    const finalize = async () => {
      const utt = e.utt; const one = e.oneShot;
      const mine = () => e.alive && e.utt === utt && e.phase === 'transcribing';
      dropPartial(); level.current = 0; setP('transcribing'); tone('down');
      const blob = await stopRec();
      if (!mine()) return;
      if (one) release(); // one question was asked for: the microphone is given back at once
      let text = ''; let lang: string | undefined;
      try {
        if (blob && blob.size > 800) { const r = await transcribeBlob(blob, { lang: o.current.lang }); text = (r.text ?? '').trim(); lang = r.lang; }
      } catch { /* treated as nothing heard */ }
      if (!mine()) return;
      if (text.length < 2) {
        cap('');
        if (one) { setP('off'); o.current.onEmpty?.(); } else listen(true); // hands-free: a noise is not worth a message
        return;
      }
      cap(text); setP(one ? 'off' : 'paused');
      o.current.onFinal(text, lang);
    };

    const tick = () => {
      const an = e.an; const buf = e.buf; if (!an || !buf) return;
      const t = now(); const dt = Math.min(200, t - e.last); e.last = t;
      if (e.phase !== 'listening' && e.phase !== 'hearing') { level.current = 0; return; }
      an.getFloatTimeDomainData(buf);
      let sum = 0; for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      // The threshold follows the room: three times the quiet level, never below a fixed floor.
      const thr = Math.min(0.12, Math.max(0.014, e.noise * 3));
      level.current = Math.max(0, Math.min(1, (rms - thr * 0.4) / 0.14));
      if (t - e.since < 300) { e.noise += (rms - e.noise) * 0.2; return; } // the tone and the tap are not speech
      if (e.phase === 'listening') {
        // Falls quickly with the room, rises slowly: a steady hum becomes background, a voice does not.
        e.noise += (rms - e.noise) * (rms < e.noise ? 0.2 : 0.004);
        if (rms > thr) {
          if (!e.above) e.above = t;
          else if (t - e.above >= ONSET) {
            e.utt++; e.speechAt = e.above; e.lastVoice = t; e.voiced = ONSET; e.partialAt = t - PARTIAL_GAP + 700;
            cap(''); setP('hearing');
          }
          return;
        }
        e.above = 0;
        if (e.oneShot && t - e.since > ONE_SHOT_WAIT) { e.utt++; void stopRec(); release(); setP('off'); tone('down'); o.current.onEmpty?.(); return; }
        if (t - e.recAt > FRESH_EVERY) { void stopRec(); startRec(); }
        return;
      }
      if (rms > thr * 0.7) { e.lastVoice = t; e.voiced += dt; }
      if (t - e.speechAt > MAX_UTTERANCE) { void finalize(); return; }
      if (t - e.lastVoice > SILENCE) {
        if (e.voiced >= MIN_SPEECH) { void finalize(); return; }
        e.utt++; dropPartial(); cap(''); void stopRec(); listen(true);
        return;
      }
      partial(t);
    };

    api.current = {
      async start(oneShot) {
        if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) { o.current.onError?.('mic_denied'); return false; }
        if (e.phase === 'starting' || e.phase === 'transcribing') return false;
        e.oneShot = oneShot;
        if (e.phase === 'listening' || e.phase === 'hearing') return true;
        if (e.stream && e.stream.getAudioTracks().some(tk => tk.readyState === 'live')) { listen(); return true; }
        release();
        const tok = ++e.tok; setP('starting');
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
          if (!e.alive || e.tok !== tok) { stream.getTracks().forEach(tk => tk.stop()); return false; }
          const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
          const ctx = new AC();
          if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
          if (!e.alive || e.tok !== tok) { stream.getTracks().forEach(tk => tk.stop()); ctx.close().catch(() => {}); return false; }
          const an = ctx.createAnalyser(); an.fftSize = 1024; an.smoothingTimeConstant = 0;
          ctx.createMediaStreamSource(stream).connect(an);
          e.stream = stream; e.ctx = ctx; e.an = an; e.buf = new Float32Array(an.fftSize); e.noise = 0.004;
          e.timer = setInterval(tick, TICK);
          listen();
          return true;
        } catch {
          if (e.alive && e.tok === tok) { release(); o.current.onError?.('mic_denied'); setP('off'); }
          return false;
        }
      },
      stop() {
        const was = e.phase;
        e.utt++; e.tok++; dropPartial(); void stopRec(); release();
        if (was === 'listening' || was === 'hearing') tone('down');
        cap(''); if (was !== 'off') setP('off');
      },
      pause() {
        if (e.phase !== 'listening' && e.phase !== 'hearing' && e.phase !== 'transcribing') return;
        e.utt++; dropPartial(); void stopRec(); level.current = 0; cap('');
        if (e.stream) setP('paused'); else setP('off');
      },
      resume() {
        if (e.phase !== 'paused') return;
        // The audio clock may have been suspended by the browser while Munir was speaking.
        if (e.ctx && e.ctx.state === 'suspended') e.ctx.resume().catch(() => {});
        if (e.stream && e.stream.getAudioTracks().some(tk => tk.readyState === 'live')) listen(); else { release(); setP('off'); }
      },
    };
  }

  useEffect(() => {
    const e = eng.current; e.alive = true;
    return () => {
      e.alive = false; e.utt++; e.tok++;
      try { e.partialAc?.abort(); } catch { /* ignore */ }
      try { if (e.rec && e.rec.state !== 'inactive') e.rec.stop(); } catch { /* ignore */ }
      e.rec = null; e.chunks = [];
      if (e.timer) clearInterval(e.timer); e.timer = null;
      try { e.stream?.getTracks().forEach(tk => tk.stop()); } catch { /* ignore */ }
      try { e.ctx?.close().catch(() => {}); } catch { /* ignore */ }
      e.stream = null; e.ctx = null; e.an = null; e.buf = null; e.phase = 'off';
    };
  }, []);

  const start = useCallback((oneShot: boolean) => api.current!.start(oneShot), []);
  const stop = useCallback(() => api.current!.stop(), []);
  const pause = useCallback(() => api.current!.pause(), []);
  const resume = useCallback(() => api.current!.resume(), []);
  /** Wakes the audio clock inside a tap, for browsers that keep it asleep until the first gesture. */
  const wake = useCallback(() => { const c = eng.current.ctx; if (c && c.state === 'suspended') c.resume().catch(() => {}); }, []);
  const clearCaption = useCallback(() => setCaption(''), []);
  return { phase, caption, level, start, stop, pause, resume, wake, clearCaption };
}
