// Tiny in-memory stand-in for Supabase, used only with MUNIR_MOCK=1 for local smoke tests.
type Row = Record<string, any>;
const g = globalThis as any;
const store: Record<string, Row[]> = g.__munirMock ?? (g.__munirMock = {
  sources: [{ id: 's_demo', title: 'Demo Guide to Umrah', author: 'Demo', url: null, active: true }],
  chunks: [{ id: 'c_demo_1', source_id: 's_demo', path: 'Tawaf', page: 12, text: 'Tawaf consists of seven rounds around the Kaaba, starting at the Black Stone.' }],
  verified_answers: [], notebooks: [], claims: [], interactions: [], tickets: [], reports: [], audit_log: [], eval_results: [],
});
const uid = () => (globalThis.crypto as Crypto).randomUUID();

class Q {
  private filters: ((r: Row) => boolean)[] = [];
  private op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
  private payload: any; private one = false; private lim = 1000; private ord: [string, boolean] | null = null;
  constructor(private table: string) { store[table] ??= []; }
  select(_c?: string, _o?: any) { if (this.op === 'select') this.op = 'select'; return this; }
  insert(p: any) { this.op = 'insert'; this.payload = p; return this; }
  upsert(p: any) { this.op = 'upsert'; this.payload = p; return this; }
  update(p: any) { this.op = 'update'; this.payload = p; return this; }
  delete() { this.op = 'delete'; return this; }
  eq(k: string, v: any) { this.filters.push(r => r[k] === v); return this; }
  neq(k: string, v: any) { this.filters.push(r => r[k] !== v); return this; }
  in(k: string, v: any[]) { this.filters.push(r => v.includes(r[k])); return this; }
  is(k: string, v: any) { this.filters.push(r => (r[k] ?? null) === v); return this; }
  gte(k: string, v: any) { this.filters.push(r => r[k] >= v); return this; }
  order(k: string, o?: { ascending?: boolean }) { this.ord = [k, o?.ascending ?? true]; return this; }
  limit(n: number) { this.lim = n; return this; }
  single() { this.one = true; return this; }
  maybeSingle() { this.one = true; return this; }
  private run() {
    const t = store[this.table];
    const match = (r: Row) => this.filters.every(f => f(r));
    let rows: Row[] = [];
    if (this.op === 'insert' || this.op === 'upsert') {
      const arr = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((p: Row) => ({ id: uid(), created_at: new Date().toISOString(), ...p }));
      t.push(...arr); rows = arr;
    } else if (this.op === 'update') { rows = t.filter(match); rows.forEach(r => Object.assign(r, this.payload)); }
    else if (this.op === 'delete') { rows = t.filter(match); store[this.table] = t.filter(r => !match(r)); }
    else rows = t.filter(match);
    if (this.ord) { const [k, asc] = this.ord; rows = rows.slice().sort((a, b) => (a[k] > b[k] ? 1 : -1) * (asc ? 1 : -1)); }
    rows = rows.slice(0, this.lim);
    return { data: this.one ? (rows[0] ?? null) : rows, error: null, count: rows.length };
  }
  then(res: (v: any) => any, rej?: (e: any) => any) { try { return Promise.resolve(this.run()).then(res, rej); } catch (e) { return Promise.reject(e).then(res, rej); } }
}

export function mockDb() {
  return {
    from: (table: string) => new Q(table),
    rpc: async (fn: string, _args: any) => {
      if (fn === 'match_chunks') return { data: store.chunks.map(c => ({ ...c, similarity: 0.8 })), error: null };
      if (fn === 'search_chunks') return { data: store.chunks.map(c => ({ ...c, rank: 0.5 })), error: null };
      if (fn === 'match_verified') return { data: store.verified_answers.filter(v => v.status !== 'withdrawn').map(v => ({ ...v, similarity: 0.9 })), error: null };
      return { data: [], error: null };
    },
  };
}
