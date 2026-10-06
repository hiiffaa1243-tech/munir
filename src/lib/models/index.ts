// Model abstraction layer: one function per capability, provider chosen by role.
// Plain fetch, no SDKs, so swapping a provider is a config change.
import { config, type RoleConfig } from '@/lib/config';
import { mockJson } from './mock';

export interface ChatMsg { role: 'system' | 'user'; content: string }
export interface Usage { provider: string; model: string; ms: number; in?: number; out?: number; fallback?: boolean }
export class ModelError extends Error { constructor(public provider: string, public status: number, msg: string) { super(msg); } }

// A single model call may not outlive the request: the function limit is 60 s and a question makes several calls.
const TIMEOUT_MS = 22_000;

// The verifier's provider gets a shorter leash: when it stalls, the next candidate (or the declared fallback) takes
// over while the visitor is still waiting, instead of after the whole budget is gone.
const GOOGLE_TIMEOUT_MS = 12_000;
async function post(url: string, headers: Record<string, string>, body: unknown, provider: string, timeoutMs = TIMEOUT_MS): Promise<any> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: ctl.signal });
    const text = await r.text();
    if (!r.ok) throw new ModelError(provider, r.status, `${provider} ${r.status}: ${text.slice(0, 400)}`);
    return JSON.parse(text);
  } finally { clearTimeout(t); }
}

function extractJson(raw: string): unknown {
  const s = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(s); } catch { /* fall through */ }
  const a = s.indexOf('{'); const b = s.lastIndexOf('}');
  if (a >= 0 && b > a) return JSON.parse(s.slice(a, b + 1));
  throw new Error('model did not return JSON');
}

// Newer OpenAI families reject a custom temperature. Known ones are skipped up front; unknown ones are learned from the 400.
const noTemp = new Set<string>();
const noSeed = new Set<string>();   // models that reject a seed are learned from the 400, like the temperature
const noTemperature = (m: string) => /^(o\d|gpt-5|gpt-6)/.test(m) || noTemp.has(m);

async function chatOpenAI(rc: RoleConfig, msgs: ChatMsg[], json: boolean, maxTokens: number): Promise<{ text: string; in?: number; out?: number }> {
  const reasoning = /^(o\d|gpt-5|gpt-6)/.test(rc.model);
  const body: any = { model: rc.model, messages: msgs, max_completion_tokens: reasoning ? maxTokens + 3000 : maxTokens };
  if (!noTemperature(rc.model)) body.temperature = 0;
  // Temperature 0 still leaves some run-to-run variation; a fixed seed removes most of what is left (best-effort on the provider's side).
  if (!noSeed.has(rc.model)) body.seed = config.chatSeed;
  if (json) body.response_format = { type: 'json_object' };
  try {
    const d = await post('https://api.openai.com/v1/chat/completions', { authorization: `Bearer ${config.keys.openai}` }, body, 'openai');
    return { text: d.choices?.[0]?.message?.content ?? '', in: d.usage?.prompt_tokens, out: d.usage?.completion_tokens };
  } catch (e) {
    if (e instanceof ModelError && e.status === 400 && /temperature/i.test(e.message) && !noTemp.has(rc.model)) { noTemp.add(rc.model); return chatOpenAI(rc, msgs, json, maxTokens); }
    if (e instanceof ModelError && e.status === 400 && /seed/i.test(e.message) && !noSeed.has(rc.model)) { noSeed.add(rc.model); return chatOpenAI(rc, msgs, json, maxTokens); }
    throw e;
  }
}

