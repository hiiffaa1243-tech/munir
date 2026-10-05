'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { GLOSSARY, GLOSSARY_VERSION } from '@/lib/glossary/data';

type Tab = 'queue' | 'answers' | 'sources' | 'glossary' | 'eval';
interface Group { key: string; q_ar: string | null; q_en: string | null; sample: string; ticket_ids: string[]; langs: Record<string, number>; latest: string }
interface VA { id: string; code: string | null; q_canon: string; q_ar: string | null; answer: string; source_title: string; source_locator: string | null; author_name: string; status: string; created_at: string }
interface Src { id: string; title: string; author: string | null; publisher: string | null; pages: number | null; active: boolean; chunks: number }
interface EvalCase { id: string; split: string; tier: string | null }

const api = async (url: string, init?: RequestInit) => {
  const r = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } });
  const d = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, d };
};
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** The approved Sharia specialist's workspace: one-step answers, sources, terminology and evaluation. */
export default function Specialist() {
  const [auth, setAuth] = useState<'unknown' | 'no' | 'yes'>('unknown');
  const [pass, setPass] = useState(''); const [loginErr, setLoginErr] = useState('');
  const [tab, setTab] = useState<Tab>('queue');

  const check = useCallback(async () => { const r = await api('/api/specialist/queue'); setAuth(r.ok ? 'yes' : 'no'); return r; }, []);
  useEffect(() => { document.documentElement.lang = 'ar'; document.documentElement.dir = 'rtl'; check(); }, [check]);

  async function login() {
    setLoginErr('');
    const r = await api('/api/specialist/login', { method: 'POST', body: JSON.stringify({ passcode: pass }) });
    if (r.ok) { setPass(''); setAuth('yes'); } else setLoginErr(r.status === 429 ? 'محاولات كثيرة. انتظر عشر دقائق.' : 'رمز الدخول غير صحيح.');
  }
  async function logout() { await api('/api/specialist/login', { method: 'DELETE' }); setAuth('no'); }

  if (auth === 'unknown') return <main><div className="wrap"><div className="stage"><span className="spin" />جارٍ التحميل</div></div></main>;
  if (auth === 'no') return (
    <main><div className="wrap" style={{ maxWidth: 440 }}>
      <header className="top"><div className="brand"><b>منير</b><span>لوحة المتخصص الشرعي</span></div></header>
      <div className="card">
        <label className="f" htmlFor="p">رمز الدخول</label>
        <input id="p" className="in" type="password" value={pass} onChange={e => setPass(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') login(); }} autoComplete="current-password" />
        {loginErr && <div className="err" role="alert">{loginErr}</div>}
        <div className="rowbtns"><button className="btn" onClick={login} disabled={!pass}>دخول</button><a className="btn ghost" href="/">العودة</a></div>
      </div>
    </div></main>
  );

  const tabs: [Tab, string][] = [['queue', 'الأسئلة المحالة'], ['answers', 'الإجابات المعتمدة'], ['sources', 'المصادر'], ['glossary', 'معجم المصطلحات'], ['eval', 'التقييم']];
  return (
    <main><div className="wrap wide">
      <header className="top">
        <div className="brand"><b>منير</b><span>لوحة المتخصص الشرعي</span></div>
        <div className="rowbtns" style={{ marginTop: 0 }}><a className="btn sm ghost" href="/">نقطة الخدمة</a><a className="btn sm ghost" href="/insights">المؤشرات</a><button className="btn sm ghost" onClick={logout}>خروج</button></div>
      </header>
      <nav className="tabs">{tabs.map(([k, label]) => <button key={k} className="chip" aria-pressed={tab === k} onClick={() => setTab(k)}>{label}</button>)}</nav>
      {tab === 'queue' && <Queue />}
      {tab === 'answers' && <Answers />}
      {tab === 'sources' && <Sources />}
      {tab === 'glossary' && <Glossary />}
      {tab === 'eval' && <Evaluation />}
    </div></main>
  );
}

// ---------- referred questions and the one-step answer form ----------
function Queue() {
  const [groups, setGroups] = useState<Group[]>([]); const [total, setTotal] = useState(0);
  const [open, setOpen] = useState<Group | 'new' | null>(null);
  const load = useCallback(async () => { const r = await api('/api/specialist/queue'); if (r.ok) { setGroups(r.d.groups ?? []); setTotal(r.d.total ?? 0); } }, []);
  useEffect(() => { load(); }, [load]);
  return (
    <section>
      <p className="lead">كل سؤال لم يجد منير له سنداً كافياً في المصادر يصل إلى هنا. الأسئلة المتطابقة تُجمع، فإجابة واحدة تصل إلى كل من سأل، كلٌّ بلغته.</p>
      <div className="rowbtns"><span className="pill v">تذاكر مفتوحة: {total}</span><button className="btn sm ghost" onClick={load}>تحديث</button><button className="btn sm" onClick={() => setOpen('new')}>إضافة إجابة معتمدة جديدة</button></div>
      {open && <AnswerForm group={open === 'new' ? null : open} onClose={() => setOpen(null)} onDone={() => { setOpen(null); load(); }} />}
      {groups.length === 0 && <div className="card center muted">لا توجد أسئلة محالة الآن.</div>}
      {groups.map(g => (
        <div className="card" key={g.key}>
          <div style={{ fontWeight: 600 }}>{g.q_ar || g.q_en || g.sample}</div>
          <div className="muted small" dir="auto">النص الأصلي: {g.sample}</div>
          <div className="rowbtns">
            <span className="pill">عدد السائلين: {g.ticket_ids.length}</span>
            {Object.entries(g.langs).map(([l, n]) => <span className="pill" key={l}>{l} × {n}</span>)}
            <button className="btn sm" onClick={() => setOpen(g)}>أجب</button>
          </div>
        </div>
      ))}
    </section>
  );
}

function AnswerForm({ group, onClose, onDone }: { group: Group | null; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ question: group ? (group.q_ar || group.q_en || group.sample) : '', answer: '', source_title: '', source_locator: '', source_quote: '', author_name: '' });
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { try { const n = localStorage.getItem('munir_sp_name'); if (n) setF(p => ({ ...p, author_name: n })); } catch { /* ignore */ } }, []);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF(p => ({ ...p, [k]: e.target.value }));
  const ready = f.question.trim().length >= 5 && f.answer.trim().length >= 10 && f.source_title.trim().length >= 2 && f.source_quote.trim().length >= 10 && f.author_name.trim().length >= 2;
  async function submit() {
    setBusy(true); setMsg(null);
    try { localStorage.setItem('munir_sp_name', f.author_name); } catch { /* ignore */ }
    const r = await api('/api/specialist/answers', { method: 'POST', body: JSON.stringify({ ...f, ticket_ids: group?.ticket_ids.slice(0, 50) ?? [] }) });
    setBusy(false);
    if (!r.ok) { setMsg({ ok: false, text: r.d.error ?? 'تعذر الحفظ.' }); return; }
    if (r.d.published) { setMsg({ ok: true, text: `نُشرت الإجابة. وصلت إلى ${r.d.resolved_tickets} من السائلين، وستُستخدم لكل سؤال مطابق لاحقاً.` }); setTimeout(onDone, 1800); }
    else setMsg({ ok: false, text: `لم تُنشر: النص المصدري المرفق لا يسند الإجابة كما كُتبت (${r.d.verdict}). ${r.d.reason ?? ''} عدّل الإجابة أو أرفق نصاً أوضح ثم أعد الإرسال.` });
  }
  return (
    <div className="card" style={{ borderColor: 'var(--violet)' }}>
      <h2 className="pg" style={{ marginTop: 0 }}>إجابة معتمدة</h2>
      <p className="muted small">خطوة واحدة: تكتب الإجابة وترفق نصها من المصدر. يتحقق نموذج مستقل من أن النص يسند الإجابة، فإن سندها نُشرت فوراً، وإلا عادت إليك مع السبب.</p>
      <label className="f">السؤال</label><textarea className="in" rows={2} value={f.question} onChange={set('question')} dir="auto" />
      <label className="f">الإجابة</label><textarea className="in" rows={5} value={f.answer} onChange={set('answer')} dir="auto" />
      <div className="grid2">
        <div><label className="f">المصدر</label><input className="in" value={f.source_title} onChange={set('source_title')} placeholder="اسم الكتاب أو الفتوى" dir="auto" /></div>
        <div><label className="f">الموضع (اختياري)</label><input className="in" value={f.source_locator} onChange={set('source_locator')} placeholder="الجزء والصفحة أو رقم الفتوى" dir="auto" /></div>
      </div>
      <label className="f">النص المصدري الذي يسند الإجابة (إلزامي)</label><textarea className="in" rows={4} value={f.source_quote} onChange={set('source_quote')} dir="auto" />
      <label className="f">اسم المتخصص الشرعي</label><input className="in" value={f.author_name} onChange={set('author_name')} dir="auto" />
      {msg && <div className={msg.ok ? 'resolved' : 'err'} role="status">{msg.text}</div>}
      <div className="rowbtns"><button className="btn" onClick={submit} disabled={!ready || busy}>{busy ? 'جارٍ التحقق…' : 'تحقق وانشر'}</button><button className="btn ghost" onClick={onClose}>إلغاء</button></div>
    </div>
  );
}

