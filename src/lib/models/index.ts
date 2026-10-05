// Model abstraction layer: one function per capability, provider chosen by role.
// Plain fetch, no SDKs, so swapping a provider is a config change.
import { config, type RoleConfig } from '@/lib/config';
import { mockJson } from './mock';

export interface ChatMsg { role: 'system' | 'user'; content: string }
export interface Usage { provider: string; model: string; ms: number; in?: number; out?: number }
export class ModelError extends Error { constructor(public provider: string, public status: number, msg: string) { super(msg); } }

const TIMEOUT_MS = 45_000;

async function post(url: string, headers: Record<string, string>, body: unknown, provider: string): Promise<any> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
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

const noTemperature = (m: string) => /^(o\d|gpt-5)/.test(m);

async function chatOpenAI(rc: RoleConfig, msgs: ChatMsg[], json: boolean, maxTokens: number) {
  const body: any = { model: rc.model, messages: msgs, max_completion_tokens: maxTokens };
  if (!noTemperature(rc.model)) body.temperature = 0;
  if (json) body.response_format = { type: 'json_object' };
  const d = await post('https://api.openai.com/v1/chat/completions', { authorization: `Bearer ${config.keys.openai}` }, body, 'openai');
  return { text: d.choices?.[0]?.message?.content ?? '', in: d.usage?.prompt_tokens, out: d.usage?.completion_tokens };
}

async function chatGoogle(rc: RoleConfig, msgs: ChatMsg[], json: boolean, maxTokens: number) {
  const sys = msgs.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
  const user = msgs.filter(m => m.role === 'user').map(m => m.content).join('\n\n');
  const body: any = {
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: { temperature: 0, maxOutputTokens: maxTokens, ...(json ? { responseMimeType: 'application/json' } : {}) },
  };
  if (sys) body.systemInstruction = { parts: [{ text: sys }] };
  const d = await post(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(rc.model)}:generateContent`, { 'x-goog-api-key': config.keys.google }, body, 'google');
  const text = (d.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? '').join('');
  return { text, in: d.usageMetadata?.promptTokenCount, out: d.usageMetadata?.candidatesTokenCount };
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

/** Call a role's model and return parsed JSON (one retry on malformed JSON or 5xx). */
export async function chatJson<T = any>(role: Role, msgs: ChatMsg[], opts: { maxTokens?: number } = {}): Promise<{ data: T; usage: Usage }> {
  const rc = config.roles[role];
  const t0 = Date.now();
  if (config.mock || rc.provider === 'mock') return { data: mockJson(role, msgs) as T, usage: { provider: 'mock', model: 'mock', ms: 1 } };
  const maxTokens = opts.maxTokens ?? 1500;
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = rc.provider === 'openai' ? await chatOpenAI(rc, msgs, true, maxTokens)
        : rc.provider === 'google' ? await chatGoogle(rc, msgs, true, maxTokens)
        : await chatAnthropic(rc, msgs, true, maxTokens);
      return { data: extractJson(r.text) as T, usage: { provider: rc.provider, model: rc.model, ms: Date.now() - t0, in: r.in, out: r.out } };
    } catch (e) {
      lastErr = e;
      if (e instanceof ModelError && e.status >= 400 && e.status < 500 && e.status !== 429) break;
    }
  }
  throw lastErr;
}

/** Plain text completion (used only by the closed-book evaluation baseline). */
export async function chatText(role: Role, msgs: ChatMsg[], maxTokens = 700): Promise<{ text: string; usage: Usage }> {
  const rc = config.roles[role];
  const t0 = Date.now();
  if (config.mock || rc.provider === 'mock') return { text: 'mock baseline answer', usage: { provider: 'mock', model: 'mock', ms: 1 } };
  const r = rc.provider === 'openai' ? await chatOpenAI(rc, msgs, false, maxTokens)
    : rc.provider === 'google' ? await chatGoogle(rc, msgs, false, maxTokens)
    : await chatAnthropic(rc, msgs, false, maxTokens);
  return { text: r.text, usage: { provider: rc.provider, model: rc.model, ms: Date.now() - t0, in: r.in, out: r.out } };
}

/** Embeddings (OpenAI). Deterministic pseudo-vectors in mock mode. */
export async function embed(texts: string[]): Promise<number[][]> {
  if (config.mock) return texts.map(t => { const v = new Array(config.embedDim).fill(0); for (let i = 0; i < t.length; i++) v[t.charCodeAt(i) % config.embedDim] += 1; const n = Math.hypot(...v) || 1; return v.map(x => x / n); });
  const d = await post('https://api.openai.com/v1/embeddings', { authorization: `Bearer ${config.keys.openai}` }, { model: config.embedModel, input: texts }, 'openai');
  return (d.data as any[]).sort((a, b) => a.index - b.index).map(x => x.embedding as number[]);
}

/** Speech to text. Returns the transcript and the detected language name when available. */
export async function transcribe(audio: Blob, filename: string): Promise<{ text: string; language?: string }> {
  if (config.mock) return { text: 'How many rounds of tawaf are there in umrah?', language: 'english' };
  const fd = new FormData();
  fd.append('file', audio, filename);
  fd.append('model', config.sttModel);
  if (config.sttModel === 'whisper-1') fd.append('response_format', 'verbose_json');
  const r = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { authorization: `Bearer ${config.keys.openai}` }, body: fd });
  const text = await r.text();
  if (!r.ok) throw new ModelError('openai', r.status, `stt ${r.status}: ${text.slice(0, 300)}`);
  const d = JSON.parse(text);
  return { text: d.text ?? '', language: d.language };
}

/** Text to speech. Returns MP3 bytes. */
export async function speak(text: string, lang: string): Promise<ArrayBuffer> {
  if (config.mock) return new ArrayBuffer(0);
  const body: any = { model: config.ttsModel, voice: config.ttsVoice, input: text.slice(0, 3500), response_format: 'mp3' };
  if (config.ttsModel.startsWith('gpt-4o')) body.instructions = `Speak clearly and calmly in ${lang}. Pronounce Islamic terms carefully.`;
  const r = await fetch('https://api.openai.com/v1/audio/speech', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${config.keys.openai}` }, body: JSON.stringify(body) });
  if (!r.ok) throw new ModelError('openai', r.status, `tts ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.arrayBuffer();
}
