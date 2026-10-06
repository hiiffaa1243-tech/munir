'use client';
// Speech output for the whole page: one audio element, one answer read at a time, the word being read marked on screen.
import { useSyncExternalStore } from 'react';
import { splitWords, wordWeight, type SayPart } from './client';

export interface SpeakJob {
  key: string;                          // matches the `data-say` attribute of the element that shows the text
  lang: string;
  parts: SayPart[];
  onEnd?: (completed: boolean) => void; // false when the reading was stopped or replaced
}
interface SpeakState { active: boolean; key: string | null }
const IDLE: SpeakState = { active: false, key: null };
let state: SpeakState = IDLE;
const subs = new Set<() => void>();
const setState = (s: SpeakState) => { state = s; subs.forEach(f => f()); };
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

const SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
let el: HTMLAudioElement | null = null;
let primed = false;
let tones: AudioContext | null = null;

/** Call inside a tap or a key press. Phones refuse playback that starts after a network wait unless the element was started by the user once. */
export function prime() {
  if (typeof window === 'undefined') return;
  try {
    if (!el) { el = new Audio(); el.preload = 'auto'; }
    if (!primed && !state.active) { const a = el; a.src = SILENT; a.play().then(() => { primed = true; }).catch(() => {}); }
    if (!tones) { const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext; if (AC) tones = new AC(); }
    if (tones && tones.state === 'suspended') tones.resume().catch(() => {});
  } catch { /* sound is an enhancement */ }
}

/** A short soft tone, so that a visitor who cannot see the screen knows when Munir starts and stops listening. */
export function earcon(kind: 'up' | 'down') {
  const c = tones; if (!c || c.state !== 'running') return;
  try {
    const o = c.createOscillator(); const g = c.createGain(); const t0 = c.currentTime;
    const [f0, f1] = kind === 'up' ? [520, 780] : [660, 440];
    o.type = 'sine'; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(f1, t0 + 0.14);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.07, t0 + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
    o.connect(g); g.connect(c.destination); o.start(t0); o.stop(t0 + 0.2);
  } catch { /* ignore */ }
}

// ---- the running job ----
interface Word { el: HTMLElement | null; seg: HTMLElement | null; w: number }
let seq = 0;
let job: SpeakJob | null = null;
let abort: AbortController | null = null;
let urls: string[] = [];
let endGroup: ((ok: boolean) => void) | null = null;
let marked: HTMLElement[] = [];
let raf = 0;