const noThinkCfg = new Set<string>();
async function chatGoogle(rc: RoleConfig, msgs: ChatMsg[], json: boolean, maxTokens: number, level: string = config.geminiThinking): Promise<{ text: string; in?: number; out?: number; thoughts?: number }> {
  const sys = msgs.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
  const user = msgs.filter(m => m.role === 'user').map(m => m.content).join('\n\n');
  // Gemini 3 reasons before answering: it keeps its default temperature and is asked for light reasoning,
  // with headroom in the output budget so the JSON is never cut short.
  const g3 = /^gemini-3/.test(rc.model); const think = g3 && level !== 'default' && !noThinkCfg.has(rc.model);
  const body: any = {
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: { ...(g3 ? {} : { temperature: 0 }), maxOutputTokens: maxTokens + 6000, ...(json ? { responseMimeType: 'application/json' } : {}), ...(think ? { thinkingConfig: { thinkingLevel: level } } : {}) },
  };
  if (sys) body.systemInstruction = { parts: [{ text: sys }] };
  let d: any;
  try {
    d = await post(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(rc.model)}:generateContent`, { 'x-goog-api-key': config.keys.google }, body, 'google', GOOGLE_TIMEOUT_MS);
  } catch (e) {
    if (think && e instanceof ModelError && e.status === 400 && /thinking/i.test(e.message)) { noThinkCfg.add(rc.model); return chatGoogle(rc, msgs, json, maxTokens, level); }
    throw e;
  }
  const text = (d.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? '').join('');
  return { text, in: d.usageMetadata?.promptTokenCount, out: d.usageMetadata?.candidatesTokenCount, thoughts: d.usageMetadata?.thoughtsTokenCount };
}

async function chatAnthropic(rc: RoleConfig, msgs: ChatMsg[], json: boolean, maxTokens: number) {
  const sys = msgs.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
  const user = msgs.filter(m => m.role === 'user').map(m => m.content).join('\n\n');
  const body: any = { model: rc.model, max_tokens: maxTokens, temperature: 0, system: sys + (json ? '\n\nReply with a single JSON object and nothing else.' : ''), messages: [{ role: 'user', content: user }] };
  const d = await post('https://api.anthropic.com/v1/messages', { 'x-api-key': config.keys.anthropic, 'anthropic-version': '2023-06-01' }, body, 'anthropic');
  const text = (d.content ?? []).map((p: any) => p.text ?? '').join('');
  return { text, in: d.usage?.input_tokens, out: d.usage?.output_tokens };
}

export type Role = keyof typeof config.roles;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const call = (rc: RoleConfig, msgs: ChatMsg[], json: boolean, maxTokens: number) =>
  rc.provider === 'openai' ? chatOpenAI(rc, msgs, json, maxTokens)
  : rc.provider === 'google' ? chatGoogle(rc, msgs, json, maxTokens)
  : chatAnthropic(rc, msgs, json, maxTokens);

// A role may list several candidate models ("a,b,c"). The first one the provider accepts is remembered.
const chosen = new Map<string, string>();
const isModelMissing = (e: unknown) => e instanceof ModelError && (e.status === 404 || (e.status === 400 && /model/i.test(e.message) && /not (found|exist|supported)|does not exist|unknown|invalid model|no access|permission/i.test(e.message)) || (e.status === 403 && /model/i.test(e.message)));
const isTransient = (e: unknown) => !(e instanceof ModelError) || e.status === 429 || e.status >= 500;

/** One role call with candidate-model selection and backoff on transient errors. */
async function callRole(role: Role, rcBase: RoleConfig, msgs: ChatMsg[], json: boolean, maxTokens: number, parse: boolean) {
  const key = `${rcBase.provider}:${rcBase.model}`;
  const all = rcBase.model.split(',').map(m => m.trim()).filter(Boolean);
  const first = chosen.get(key);
  const models = first ? [first, ...all.filter(m => m !== first)] : all;
  let lastErr: unknown;
  for (const model of models) {
    const rc = { provider: rcBase.provider, model };
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await call(rc, msgs, json, maxTokens);
        const data = parse ? extractJson(r.text) : null;
        chosen.set(key, model);
        return { r, data, rc };
      } catch (e) {
        lastErr = e;
        if (isModelMissing(e)) { chosen.delete(key); break; }   // try the next candidate
        if (e instanceof ModelError && !isTransient(e)) throw e;
        // A provider that timed out is stalling: its other candidate models would stall too, so the role fails over at once
        // (for the verifier, to its declared fallback) instead of spending the visitor's time on a second wait.
        if ((e as Error)?.name === 'AbortError') throw new ModelError(rc.provider, 504, `${rc.provider} timed out`);
        // An overloaded or rate-limited model: with other candidates listed, move on at once instead of waiting on it.
        if (models.length > 1) { chosen.delete(key); break; }
        // A single-model role waits out a rate limit instead of failing the question.
        if (attempt < 2) await sleep(e instanceof ModelError && e.status === 429 ? (attempt ? 5000 : 2000) : 800);
      }
    }
  }
  throw lastErr;
}

/**
 * Call a role's model and return parsed JSON.
 * The verifier has a declared fallback: if the independent provider is unreachable, a second model checks instead
 * and the usage record says so (`fallback: true`), so the loss of provider independence is visible, never silent.
 */
export async function chatJson<T = any>(role: Role, msgs: ChatMsg[], opts: { maxTokens?: number } = {}): Promise<{ data: T; usage: Usage }> {
  const rc = config.roles[role];
  const t0 = Date.now();
  if (config.mock || rc.provider === 'mock') return { data: mockJson(role, msgs) as T, usage: { provider: 'mock', model: 'mock', ms: 1 } };
  const maxTokens = opts.maxTokens ?? 1500;
  try {
    const { r, data, rc: used } = await callRole(role, rc, msgs, true, maxTokens, true);
    return { data: data as T, usage: { provider: used.provider, model: used.model, ms: Date.now() - t0, in: r.in, out: r.out } };
  } catch (e) {
    const fb = config.verifyFallback;
    if (role !== 'verify' || !fb) throw e;
    console.error('verifier unavailable, using fallback', String((e as Error).message).slice(0, 200));
    const { r, data, rc: used } = await callRole(role, fb, msgs, true, maxTokens, true);
    return { data: data as T, usage: { provider: used.provider, model: used.model, ms: Date.now() - t0, in: r.in, out: r.out, fallback: true } };
  }
}

/** Plain text completion (used only by the closed-book evaluation baseline). */
export async function chatText(role: Role, msgs: ChatMsg[], maxTokens = 700): Promise<{ text: string; usage: Usage }> {
  const rc = config.roles[role];
  const t0 = Date.now();
  if (config.mock || rc.provider === 'mock') return { text: 'mock baseline answer', usage: { provider: 'mock', model: 'mock', ms: 1 } };
  const { r, rc: used } = await callRole(role, rc, msgs, false, maxTokens, false);
  return { text: r.text, usage: { provider: used.provider, model: used.model, ms: Date.now() - t0, in: r.in, out: r.out } };
}

/** Embeddings (OpenAI). Deterministic pseudo-vectors in mock mode. */
export async function embed(texts: string[]): Promise<number[][]> {
  if (config.mock) return texts.map(t => { const v = new Array(config.embedDim).fill(0); for (let i = 0; i < t.length; i++) v[t.charCodeAt(i) % config.embedDim] += 1; const n = Math.hypot(...v) || 1; return v.map(x => x / n); });
  const go = () => post('https://api.openai.com/v1/embeddings', { authorization: `Bearer ${config.keys.openai}` }, { model: config.embedModel, input: texts }, 'openai');
  let d: any;
  try { d = await go(); } catch (e) { if (e instanceof ModelError && !isTransient(e)) throw e; await sleep(600); d = await go(); }
  return (d.data as any[]).sort((a, b) => a.index - b.index).map(x => x.embedding as number[]);
}

// Domain vocabulary given to the recogniser as context, so that rites and place names are heard as what they are
// («الطائف», not «الطائر»). It biases the choice of words; it does not force a language. The screen's language only
// decides which spelling of the vocabulary comes first.
const STT_AR = 'أسئلة عن الحج والعمرة: الإحرام، الميقات، ذو الحليفة، الجحفة، قرن المنازل، السيل الكبير، يلملم، ذات عرق، الطائف، التنعيم، الطواف، السعي، الصفا والمروة، منى، مزدلفة، عرفة، رمي الجمرات، الهدي، الفدية، الحلق والتقصير، التحلل، طواف الإفاضة، طواف الوداع، الحجر الأسود، الركن اليماني، المحرم.';
const STT_LATIN = "Questions about Hajj and Umrah: Ihram, Miqat, Dhul-Hulayfah, Juhfah, Qarn al-Manazil, Yalamlam, Dhat Irq, Taif, Tan'im, Tawaf, Sa'i, Safa and Marwah, Mina, Muzdalifah, Arafah, Jamarat, Hady, Fidyah, Tahallul, Tawaf al-Ifadah, Tawaf al-Wada, the Black Stone, Mahram.";
export const sttPrompt = (lang?: string) => (!lang || lang === 'ar' ? `${STT_AR} ${STT_LATIN}` : `${STT_LATIN} ${STT_AR}`);

async function sttCall(audio: Blob, filename: string, model: string, timeoutMs: number, lang?: string): Promise<{ text: string; language?: string }> {
  const fd = new FormData();
  fd.append('file', audio, filename);
  fd.append('model', model);
  fd.append('prompt', sttPrompt(lang));
  // Only whisper-1 reports the detected language (verbose_json); the newer models return the text alone.
  if (model === 'whisper-1') fd.append('response_format', 'verbose_json');
  const r = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { authorization: `Bearer ${config.keys.openai}` }, body: fd, signal: AbortSignal.timeout(timeoutMs) });
  const text = await r.text();
  if (!r.ok) throw new ModelError('openai', r.status, `stt ${r.status}: ${text.slice(0, 300)}`);
  const d = JSON.parse(text);
  return { text: d.text ?? '', language: d.language };
}

/**
 * Speech to text. Returns the transcript and the detected language name when available.
 * A final transcript uses the accurate model, an interim caption (`partial`) the small fast one; if either fails,
 * whisper-1 answers instead. The language is never forced: pilgrims speak many languages at the same device.
 */
export async function transcribe(audio: Blob, filename: string, opts: { partial?: boolean; lang?: string } = {}): Promise<{ text: string; language?: string }> {
  if (config.mock) return { text: 'How many rounds of tawaf are there in umrah?', language: 'english' };
  const timeoutMs = opts.partial ? 12_000 : 30_000; const t0 = Date.now();
  const model = opts.partial ? config.sttPartialModel : config.sttModel;
  try { return await sttCall(audio, filename, model, timeoutMs, opts.lang); }
  catch (e) {
    const left = timeoutMs - (Date.now() - t0);
    if (model === 'whisper-1' || left < 2_000) throw e;
    return sttCall(audio, filename, 'whisper-1', left, opts.lang);
  }
}

/** A short silent WAV (16-bit mono PCM), so the player can be exercised without a speech provider. */
export function silentWav(seconds = 1.5, rate = 8000): ArrayBuffer {
  const n = Math.round(seconds * rate); const buf = new ArrayBuffer(44 + n * 2); const v = new DataView(buf);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 2, true);
  return buf;
}
/** The media type of what `speak` returns. */
export const speechType = () => (config.mock ? 'audio/wav' : 'audio/mpeg');

// How the answer is read aloud. Arabic is read as a Saudi scholar would read it to a pilgrim: this is a manner of
// delivery (accent, pace, register), not an imitation of any particular person.
const VOICE_AR = `Voice: a mature Saudi religious scholar giving guidance to pilgrims. Calm, dignified, warm, unhurried.
Accent: Saudi Arabian pronunciation of formal Arabic, as heard in lessons at the Two Holy Mosques: clear articulation of every letter (ق ج ث ذ ظ ض pronounced fully), no Egyptian, Levantine or Maghrebi colouring.
Delivery: measured pace with a short pause after each ruling; reverent when Allah or the Prophet is mentioned; reassuring, never theatrical.
Read the text exactly as written: do not add, drop or change any word.`;
const voiceNote = (lang: string) => `Voice: a calm, dignified, knowledgeable guide speaking to a pilgrim in ${lang}. Measured pace, clear articulation, reassuring. Pronounce Arabic Islamic terms as an Arabic speaker would. Read the text exactly as written.`;

/** Text to speech. Returns MP3 bytes (a short silent WAV in mock mode). `code` is the language code of the text. */
export async function speak(text: string, lang: string, code?: string): Promise<ArrayBuffer> {
  if (config.mock) return silentWav();
  const arabic = code === 'ar';
  const body: any = { model: config.ttsModel, voice: arabic ? config.ttsVoiceAr : config.ttsVoice, input: text.slice(0, 3500), response_format: 'mp3' };
  if (config.ttsModel.startsWith('gpt-4o')) body.instructions = arabic ? VOICE_AR : voiceNote(lang);
  const r = await fetch('https://api.openai.com/v1/audio/speech', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${config.keys.openai}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(40_000) });
  if (!r.ok) throw new ModelError('openai', r.status, `tts ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.arrayBuffer();
}

/** Diagnostic: time one model on a small, realistic entailment check. Used to choose the verifier. */
export async function probeModel(provider: 'openai' | 'google', model: string, level?: string) {
  const msgs: ChatMsg[] = [
    { role: 'system', content: 'You are an independent checker. For each statement decide whether the passage SUPPORTS it. Return JSON: {"results": [{"id": number, "verdict": "supported" | "contradicted" | "insufficient"}]}' },
    { role: 'user', content: 'PASSAGE: Tawaf consists of seven rounds around the Kaaba, starting at the Black Stone. Whoever doubts the number of rounds builds on the lower number.\nSTATEMENTS: [{"id":0,"statement":"Tawaf is seven rounds."},{"id":1,"statement":"Tawaf must be performed barefoot."},{"id":2,"statement":"If unsure between six and seven rounds, count it as six."}]' },
  ];
  const t0 = Date.now(); const rc = { provider, model } as RoleConfig;
  const r = provider === 'google' ? await chatGoogle(rc, msgs, true, 300, level ?? config.geminiThinking) : await chatOpenAI(rc, msgs, true, 300);
  let verdicts: unknown = null; try { verdicts = ((extractJson(r.text) as any).results ?? []).map((x: any) => x.verdict); } catch { /* reported as raw */ }
  return { model: `${provider}/${model}`, ms: Date.now() - t0, verdicts, expected: ['supported', 'insufficient', 'supported'], tokens: { in: r.in, out: r.out, thoughts: (r as any).thoughts }, level: provider === 'google' ? (level ?? config.geminiThinking) : undefined, thinking_cfg_rejected: noThinkCfg.has(model) };
}
