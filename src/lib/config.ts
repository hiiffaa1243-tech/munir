// Central configuration. Every model is chosen by role from the environment, so a
// provider or model can be swapped without touching the pipeline (model-agnostic).
export type Provider = 'openai' | 'google' | 'anthropic' | 'mock';

export interface RoleConfig { provider: Provider; model: string }

const env = (k: string, d = '') => (process.env[k] ?? d).trim();
const num = (k: string, d: number) => { const v = Number(env(k)); return Number.isFinite(v) && env(k) !== '' ? v : d; };

// The dashboard shows the project URL with or without a path (…/rest/v1/); only the origin is wanted.
const originOf = (u: string) => { if (!u) return ''; try { return new URL(/^https?:\/\//.test(u) ? u : `https://${u}`).origin; } catch { return u; } };

export const config = {
  mock: env('MUNIR_MOCK') === '1',
  roles: {
    // fast: query understanding, equivalence check, constrained translation
    fast: { provider: env('FAST_PROVIDER', 'openai') as Provider, model: env('FAST_MODEL', 'gpt-4.1-mini') },
    // gen: constrained answer generation
    gen: { provider: env('GEN_PROVIDER', 'openai') as Provider, model: env('GEN_MODEL', 'gpt-4.1') },
    // verify: entailment check. MUST be a different provider than gen (uncorrelated errors).
    verify: { provider: env('VERIFY_PROVIDER', 'google') as Provider, model: env('VERIFY_MODEL', 'gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-3.8-flash') },
    // baseline: a general model answering closed-book, used only in evaluation
    baseline: { provider: env('BASELINE_PROVIDER', 'openai') as Provider, model: env('BASELINE_MODEL', 'gpt-4.1') },
  } satisfies Record<string, RoleConfig>,
  // Used only when the verifier's provider cannot be reached. Recorded on every answer it touches. Set VERIFY_FALLBACK=off to fail closed instead.
  verifyFallback: env('VERIFY_FALLBACK') === 'off' ? null : ({ provider: env('VERIFY_FALLBACK_PROVIDER', 'openai') as Provider, model: env('VERIFY_FALLBACK_MODEL', 'gpt-4.1-mini') } as RoleConfig),
  geminiThinking: env('GEMINI_THINKING', 'low'),   // thinking level sent to Gemini 3 models; 'default' sends none
  embedModel: env('EMBED_MODEL', 'text-embedding-3-small'),
  embedDim: 1536,
  sttModel: env('STT_MODEL', 'whisper-1'),
  ttsModel: env('TTS_MODEL', 'gpt-4o-mini-tts'),
  ttsVoice: env('TTS_VOICE', 'alloy'),
  keys: {
    openai: env('OPENAI_API_KEY'),
    google: env('GOOGLE_API_KEY'),
    anthropic: env('ANTHROPIC_API_KEY'),
  },
  supabaseUrl: originOf(env('SUPABASE_URL')),
  supabaseServiceKey: env('SUPABASE_SERVICE_ROLE_KEY'),
  appSecret: env('APP_SECRET', 'dev-only-secret-change-me'),
  specialistPasscode: env('SPECIALIST_PASSCODE'),
  publicUrl: env('NEXT_PUBLIC_APP_URL'),
  thresholds: {
    // Initial values. They are calibrated on the 30-question dev split only.
    vaSimMin: num('VA_SIM_MIN', 0.55),       // verified-answer candidate cosine floor
    retrieveSimMin: num('RETRIEVE_SIM_MIN', 0.28), // answerability gate on best chunk cosine
    topK: num('RETRIEVE_TOP_K', 8),
  },
  limits: { maxQuestionChars: 500, maxAudioBytes: 2_500_000, askPerMinute: 20 },
};

export const SUPPORTED_LANGS = ['ar', 'en', 'ur', 'id', 'fr'] as const;
export type Lang = (typeof SUPPORTED_LANGS)[number];
export const BETA_LANGS = ['tr', 'bn'] as const;
export const isLang = (x: string): x is Lang => (SUPPORTED_LANGS as readonly string[]).includes(x);
export const LANG_NAMES: Record<string, string> = {
  ar: 'Arabic', en: 'English', ur: 'Urdu', id: 'Indonesian', fr: 'French', tr: 'Turkish', bn: 'Bengali',
};
export const RTL_LANGS = new Set(['ar', 'ur']);

/** A real deployment must set its own long APP_SECRET; the development default signs nothing that matters. */
export const secretIsStrong = () => config.mock || (config.appSecret !== 'dev-only-secret-change-me' && config.appSecret.length >= 24);
