import { bad as badReq, clientIp, json, rateLimit } from '@/lib/http';
import { config, secretIsStrong } from '@/lib/config';
import { sb } from '@/lib/db';
import { chatJson, embed, probeModel, type Role } from '@/lib/models';
import { GLOSSARY, GLOSSARY_VERSION } from '@/lib/glossary/data';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Liveness and self-test. `?deep=1` also makes one tiny call to every model role, so a wrong key or model name shows up at once. */
export async function GET(req: Request) {
  const deep = new URL(req.url).searchParams.get('deep') === '1';
  if (deep && !rateLimit(`health:${clientIp(req)}`, 6)) return badReq('too many requests', 429);
  // ?probe=google:model-a,openai:model-b[&level=minimal] times candidate verifier models on a small entailment check.
  const sp = new URL(req.url).searchParams; const probe = sp.get('probe');
  if (probe) {
    if (!rateLimit(`probe:${clientIp(req)}`, 4)) return badReq('too many requests', 429);
    const specs = probe.split(',').slice(0, 4).map(s => s.split(':')).filter(([p, m]) => (p === 'google' || p === 'openai') && /^(gemini|gpt|o\d)[\w.\-]{2,40}$/.test(m ?? ''));
    const results = await Promise.all(specs.map(([p, m]) => probeModel(p as 'google' | 'openai', m, sp.get('level') ?? undefined).catch(e => ({ model: `${p}/${m}`, error: String((e as Error).message).slice(0, 240) }))));
    return json({ probe: results });
  }
  const out: any = {
    ok: true, time: new Date().toISOString(), mock: config.mock,
    roles: Object.fromEntries(Object.entries(config.roles).map(([k, v]) => [k, `${v.provider}/${v.model}`])),
    independent_verifier: config.roles.gen.provider !== config.roles.verify.provider,
    embed: config.embedModel, stt: config.sttModel, tts: config.ttsModel,
    keys: { openai: !!config.keys.openai, google: !!config.keys.google, anthropic: !!config.keys.anthropic },
    env: { supabase: !!config.supabaseUrl && !!config.supabaseServiceKey, app_secret: secretIsStrong(), specialist_passcode: !!config.specialistPasscode },
    glossary: { version: GLOSSARY_VERSION, terms: GLOSSARY.length }, thresholds: config.thresholds,
  };
  try {
    const db = sb(); const counts: Record<string, number | string> = {};
    await Promise.all(['sources', 'chunks', 'verified_answers', 'interactions', 'tickets'].map(async t => {
      try {
        const r = await db.from(t).select('id', { count: 'exact' }).limit(1);
        const bad = !!r.error || r.count === null || r.count === undefined;
        counts[t] = bad ? `error: ${r.error?.message || r.error?.code || 'table not reachable (schema not run, or privileges missing)'}` : (r.count as number);
        if (bad) out.ok = false;
      } catch (e) { counts[t] = `error: ${String((e as Error).message).slice(0, 160)}`; out.ok = false; }
    }));
    out.db = counts;
  } catch (e) { out.ok = false; out.db = { error: String((e as Error).message) }; }
  if (deep) {
    out.models = {};
    // All roles are pinged at once so the whole self-test stays short.
    await Promise.all((['fast', 'gen', 'verify'] as Role[]).map(async role => {
      try { const r = await chatJson(role, [{ role: 'system', content: 'Reply with the JSON object {"ok": true}.' }, { role: 'user', content: 'ping' }], { maxTokens: 50 }); out.models[role] = { ok: (r.data as any)?.ok === true, ms: r.usage.ms, used: `${r.usage.provider}/${r.usage.model}`, fallback: !!r.usage.fallback }; if (r.usage.fallback) out.verifier_fallback_in_use = true; }
      catch (e) { out.ok = false; out.models[role] = { ok: false, error: String((e as Error).message).slice(0, 300) }; }
    }));
    try { const v = await embed(['ping']); out.models.embed = { ok: v[0]?.length === config.embedDim, dim: v[0]?.length }; if (v[0]?.length !== config.embedDim) out.ok = false; }
    catch (e) { out.ok = false; out.models.embed = { ok: false, error: String((e as Error).message).slice(0, 300) }; }
  }
  // The report itself is always readable; monitors that want a failing status code pass ?strict=1.
  const strict = new URL(req.url).searchParams.get('strict') === '1';
  return json(out, out.ok || !strict ? 200 : 503);
}
