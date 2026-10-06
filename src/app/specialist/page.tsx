'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { GLOSSARY, GLOSSARY_VERSION } from '@/lib/glossary/data';
import './specialist.css';

type Tab = 'queue' | 'answers' | 'sources' | 'glossary' | 'eval';
interface Group { key: string; q_ar: string | null; q_en: string | null; sample: string; ticket_ids: string[]; langs: Record<string, number>; latest: string }
interface VA { id: string; code: string | null; q_canon: string; q_ar: string | null; answer: string; source_title: string; source_locator: string | null; author_name: string; status: string; created_at: string }
interface Src { id: string; title: string; author: string | null; publisher: string | null; pages: number | null; active: boolean; chunks: number }
interface EvalCase { id: string; split: string; tier: string | null }
interface Stats { open: number; groups: number; langs: Record<string, number>; published: number | null }

// What POST /api/specialist/assist returns: evidence that code matched to its passage, a draft, and what the sources leave open.
type Kind = 'quran' | 'hadith' | 'scholar' | 'text';
interface Evidence { n: number; kind: Kind; quote: string; note_ar: string; title: string; author: string | null; page: number | null; url: string | null; chunk_id: string }
interface Draft { ruling_ar: string; cases_ar: { condition: string; ruling: string }[]; spoken_ar: string; disagreement: boolean }
interface Related { code: string | null; question: string; answer: string; locator: string; similarity: number }
interface Assist { draft: Draft | null; evidence: Evidence[]; gaps: string[]; related: Related[]; unmatched: number; passages: number; model: string | null }

const NAME_KEY = 'munir_sp_name';
const QUOTE_MAX = 4000;   // the publish route's limit on the supporting text
const LANG_AR: Record<string, string> = { ar: 'العربية', en: 'الإنجليزية', ur: 'الأردية', id: 'الإندونيسية', fr: 'الفرنسية', hi: 'الهندية', zh: 'الصينية', tr: 'التركية', bn: 'البنغالية' };
const KIND_AR: Record<Kind, string> = { quran: 'آية', hadith: 'حديث', scholar: 'قول أهل العلم', text: 'نص' };
const langName = (l: string) => LANG_AR[l] ?? l;