// ---------- verified answers ----------
function Answers() {
  const [rows, setRows] = useState<VA[]>([]); const [q, setQ] = useState('');
  const load = useCallback(async () => { const r = await api('/api/specialist/answers'); if (r.ok) setRows(r.d.answers ?? []); }, []);
  useEffect(() => { load(); }, [load]);
  async function toggle(v: VA) { await api('/api/specialist/answers', { method: 'PATCH', body: JSON.stringify({ id: v.id, status: v.status === 'published' ? 'withdrawn' : 'published' }) }); load(); }
  const shown = rows.filter(r => !q || `${r.q_canon} ${r.q_ar ?? ''} ${r.code ?? ''}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <section>
      <p className="lead">ذاكرة الإجابات المعتمدة. سحب أي إجابة يوقف ظهورها بكل اللغات في اللحظة نفسها.</p>
      <input className="in" style={{ margin: '12px 0' }} placeholder="بحث في الأسئلة" value={q} onChange={e => setQ(e.target.value)} dir="auto" />
      <div className="tablewrap"><table className="t">
        <thead><tr><th>الرمز</th><th>السؤال</th><th>المصدر</th><th>الكاتب</th><th>الحالة</th><th /></tr></thead>
        <tbody>{shown.map(v => (
          <tr key={v.id}><td dir="ltr">{v.code ?? '—'}</td><td><div>{v.q_ar ?? ''}</div><div className="muted small" dir="ltr" style={{ textAlign: 'left' }}>{v.q_canon}</div></td>
            <td className="small">{v.source_title}{v.source_locator ? ` · ${v.source_locator}` : ''}</td><td className="small">{v.author_name}</td>
            <td>{v.status === 'published' ? <span className="pill g">منشورة</span> : <span className="pill b">مسحوبة</span>}</td>
            <td><button className="btn sm ghost" onClick={() => toggle(v)}>{v.status === 'published' ? 'سحب' : 'إعادة نشر'}</button></td></tr>
        ))}</tbody>
      </table></div>
      {rows.length === 0 && <div className="card center muted">لا توجد إجابات معتمدة بعد.</div>}
    </section>
  );
}

// ---------- sources and the source pack upload ----------
function Sources() {
  const [rows, setRows] = useState<Src[]>([]);
  const [prog, setProg] = useState<{ done: number; total: number; label: string } | null>(null);
  const [log, setLog] = useState<string>('');
  const stopFlag = useRef(false);
  const load = useCallback(async () => { const r = await api('/api/specialist/ingest'); if (r.ok) setRows(r.d.sources ?? []); }, []);
  useEffect(() => { load(); }, [load]);
  async function toggle(s: Src) { await api('/api/specialist/ingest', { method: 'PATCH', body: JSON.stringify({ id: s.id, active: !s.active }) }); load(); }

  async function upload(file: File) {
    stopFlag.current = false; setLog('');
    let pack: { sources?: any[]; chunks?: any[]; fatwas?: any[] };
    try { pack = JSON.parse(await file.text()); } catch { setLog('الملف ليس بصيغة JSON صحيحة.'); return; }
    const sources = pack.sources ?? []; const chunks = pack.chunks ?? []; const fatwas = pack.fatwas ?? [];
    const batches: { body: any; n: number }[] = [];
    if (sources.length) batches.push({ body: { sources }, n: sources.length });
    for (let i = 0; i < chunks.length; i += 32) batches.push({ body: { chunks: chunks.slice(i, i + 32) }, n: Math.min(32, chunks.length - i) });
    for (let i = 0; i < fatwas.length; i += 6) batches.push({ body: { fatwas: fatwas.slice(i, i + 6) }, n: Math.min(6, fatwas.length - i) });
    const total = sources.length + chunks.length + fatwas.length; let done = 0; let failed = 0;
    setProg({ done, total, label: 'بدء الرفع' });
    for (const b of batches) {
      if (stopFlag.current) break;
      let ok = false; let err = '';
      for (let attempt = 0; attempt < 4 && !ok; attempt++) {
        const r = await api('/api/specialist/ingest', { method: 'POST', body: JSON.stringify(b.body) }).catch(() => ({ ok: false, status: 0, d: { error: 'network' } }));
        ok = r.ok; err = r.d?.error ?? `HTTP ${r.status}`;
        if (!ok) await sleep(1500 * (attempt + 1));
      }
      if (!ok) { failed += b.n; setLog(p => `${p}\nتعذر رفع دفعة (${b.n}): ${err}`); }
      done += b.n; setProg({ done, total, label: b.body.sources ? 'المصادر' : b.body.chunks ? 'مقاطع الكتب' : 'الفتاوى المنشورة' });
    }
    setLog(p => `${p}\nاكتمل: ${total - failed} من ${total}.${failed ? ' أعد رفع الملف نفسه لإكمال الناقص، فالرفع لا يكرر الموجود.' : ''}`.trim());
    load();
  }

  return (
    <section>
      <p className="lead">المصادر المعتمدة التي يجيب منها منير. تعطيل مصدر يخرجه من البحث فوراً، وكل إجابة تذكر مصدرها وصفحته.</p>
      <div className="card">
        <label className="f" htmlFor="pack">رفع حزمة مصادر (ملف JSON يحوي المصادر ومقاطعها والفتاوى المنشورة)</label>
        <input id="pack" type="file" accept="application/json,.json" onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} disabled={!!prog && prog.done < prog.total} />
        {prog && <><div className="prog"><i style={{ width: `${prog.total ? Math.round(100 * prog.done / prog.total) : 0}%` }} /></div><div className="small muted">{prog.label}: {prog.done} / {prog.total}</div></>}
        {log && <div className="pre" style={{ marginTop: 8 }}>{log}</div>}
      </div>
      <div className="tablewrap" style={{ marginTop: 14 }}><table className="t">
        <thead><tr><th>المصدر</th><th>الجهة</th><th>الصفحات</th><th>المقاطع</th><th>الحالة</th><th /></tr></thead>
        <tbody>{rows.map(s => (
          <tr key={s.id}><td dir="auto"><b>{s.title}</b><div className="muted small">{s.author}</div></td><td className="small" dir="auto">{s.publisher}</td><td>{s.pages ?? '—'}</td><td>{s.chunks}</td>
            <td>{s.active ? <span className="pill g">مفعّل</span> : <span className="pill b">معطّل</span>}</td>
            <td><button className="btn sm ghost" onClick={() => toggle(s)}>{s.active ? 'تعطيل' : 'تفعيل'}</button></td></tr>
        ))}</tbody>
      </table></div>
      {rows.length === 0 && <div className="card center muted">لم تُرفع مصادر بعد.</div>}
    </section>
  );
}

// ---------- locked terminology ----------
function Glossary() {
  const [q, setQ] = useState('');
  const rows = GLOSSARY.filter(g => !q || `${g.en} ${g.ar} ${g.ur} ${g.id} ${g.fr}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <section>
      <p className="lead">المصطلحات الشرعية لا تمر على الترجمة الآلية الحرة: تُحجب قبل الترجمة ثم تُستعاد من هذا الجدول، ويُفحص الناتج آلياً. الإصدار <b dir="ltr">{GLOSSARY_VERSION}</b>، وعدد المصطلحات {GLOSSARY.length}.</p>
      <input className="in" style={{ margin: '12px 0' }} placeholder="بحث" value={q} onChange={e => setQ(e.target.value)} dir="auto" />
      <div className="tablewrap"><table className="t">
        <thead><tr><th>المعرّف</th><th>English</th><th>العربية</th><th>اردو</th><th>Indonesia</th><th>Français</th><th>صيغ ممنوعة</th></tr></thead>
        <tbody>{rows.map(g => (
          <tr key={g.tid}><td dir="ltr">{g.tid}</td><td dir="ltr">{g.en}</td><td>{g.ar}</td><td>{g.ur}</td><td dir="ltr">{g.id}</td><td dir="ltr">{g.fr}</td>
            <td className="small" dir="auto">{g.forbid ? Object.entries(g.forbid).map(([l, ws]) => `${l}: ${(ws as string[]).join('، ')}`).join(' | ') : '—'}</td></tr>
        ))}</tbody>
      </table></div>
    </section>
  );
}

