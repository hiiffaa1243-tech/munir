import { json } from '@/lib/http';
import { config } from '@/lib/config';
import { sb } from '@/lib/db';
import { chatJson, embed, type Role } from '@/lib/models';
import { GLOSSARY, GLOSSARY_VERSION } from '@/lib/glossary/data';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Liveness and self-test. `?deep=1` also makes one tiny call to every model role, so a wrong key or model name shows up at once. */
export async function GET(req: Request) {
  const deep = new URL(req.url).searchParams.get('deep') === '1';
  const out: any = {
    ok: true, time: new Date().toISOString(), mock: config.mock,
    roles: Object.fromEntries(Object.entries(config.roles).map(([k, v]) => [k, `${v.provider}/${v.model}`])),
    independent_verifier: config.roles.gen.provider !== config.roles.verify.provider,
    embed: config.embedModel, stt: config.sttModel, tts: config.ttsModel,
    keys: { openai: !!config.keys.openai, google: !!config.keys.google, anthropic: !!config.keys.anthropic },
    env: { supabase: !!config.supabaseUrl && !!config.supabaseServiceKey, app_secret: config.appSecret !== 'dev-only-secret-change-me', specialist_passcode: !!config.specialistPasscode },
    glossary: { version: GLOSSARY_VERSION, terms: GLOSSARY.length }, thresholds: config.thresholds,
  };
  try {
    const db = sb(); const counts: Record<string, number | string> = {};
    for (const t of ['sources', 'chunks', 'verified_answers', 'interactions', 'tickets']) {
      const r = await db.from(t).select('id', { count: 'exact', head: true });
      counts[t] = r.error ? `error: ${r.error.message}` : (r.count ?? 0);
      if (r.error) out.ok = false;
    }
    out.db = counts;
  } catch (e) { out.ok = false; out.db = { error: String((e as Error).message) }; }
  if (deep) {
    out.models = {};
    for (const role of ['fast', 'gen', 'verify'] as Role[]) {
      try { const r = await chatJson(role, [{ role: 'system', content: 'Reply with the JSON object {"ok": true}.' }, { role: 'user', content: 'ping' }], { maxTokens: 50 }); out.models[role] = { ok: (r.data as any)?.ok === true, ms: r.usage.ms }; }
      catch (e) { out.ok = false; out.models[role] = { ok: false, error: String((e as Error).message).slice(0, 300) }; }
    }
    try { const v = await embed(['ping']); out.models.embed = { ok: v[0]?.length === config.embedDim, dim: v[0]?.length }; if (v[0]?.length !== config.embedDim) out.ok = false; }
    catch (e) { out.ok = false; out.models.embed = { ok: false, error: String((e as Error).message).slice(0, 300) }; }
  }
  return json(out, out.ok ? 200 : 503);
}