const api = async (url: string, init?: RequestInit) => {
  const r = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } });
  const d = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, d };
};
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const when = (iso: string) => { try { return new Date(iso).toLocaleString('ar-u-nu-latn', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };

/** The approved Sharia specialist's workspace: referred questions, assisted drafting, sources, terminology and evaluation. */
export default function Specialist() {
  const [auth, setAuth] = useState<'unknown' | 'no' | 'yes'>('unknown');
  const [pass, setPass] = useState(''); const [loginErr, setLoginErr] = useState('');
  const [tab, setTab] = useState<Tab>('queue');
  const [stats, setStats] = useState<Stats | null>(null);
  const [name, setName] = useState('');

  const check = useCallback(async () => { const r = await api('/api/specialist/queue'); setAuth(r.ok ? 'yes' : 'no'); return r; }, []);
  useEffect(() => {
    document.documentElement.lang = 'ar'; document.documentElement.dir = 'rtl'; check();
    try { setName(localStorage.getItem(NAME_KEY) ?? ''); } catch { /* ignore */ }
  }, [check]);
  // The specialist's name is kept on this device, so each answer carries it without retyping.
  const saveName = useCallback((n: string) => { setName(n); try { localStorage.setItem(NAME_KEY, n); } catch { /* ignore */ } }, []);
  const refresh = useCallback(async () => {
    try {
      const [q, a] = await Promise.all([api('/api/specialist/queue'), api('/api/specialist/answers')]);
      if (!q.ok) return;
      const groups: Group[] = q.d.groups ?? []; const langs: Record<string, number> = {};
      for (const g of groups) for (const [l, n] of Object.entries(g.langs)) langs[l] = (langs[l] ?? 0) + n;
      setStats({ open: q.d.total ?? 0, groups: groups.length, langs, published: a.ok ? ((a.d.answers ?? []) as VA[]).filter(v => v.status === 'published').length : null });
    } catch { /* the figures are a convenience */ }
  }, []);
  useEffect(() => { if (auth === 'yes') refresh(); }, [auth, refresh]);

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
  const askLangs = stats ? Object.keys(stats.langs).sort((a, b) => stats.langs[b] - stats.langs[a]) : [];
  return (
    <main><div className="wrap wide">
      <header className="top">
        <div className="brand"><b>منير</b><h1 className="sp-title">لوحة المتخصص الشرعي</h1></div>
        <div className="rowbtns" style={{ marginTop: 0 }}>
          <span className="sp-author">المجيب: <b dir="auto">{name.trim() || 'لم يُسجَّل الاسم بعد'}</b></span>
          <a className="btn sm ghost" href="/">نقطة الخدمة</a><a className="btn sm ghost" href="/insights">المؤشرات</a><button className="btn sm ghost" onClick={logout}>خروج</button>
        </div>
      </header>
      <p className="sp-rule">المتخصص هو صاحب الجواب. المساعد يجمع الأدلة من المصادر المعتمدة ويقترح الصياغة، ولا يُنشر شيء إلا بمراجعته وتحقق مستقل.</p>
      <div className="sp-stats">
        <div className="sp-stat"><div className="k">أسئلة محالة مفتوحة</div><div className="v">{stats ? stats.open : '—'}</div><div className="s">{stats ? (stats.open ? `عدد المسائل بعد جمع المتطابق: ${stats.groups}` : 'لا أسئلة تنتظر الآن') : ''}</div></div>
        <div className="sp-stat"><div className="k">إجابات منشورة</div><div className="v">{stats?.published ?? '—'}</div><div className="s">تصل إلى كل سؤال مطابق، بكل اللغات</div></div>
        <div className="sp-stat"><div className="k">لغات السائلين</div><div className="v">{stats ? askLangs.length : '—'}</div><div className="s">{askLangs.length ? askLangs.map(langName).join('، ') : ''}</div></div>
      </div>
      <nav className="tabs">{tabs.map(([k, label]) => <button key={k} className="chip" aria-pressed={tab === k} onClick={() => setTab(k)}>{label}</button>)}</nav>
      {tab === 'queue' && <Queue name={name} onName={saveName} onChanged={refresh} />}
      {tab === 'answers' && <Answers onChanged={refresh} />}
      {tab === 'sources' && <Sources />}
      {tab === 'glossary' && <Glossary />}
      {tab === 'eval' && <Evaluation />}
    </div></main>
  );
}

// ---------- referred questions, the one-step answer form and the drafting assistant ----------
function Queue({ name, onName, onChanged }: { name: string; onName: (n: string) => void; onChanged: () => void }) {
  const [groups, setGroups] = useState<Group[]>([]); const [total, setTotal] = useState(0);
  // `id` changes on every opening, so the form starts clean each time.
  const [open, setOpen] = useState<{ g: Group | null; assist: boolean; id: number } | null>(null);
  const load = useCallback(async () => { const r = await api('/api/specialist/queue'); if (r.ok) { setGroups(r.d.groups ?? []); setTotal(r.d.total ?? 0); } }, []);
  useEffect(() => { load(); }, [load]);
  const start = (g: Group | null, assist: boolean) => setOpen(p => ({ g, assist, id: (p?.id ?? 0) + 1 }));
  return (
    <section>
      <p className="lead">كل سؤال لم يجد منير له سنداً كافياً في المصادر يصل إلى هنا. الأسئلة المتطابقة تُجمع، فإجابة واحدة تصل إلى كل من سأل، كلٌّ بلغته.</p>
      <div className="rowbtns"><span className="pill v">تذاكر مفتوحة: {total}</span><button className="btn sm ghost" onClick={() => { load(); onChanged(); }}>تحديث</button><button className="btn sm ghost" onClick={() => start(null, false)}>إضافة إجابة معتمدة جديدة</button></div>
      {open && <AnswerForm key={open.id} group={open.g} assist={open.assist} name={name} onName={onName} onClose={() => setOpen(null)} onDone={() => { setOpen(null); load(); onChanged(); }} />}
      {groups.length === 0 && <div className="card center muted">لا توجد أسئلة محالة الآن.</div>}
      {groups.map(g => (
        <div className={`sp-ref${open?.g?.key === g.key ? ' on' : ''}`} key={g.key}>
          <div className="qt" dir="auto">{g.q_ar || g.q_en || g.sample}</div>
          <div className="orig">النص كما ورد: <bdi>{g.sample}</bdi></div>
          <div className="meta">
            <span className="pill">عدد السائلين: {g.ticket_ids.length}</span>
            {Object.entries(g.langs).map(([l, n]) => <span className="pill" key={l}>{langName(l)} × {n}</span>)}
            {g.latest && <span>آخر ورود: {when(g.latest)}</span>}
          </div>
          <div className="acts">
            <button className="btn sm" onClick={() => start(g, true)}>تجهيز مسودة بمساعدة الذكاء الاصطناعي</button>
            <button className="btn sm ghost" onClick={() => start(g, false)}>أجب</button>
          </div>
        </div>
      ))}
    </section>
  );
}

type AssistState = { state: 'idle' | 'loading' | 'error' | 'done'; data?: Assist; err?: string };

/** Source title and page for the form, from the evidence the scholar took. Pages are given only when one book is involved. */
function sourceLabel(es: Evidence[]): { title: string; loc: string } {
  const titles = [...new Set(es.map(e => e.title).filter(Boolean))];
  const pages = [...new Set(es.map(e => e.page).filter((p): p is number => p != null))].sort((a, b) => a - b);
  return { title: titles.join(' ؛ ').slice(0, 300), loc: titles.length === 1 && pages.length ? pages.map(p => `ص ${p}`).join('، ') : '' };
}

function AnswerForm({ group, assist, name, onName, onClose, onDone }: { group: Group | null; assist: boolean; name: string; onName: (n: string) => void; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ question: group ? (group.q_ar || group.q_en || group.sample) : '', answer: '', source_title: '', source_locator: '', source_quote: '' });
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [ai, setAi] = useState<AssistState>({ state: 'idle' });
  const [sec, setSec] = useState(0); const [fromDraft, setFromDraft] = useState(false); const [hint, setHint] = useState('');
  const seq = useRef(0); const box = useRef<HTMLDivElement>(null);
  const auto = useRef({ title: '', loc: '' });   // what the assistant last filled in; the scholar's own typing is never overwritten
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF(p => ({ ...p, [k]: e.target.value }));
  const ready = f.question.trim().length >= 5 && f.answer.trim().length >= 10 && f.source_title.trim().length >= 2 && f.source_quote.trim().length >= 10 && name.trim().length >= 2;

  // The assistant only prepares material for this form. A newer request, or closing the form, discards an older reply.
  const run = useCallback(async (question: string) => {
    const q = question.trim().slice(0, 800); if (q.length < 5) return;
    const id = ++seq.current; setAi({ state: 'loading' }); setHint('');
    const r = await api('/api/specialist/assist', { method: 'POST', body: JSON.stringify({ question: q }) }).catch(() => ({ ok: false, status: 0, d: {} as any }));
    if (id !== seq.current) return;
    if (!r.ok || !r.d?.ok) {
      setAi({ state: 'error', err: r.status === 401 ? 'انتهت الجلسة. سجّل الدخول من جديد ثم أعد المحاولة.' : r.status === 429 ? 'طلبات كثيرة في وقت قصير. انتظر دقيقة ثم أعد المحاولة.' : 'تعذر تجهيز المسودة الآن. أعد المحاولة، أو اكتب الجواب مباشرة فالنشر لا يتوقف على المساعد.' });
      return;
    }
    const d = r.d;
    setAi({ state: 'done', data: { draft: d.draft ?? null, evidence: Array.isArray(d.evidence) ? d.evidence : [], gaps: Array.isArray(d.gaps) ? d.gaps : [], related: Array.isArray(d.related) ? d.related : [], unmatched: Number(d.unmatched) || 0, passages: Number(d.passages) || 0, model: d.model ?? null } });
  }, []);
  useEffect(() => {
    box.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (assist) run(group ? (group.q_ar || group.q_en || group.sample) : '');
    return () => { seq.current++; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (ai.state !== 'loading') return;
    setSec(0); const t = setInterval(() => setSec(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [ai.state]);

  async function submit() {
    setBusy(true); setMsg(null);
    const r = await api('/api/specialist/answers', { method: 'POST', body: JSON.stringify({ ...f, author_name: name, ticket_ids: group?.ticket_ids.slice(0, 50) ?? [] }) });
    setBusy(false);
    if (!r.ok) { setMsg({ ok: false, text: r.d.error ?? 'تعذر الحفظ.' }); return; }
    if (r.d.published) { setMsg({ ok: true, text: `نُشرت الإجابة. وصلت إلى ${r.d.resolved_tickets} من السائلين، وستُستخدم لكل سؤال مطابق لاحقاً.` }); setTimeout(onDone, 1800); }
    else setMsg({ ok: false, text: `لم تُنشر: النص المصدري المرفق لا يسند الإجابة كما كُتبت (${r.d.verdict}). ${r.d.reason ?? ''} عدّل الإجابة أو أرفق نصاً أوضح ثم أعد الإرسال.` });
  }

  const inQuote = (e: Evidence) => f.source_quote.includes(e.quote);
  /** Appends evidence to the supporting text, and names its source when the scholar has not named one himself. */
  function addEvidence(list: Evidence[]) {
    let quote = f.source_quote.trim(); let over = false;
    for (const e of list) {
      if (quote.includes(e.quote)) continue;
      const next = quote ? `${quote}\n\n${e.quote}` : e.quote;
      if (next.length > QUOTE_MAX) { over = true; break; }
      quote = next;
    }
    const label = sourceLabel((ai.data?.evidence ?? []).filter(e => quote.includes(e.quote)));
    const was = auto.current; auto.current = label;
    setF(p => ({
      ...p, source_quote: quote,
      source_title: !p.source_title.trim() || p.source_title === was.title ? label.title : p.source_title,
      source_locator: !p.source_locator.trim() || p.source_locator === was.loc ? label.loc : p.source_locator,
    }));
    setHint(over ? `بلغ النص المصدري حده (${QUOTE_MAX} حرف)، فلم يُضف ما زاد عليه.` : '');
  }
  function takeDraft() {
    const d = ai.data?.draft; if (!d) return;
    const text = [d.ruling_ar, d.cases_ar.map(c => `${c.condition}: ${c.ruling}`).join('\n')].filter(Boolean).join('\n\n').slice(0, 4000);
    if (f.answer.trim() && f.answer.trim() !== text && !window.confirm('في خانة الجواب نص مكتوب. هل تريد أن تحل المسودة محله؟')) return;
    setF(p => ({ ...p, answer: text })); setFromDraft(true);
  }

  return (
    <div className={`sp-work${ai.state !== 'idle' ? ' two' : ''}`} ref={box}>
      <div className="card">
        <div className="sp-formh"><h2 className="pg">إجابة معتمدة</h2><span className="small muted">المجيب: <b dir="auto">{name.trim() || 'يُكتب أدناه'}</b></span></div>
        <p className="muted small">خطوة واحدة: تكتب الإجابة وترفق نصها من المصدر. يتحقق نموذج مستقل من أن النص يسند الإجابة، فإن سندها نُشرت فوراً، وإلا عادت إليك مع السبب.</p>
        <label className="f">السؤال</label><textarea className="in" rows={2} value={f.question} onChange={set('question')} dir="auto" />
        {ai.state === 'idle' && <div className="sp-acts"><button className="sp-btn" onClick={() => run(f.question)} disabled={f.question.trim().length < 5}>تجهيز مسودة بمساعدة الذكاء الاصطناعي</button></div>}
        <label className="f">الإجابة</label><textarea className="in" rows={7} value={f.answer} onChange={set('answer')} dir="auto" />
        {fromDraft && <span className="sp-origin">أصل هذا النص مسودة من المساعد. راجعه وعدّله كما ترى قبل النشر.</span>}
        <div className="grid2">
          <div><label className="f">المصدر</label><input className="in" value={f.source_title} onChange={set('source_title')} placeholder="اسم الكتاب أو الفتوى" dir="auto" /></div>
          <div><label className="f">الموضع (اختياري)</label><input className="in" value={f.source_locator} onChange={set('source_locator')} placeholder="الجزء والصفحة أو رقم الفتوى" dir="auto" /></div>
        </div>
        <label className="f sp-flabel"><span>النص المصدري الذي يسند الإجابة (إلزامي)</span><span className="c" dir="ltr">{f.source_quote.length} / {QUOTE_MAX}</span></label>
        <textarea className="in" rows={6} value={f.source_quote} onChange={set('source_quote')} dir="auto" maxLength={QUOTE_MAX} />
        {hint && <span className="sp-origin" role="status">{hint}</span>}
        <label className="f">المجيب (اسم المتخصص الشرعي)</label><input className="in" value={name} onChange={e => onName(e.target.value)} dir="auto" />
        {msg && <div className={msg.ok ? 'resolved' : 'err'} role="status">{msg.text}</div>}
        <div className="rowbtns"><button className="btn" onClick={submit} disabled={!ready || busy}>{busy ? 'جارٍ التحقق…' : 'تحقق وانشر'}</button><button className="btn ghost" onClick={onClose}>إلغاء</button></div>
      </div>

      {ai.state !== 'idle' && (
        <aside className="sp-asst" aria-label="مساعد المتخصص">
          <div className="sp-asst-h">
            <div className="t"><b>مساعد المتخصص</b><span className="sp-acts" style={{ marginTop: 0 }}><span className="sp-tag">مسودة آلية</span><button className="sp-btn" onClick={() => run(f.question)} disabled={ai.state === 'loading' || f.question.trim().length < 5}>إعادة التجهيز</button></span></div>
            <p>مسودة من المساعد، من المصادر المعتمدة فقط. الاقتباسات طابقها الكود حرفياً على نصوصها. تُراجَع قبل النشر.</p>
          </div>
          <div className="sp-asst-b">
            {ai.state === 'loading' && (
              <div className="sp-wait" role="status">
                <div className="l"><span className="spin" />أبحث في المصادر المعتمدة، ثم أصوغ المسودة</div>
                <div className="s">يستغرق ذلك عادةً من عشر ثوانٍ إلى عشرين. مضى <span dir="ltr">{sec}</span> ث. يمكنك الكتابة في النموذج أثناء الانتظار.</div>
                <div className="sp-bar"><i /></div>
              </div>
            )}
            {ai.state === 'error' && <div className="sp-sec"><div className="err" role="alert" style={{ marginTop: 0 }}>{ai.err}</div><div className="sp-acts"><button className="sp-btn pri" onClick={() => run(f.question)}>أعد المحاولة</button></div></div>}
            {ai.state === 'done' && ai.data && <AssistPanel d={ai.data} inQuote={inQuote} onAdd={addEvidence} onUse={takeDraft} used={fromDraft} />}
          </div>
        </aside>
      )}
    </div>
  );
}

/** What the assistant found and drafted. Everything here is a proposal: it reaches the form only when the scholar takes it. */
function AssistPanel({ d, inQuote, onAdd, onUse, used }: { d: Assist; inQuote: (e: Evidence) => boolean; onAdd: (list: Evidence[]) => void; onUse: () => void; used: boolean }) {
  const [spoken, setSpoken] = useState(false); const [copied, setCopied] = useState(false);
  async function copy(text: string) { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* clipboard not available */ } }
  const allIn = d.evidence.length > 0 && d.evidence.every(inQuote);
  return (
    <>
      <div className="sp-meta">
        المقاطع المقروءة من المصادر: {d.passages} · الاقتباسات المطابقة: {d.evidence.length}
        {d.unmatched > 0 && <> · <span className="x">استُبعد {d.unmatched} اقتباس لم يطابق نصه</span></>}
        {d.model && <> · <span dir="ltr">{d.model}</span></>}
      </div>

      <section className="sp-sec">
        <h3><span>الأدلة من المصادر المعتمدة</span>{d.evidence.length > 1 && <button className={`sp-btn${allIn ? ' done' : ''}`} onClick={() => onAdd(d.evidence)} disabled={allIn}>{allIn ? 'أُضيفت كلها' : 'أضف جميع الأدلة إلى النص المصدري'}</button>}</h3>
        {d.evidence.length === 0 && <p className="sp-empty">لم يثبت اقتباس مطابق من المصادر المعتمدة لهذا السؤال.</p>}
        <ol className="sp-evl">{d.evidence.map(e => {
          const taken = inQuote(e);
          return (
            <li className="sp-ev" key={e.n}>
              <span className="sp-n">{e.n}</span>
              <div>
                <div className="sp-evh"><span className={`sp-kind ${e.kind}`}>{KIND_AR[e.kind] ?? KIND_AR.text}</span><span className="sp-match">مطابق لنص المصدر</span></div>
                <blockquote className="sp-quote" dir="auto">{e.quote}</blockquote>
                {e.note_ar && <div className="sp-note">{e.note_ar}</div>}
                <div className="sp-srcline">{[e.title, e.author, e.page != null ? `ص ${e.page}` : null].filter(Boolean).join(' · ')}</div>
                <div className="sp-acts">
                  <button className={`sp-btn${taken ? ' done' : ''}`} onClick={() => onAdd([e])} disabled={taken}>{taken ? 'أُضيف إلى النص المصدري' : 'أضف إلى النص المصدري'}</button>
                  {e.url && /^https?:\/\//i.test(e.url) && <a className="sp-btn" href={e.url} target="_blank" rel="noopener noreferrer">فتح المصدر</a>}
                </div>
              </div>
            </li>
          );
        })}</ol>
      </section>

      <section className="sp-sec">
        <h3><span>مسودة الجواب</span></h3>
        {!d.draft && <p className="sp-empty">لم تُقترح مسودة لهذا السؤال. السبب مذكور في «ما لا تحسمه المصادر».</p>}
        {d.draft && <>
          <div className="sp-draft" dir="auto">
            <p>{d.draft.ruling_ar}</p>
            {d.draft.cases_ar.length > 0 && <ul className="sp-cases">{d.draft.cases_ar.map((c, i) => <li key={i}><b>{c.condition}:</b> {c.ruling}</li>)}</ul>}
          </div>
          {d.draft.disagreement && <div className="sp-dis">يوجد خلاف مذكور في المصادر</div>}
          <div className="sp-acts">
            <button className={`sp-btn ${used ? 'done' : 'pri'}`} onClick={onUse}>{used ? 'نُقلت إلى خانة الجواب' : 'استخدم المسودة في خانة الجواب'}</button>
            {d.draft.spoken_ar && <button className="sp-btn" aria-pressed={spoken} onClick={() => setSpoken(s => !s)}>صيغة للإلقاء</button>}
          </div>
          {spoken && d.draft.spoken_ar && (
            <div className="sp-spoken">
              <div className="h"><span>صيغة للإلقاء على السائل</span><button className={`sp-btn${copied ? ' done' : ''}`} onClick={() => copy(d.draft!.spoken_ar)}>{copied ? 'نُسخت' : 'انسخ'}</button></div>
              <p dir="auto">{d.draft.spoken_ar}</p>
            </div>
          )}
          <p className="sp-empty" style={{ marginTop: 10 }}>عند النشر يُعرض الجواب على النص المصدري المرفق، فأضف من الأدلة ما يسند كل جملة فيه.</p>
        </>}
      </section>

      <section className="sp-sec">
        <h3><span>ما لا تحسمه المصادر</span><span className="c">يحتاج إلى علم المتخصص</span></h3>
        {d.gaps.length ? <ul className="sp-gaps">{d.gaps.map((g, i) => <li key={i} dir="auto">{g}</li>)}</ul> : <p className="sp-empty">لم يذكر المساعد مسائل معلّقة. هذا لا يغني عن مراجعتك.</p>}
      </section>

      <section className="sp-sec">
        <h3><span>إجابات منشورة قريبة</span></h3>
        {d.related.length === 0 && <p className="sp-empty">لا توجد إجابة منشورة قريبة من هذا السؤال.</p>}
        {d.related.map((r, i) => (
          <div className="sp-rel" key={i}>
            <div className="h"><span className="pill g">منشورة</span>{r.code && <span className="small" dir="ltr">{r.code}</span>}<span className="qq" dir="auto">{r.question}</span></div>
            <div className="a" dir="auto">{r.answer.length > 300 ? `${r.answer.slice(0, 300).trimEnd()}…` : r.answer}</div>
            {r.locator && <div className="l" dir="auto">{r.locator}</div>}
          </div>
        ))}
      </section>
    </>
  );
}

// ---------- verified answers ----------
function Answers({ onChanged }: { onChanged: () => void }) {
  const [rows, setRows] = useState<VA[]>([]); const [q, setQ] = useState('');
  const load = useCallback(async () => { const r = await api('/api/specialist/answers'); if (r.ok) setRows(r.d.answers ?? []); }, []);
  useEffect(() => { load(); }, [load]);
  async function toggle(v: VA) { await api('/api/specialist/answers', { method: 'PATCH', body: JSON.stringify({ id: v.id, status: v.status === 'published' ? 'withdrawn' : 'published' }) }); load(); onChanged(); }
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
    let pack: { sources?: any[]; chunks?: any[]; fatwas?: any[]; replace_source?: string };
    try { pack = JSON.parse(await file.text()); } catch { setLog('الملف ليس بصيغة JSON صحيحة.'); return; }
    const sources = pack.sources ?? []; const chunks = pack.chunks ?? []; const fatwas = pack.fatwas ?? [];
    const batches: { body: any; n: number }[] = [];
    if (sources.length) batches.push({ body: { sources, ...(pack.replace_source ? { replace_source: pack.replace_source } : {}) }, n: sources.length });
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
      <SyncCard onDone={load} />
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

/** Sync with the approved online reference. The server takes a few pages per call; this loop simply keeps asking. */
function SyncCard({ onDone }: { onDone: () => void }) {
  const [st, setSt] = useState<{ total: number; done: number; remaining: number } | null>(null);
  const [running, setRunning] = useState(false); const [msg, setMsg] = useState(''); const stop = useRef(false);
  const status = useCallback(async () => { const r = await api('/api/sync?status=1'); if (r.ok && r.d.total) setSt({ total: r.d.total, done: r.d.done, remaining: r.d.remaining }); else setMsg(r.d?.error ?? 'تعذر الوصول إلى المرجع الآن.'); }, []);
  useEffect(() => { status(); }, [status]);
  async function start() {
    stop.current = false; setRunning(true); setMsg('');
    for (let fails = 0; !stop.current && fails < 5;) {
      const r = await api('/api/sync', { method: 'POST' }).catch(() => ({ ok: false, status: 0, d: {} as any }));
      if (r.d?.total) setSt({ total: r.d.total, done: r.d.done, remaining: r.d.remaining });
      if (r.d?.errors?.length || !r.d?.total) { fails++; setMsg(`تعذر جلب بعض الصفحات، أعيد المحاولة (${fails}).`); await sleep(3000); }
      if (r.d?.total && r.d.remaining === 0) { setMsg('اكتملت المزامنة. تُحدَّث بعدها تلقائياً كل يوم.'); break; }
      await sleep(600);
    }
    setRunning(false); onDone();
  }
  return (
    <div className="card">
      <b>المزامنة مع المراجع المعتمدة على الشبكة</b>
      <p className="muted small" style={{ marginTop: 4 }}>الموسوعة الفقهية بموقع الدرر السنية (كتاب الحج): يقرأ منير صفحاتها من الموقع نفسه، ويحفظ مع كل مقطع رابط صفحته، ويعيد قراءتها يومياً ليلحق بأي تصحيح. إن رفض الموقع طلبات الخادم، تُستورد الصفحات حزمةً من «رفع حزمة مصادر» أعلاه بالصيغة نفسها.</p>
      {st && <><div className="prog"><i style={{ width: `${st.total ? Math.round(100 * st.done / st.total) : 0}%` }} /></div><div className="small muted">الصفحات المحفوظة: {st.done} من {st.total}</div></>}
      {msg && <div className="small" style={{ marginTop: 6 }}>{msg}</div>}
      <div className="rowbtns">
        <button className="btn sm" onClick={start} disabled={running || (st?.remaining === 0)}>{running ? 'جارٍ الجلب…' : st?.remaining === 0 ? 'مكتملة' : 'ابدأ المزامنة'}</button>
        {running && <button className="btn sm ghost" onClick={() => { stop.current = true; }}>إيقاف</button>}
      </div>
    </div>
  );
}

// ---------- locked terminology ----------
function Glossary() {
  const [q, setQ] = useState('');
  const rows = GLOSSARY.filter(g => !q || `${g.en} ${g.ar} ${g.ur} ${g.id} ${g.fr}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <section>
      <p className="lead">المصطلحات الشرعية لا تمر على الترجمة الآلية الحرة: تُحجب قبل الترجمة ثم تُستعاد من هذا الجدول، ويُفحص الناتج آلياً. الإصدار <b dir="ltr">{GLOSSARY_VERSION}</b>، وعدد المصطلحات {GLOSSARY.length}، منها {GLOSSARY.filter(g => g.jamhara).length} روجعت على معجم المصطلحات الشرعية المعتمد (الجمهرة)، و{GLOSSARY.filter(g => g.reviewed).length} تطابقت معه في لغة غير الإنجليزية.</p>
      <input className="in" style={{ margin: '12px 0' }} placeholder="بحث" value={q} onChange={e => setQ(e.target.value)} dir="auto" />
      <div className="tablewrap"><table className="t">
        <thead><tr><th>المعرّف</th><th>English</th><th>العربية</th><th>اردو</th><th>Indonesia</th><th>Français</th><th>صيغ ممنوعة</th><th>المعجم المعتمد</th></tr></thead>
        <tbody>{rows.map(g => (
          <tr key={g.tid}><td dir="ltr">{g.tid}</td><td dir="ltr">{g.en}</td><td>{g.ar}</td><td>{g.ur}</td><td dir="ltr">{g.id}</td><td dir="ltr">{g.fr}</td>
            <td className="small" dir="auto">{g.forbid ? Object.entries(g.forbid).map(([l, ws]) => `${l}: ${(ws as string[]).join('، ')}`).join(' | ') : '—'}</td>
            <td className="small">{g.jamhara ? <a href={`https://islamic-content.com/dictionary/word/${g.jamhara}`} target="_blank" rel="noopener noreferrer">{g.checked?.length ? `مطابق: ${g.checked.join('، ')}` : 'مدخل عام'}</a> : '—'}</td></tr>
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