// ---------- evaluation runner ----------
function Evaluation() {
  const [cases, setCases] = useState<EvalCase[]>([]);
  const [split, setSplit] = useState<'dev' | 'holdout' | 'all'>('dev');
  const [runs, setRuns] = useState(1); const [baseline, setBaseline] = useState(true); const [conc, setConc] = useState(2); const [onlyMissing, setOnlyMissing] = useState(true);
  const [prog, setProg] = useState<{ done: number; total: number; failed: number } | null>(null);
  const [running, setRunning] = useState(false); const stop = useRef(false);
  const load = useCallback(async () => { const r = await api('/api/eval/results'); if (r.ok) setCases((r.d.cases ?? []).map((c: any) => ({ id: c.id, split: c.split, tier: c.tier }))); }, []);
  useEffect(() => { load(); }, [load]);

  async function start() {
    stop.current = false; setRunning(true);
    const use = cases.filter(c => split === 'all' || c.split === split);
    const jobs: { case_id: string; run: number; baseline: boolean }[] = [];
    for (let run = 1; run <= runs; run++) for (const c of use) { if (onlyMissing && run === 1 && c.tier) continue; jobs.push({ case_id: c.id, run, baseline: baseline && run === 1 }); }
    let done = 0; let failed = 0; let next = 0; setProg({ done, total: jobs.length, failed });
    const worker = async () => {
      while (!stop.current) {
        const j = jobs[next++]; if (!j) return;
        let ok = false;
        for (let attempt = 0; attempt < 3 && !ok && !stop.current; attempt++) {
          const r = await api('/api/eval/run', { method: 'POST', body: JSON.stringify(j) }).catch(() => ({ ok: false, status: 0, d: {} }));
          ok = r.ok; if (!ok) await sleep(4000 * (attempt + 1));
        }
        if (!ok) failed++; done++; setProg({ done, total: jobs.length, failed });
      }
    };
    await Promise.all(Array.from({ length: conc }, worker));
    setRunning(false); load();
  }
  const answered = cases.filter(c => c.tier).length;
  return (
    <section>
      <p className="lead">مجموعة اختبار من 150 سؤالاً اصطناعياً بخمس لغات: 30 للضبط و120 محجوبة للقياس. يُشغَّل عليها منير ونموذج عام بلا مصادر، ويحكم بينهما نموذج مستقل. النتائج تُنشر كما هي في صفحة <a href="/eval">نتائج التقييم</a>.</p>
      <div className="card">
        <div className="grid2">
          <div><label className="f">المجموعة</label><select className="in" value={split} onChange={e => setSplit(e.target.value as any)}><option value="dev">الضبط (30)</option><option value="holdout">المحجوبة (120)</option><option value="all">الكل (150)</option></select></div>
          <div><label className="f">عدد التشغيلات (3 لقياس الثبات)</label><select className="in" value={runs} onChange={e => setRuns(Number(e.target.value))}><option value={1}>1</option><option value={3}>3</option></select></div>
          <div><label className="f">التشغيل المتوازي</label><select className="in" value={conc} onChange={e => setConc(Number(e.target.value))}><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option><option value={4}>4</option></select></div>
        </div>
        <label style={{ display: 'block', marginTop: 12 }}><input type="checkbox" checked={baseline} onChange={e => setBaseline(e.target.checked)} /> تشغيل النموذج العام للمقارنة</label>
        <label style={{ display: 'block', marginTop: 6 }}><input type="checkbox" checked={onlyMissing} onChange={e => setOnlyMissing(e.target.checked)} /> تخطي الأسئلة التي لها نتيجة (في التشغيل الأول)</label>
        <div className="rowbtns">
          <button className="btn" onClick={start} disabled={running || !cases.length}>{running ? 'جارٍ التشغيل…' : 'ابدأ التقييم'}</button>
          {running && <button className="btn ghost" onClick={() => { stop.current = true; }}>إيقاف</button>}
          <a className="btn ghost" href="/eval">عرض النتائج</a>
        </div>
        {prog && <><div className="prog"><i style={{ width: `${prog.total ? Math.round(100 * prog.done / prog.total) : 100}%` }} /></div><div className="small muted">{prog.done} / {prog.total}{prog.failed ? ` · تعذر: ${prog.failed}` : ''}</div></>}
        <p className="small muted" style={{ marginTop: 8 }}>أسئلة لها نتيجة حتى الآن: {answered} من {cases.length}. أبقِ الصفحة مفتوحة حتى يكتمل التشغيل.</p>
      </div>
    </section>
  );
}
