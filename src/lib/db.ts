// Data access. Server-only: uses the Supabase service role key, never exposed to the browser.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from '@/lib/config';
import { mockDb } from './db.mock';

let client: SupabaseClient | null = null;
export function sb(): SupabaseClient {
  if (config.mock) return mockDb() as unknown as SupabaseClient;
  if (!client) {
    if (!config.supabaseUrl || !config.supabaseServiceKey) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set');
    // Every database call has a hard time limit, so a slow or unreachable database cannot hang a request.
    const timed: typeof fetch = (input, init) => fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(12_000) });
    client = createClient(config.supabaseUrl, config.supabaseServiceKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: timed } });
  }
  return client;
}

export interface Chunk { id: string; source_id: string; path: string | null; page: number | null; text: string; score?: number; similarity?: number }
export interface VerifiedAnswer {
  id: string; code: string | null; q_canon: string; answer: string; answer_lang: string; answer_en: string;
  translations: Record<string, string>; source_title: string; source_locator: string | null; source_quote: string;
  author_name: string; similarity?: number;
}

const vec = (v: number[]) => `[${v.join(',')}]`;

function unwrap<T>(r: { data: T | null; error: { message: string } | null }, what: string): T {
  if (r.error) throw new Error(`db ${what}: ${r.error.message}`);
  return r.data as T;
}

export async function matchChunks(q: number[], k: number): Promise<Chunk[]> {
  return unwrap(await sb().rpc('match_chunks', { q: vec(q), k }), 'match_chunks') ?? [];
}
export async function searchChunks(q: string, k: number): Promise<Chunk[]> {
  return unwrap(await sb().rpc('search_chunks', { q, k }), 'search_chunks') ?? [];
}
export async function matchVerified(q: number[], k: number): Promise<VerifiedAnswer[]> {
  return unwrap(await sb().rpc('match_verified', { q: vec(q), k }), 'match_verified') ?? [];
}
export async function sourcesByIds(ids: string[]): Promise<Record<string, { id: string; title: string; author: string | null; url: string | null }>> {
  if (!ids.length) return {};
  const rows = unwrap(await sb().from('sources').select('id,title,author,url').in('id', ids), 'sources') as any[];
  return Object.fromEntries(rows.map(r => [r.id, r]));
}
export async function insert(table: string, row: Record<string, unknown>): Promise<any> {
  return unwrap(await sb().from(table).insert(row).select().single(), `insert ${table}`);
}
export async function audit(actor: string, action: string, target: string, detail: unknown = null) {
  try { await sb().from('audit_log').insert({ actor, action, target, detail }); } catch { /* audit must never break a request */ }
}
export { vec };