const END_MARK: Record<string, string> = { zh: '。', ur: '۔', hi: '।' };
const closed = (s: string, lang: string) => (/[.!?:\u061F\u06D4\u0964\u3002\uFF01\uFF1F]$/.test(s) ? s : s + (END_MARK[lang] ?? '.'));
/** Parts are read in a few requests, not one each: the first alone so that speech starts quickly, the rest packed together. */
function groups(parts: SayPart[]): SayPart[][] {
  const out: SayPart[][] = []; let cur: SayPart[] = []; let n = 0;
  parts.forEach((p, i) => {
    if (cur.length && ((i === 1 && cur[0].text.length > 80) || n + p.text.length > 520)) { out.push(cur); cur = []; n = 0; }
    cur.push(p); n += p.text.length;
  });
  if (cur.length) out.push(cur);
  return out;
}
async function fetchAudio(text: string, lang: string, signal: AbortSignal): Promise<string> {
  const r = await fetch('/api/tts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: text.slice(0, 3800), lang }), signal });
  if (!r.ok) throw new Error(`tts ${r.status}`);
  const b = await r.blob();
  if (b.size < 64) throw new Error('tts empty');
  const u = URL.createObjectURL(b); urls.push(u);
  return u;
}

/** The word spans of a group, in reading order. A part that is not on screen still takes its share of the time. */
function collect(key: string, parts: SayPart[]): { words: Word[]; total: number } {
  const esc = (s: string) => (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(s) : s.replace(/["\\]/g, ''));
  const root = document.querySelector(`[data-say="${esc(key)}"]`);
  const words: Word[] = [];
  for (const p of parts) {
    const seg = (root?.querySelector(`[data-seg="${esc(p.id)}"]`) ?? null) as HTMLElement | null;
    const spans = seg ? (Array.from(seg.querySelectorAll('.w')) as HTMLElement[]) : [];
    if (spans.length) spans.forEach(s => words.push({ el: s, seg, w: wordWeight(s.textContent ?? '') }));
    else splitWords(p.text).forEach(s => { const w = wordWeight(s); if (w) words.push({ el: null, seg: null, w }); });
    if (words.length) words[words.length - 1].w += 7; // the breath between two parts
  }
  return { words, total: words.reduce((s, w) => s + w.w, 0) };
}
function clearMarks() { marked.forEach(m => m.classList.remove('now', 'said')); marked = []; }

function playGroup(url: string, key: string, parts: SayPart[]): Promise<boolean> {
  const a = el ?? (el = new Audio());
  return new Promise<boolean>(resolve => {
    let done = false; let idx = -1; let lastSeg: HTMLElement | null = null;
    let words: Word[] = []; let total = 0;
    const calm = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const mark = (to: number) => {
      for (let i = Math.max(0, idx); i < to && i < words.length; i++) { const w = words[i].el; if (w) { w.classList.remove('now'); w.classList.add('said'); marked.push(w); } }
      idx = to;
      const cur = words[to]; if (!cur) return;
      if (cur.el) { cur.el.classList.add('now'); marked.push(cur.el); }
      if (cur.seg && cur.seg !== lastSeg) { lastSeg = cur.seg; try { cur.seg.scrollIntoView({ block: 'nearest', behavior: calm ? 'auto' : 'smooth' }); } catch { /* old browser */ } }
    };
    const tick = () => {
      if (done) return;
      // A stream without a known length is paced by a typical reading speed.
      const d = Number.isFinite(a.duration) && a.duration > 0 ? a.duration : total * 0.065;
      const at = Math.min(1, a.currentTime / d) * total;
      let acc = 0; let i = 0;
      while (i < words.length - 1 && acc + words[i].w < at) acc += words[i++].w;
      if (i !== idx) mark(i);
      raf = requestAnimationFrame(tick);
    };
    const guard = setTimeout(() => finish(true), 150_000);
    function finish(ok: boolean) {
      if (done) return; done = true;
      clearTimeout(guard); cancelAnimationFrame(raf);
      a.onended = null; a.onerror = null;
      if (ok) mark(words.length);
      if (endGroup === finish) endGroup = null;
      resolve(ok);
    }
    endGroup = finish;
    a.onended = () => finish(true); a.onerror = () => finish(false);
    try {
      a.src = url;
      a.play().then(() => {
        if (done) return;
        ({ words, total } = collect(key, parts));
        if (words.length) raf = requestAnimationFrame(tick);
      }).catch(() => finish(false)); // playback not allowed yet: the text stays on screen
    } catch { finish(false); }
  });
}

function cleanup() {
  cancelAnimationFrame(raf); clearMarks();
  urls.forEach(u => URL.revokeObjectURL(u)); urls = [];
  abort = null; job = null;
}

/** Reads the parts aloud in order. A new call replaces the reading in progress. */
export function speak(next: SpeakJob) {
  stopSpeech();
  if (typeof window === 'undefined' || !next.parts.length) { next.onEnd?.(true); return; }
  const id = ++seq; const ac = new AbortController();
  job = next; abort = ac;
  setState({ active: true, key: next.key });
  const gs = groups(next.parts);
  const cache: (Promise<string> | undefined)[] = [];
  const get = (i: number) => (cache[i] ??= fetchAudio(gs[i].map(p => closed(p.text, next.lang)).join('\n'), next.lang, ac.signal));
  (async () => {
    for (let i = 0; i < gs.length; i++) {
      let url: string;
      try { url = await get(i); } catch { break; } // no voice: the answer is shown silently
      if (seq !== id) return;
      if (i + 1 < gs.length) get(i + 1).catch(() => {});
      const ok = await playGroup(url, next.key, gs[i]);
      if (seq !== id) return;
      if (!ok) break;
    }
    if (seq !== id) return;
    cleanup(); setState(IDLE);
    next.onEnd?.(true);
  })().catch(() => { if (seq === id) { cleanup(); setState(IDLE); next.onEnd?.(true); } });
}

export function stopSpeech() {
  const j = job; if (!j) return;
  seq++;
  try { abort?.abort(); } catch { /* ignore */ }
  try { el?.pause(); } catch { /* ignore */ }
  endGroup?.(false);
  cleanup(); setState(IDLE);
  j.onEnd?.(false);
}

/** Live value, for code that must not wait for the next render. */
export const speechActive = () => state.active;

export function useSpeaker() {
  const s = useSyncExternalStore(subscribe, () => state, () => IDLE);
  return { active: s.active, key: s.key, speak, stop: stopSpeech, prime };
}
