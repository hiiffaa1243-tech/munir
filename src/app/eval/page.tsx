'use client';
import { Fragment, useEffect, useMemo, useState } from 'react';

const TIER: Record<string, string> = { verified: 'إجابة معتمدة', grounded: 'إجابة من مصدر', referred: 'إحالة', clarify: 'استيضاح أو تفصيل', out_of_scope: 'خارج النطاق', not_verified: 'لا تُطابَق بإجابة مخزنة', answered: 'أجاب', abstained: 'امتنع' };
const CAT: Record<string, string> = { A: 'عمرة لها نص', B: 'حج له نص', C: 'لها إجابة معتمدة', CX: 'مطابقة خادعة', D: 'يختلف بحال السائل', E: 'شخصية أو خارج النطاق', F: 'مضللة أو عدائية أو خلافية' };
const pct = (x: number | null | undefined) => (x === null || x === undefined ? '—' : `${Math.round(x * 100)}%`);

function Tile({ v, k, sub }: { v: string; k: string; sub?: string }) { return <div className="tile"><div className="v">{v}</div><div className="k">{k}</div>{sub && <div className="small muted" style={{ marginTop: 4 }}>{sub}</div>}</div>; }

/** Published evaluation: Munir against a general model with no sources, on the same 150 synthetic questions. */
export default function EvalPage() {
  const [d, setD] = useState<any>(null); const [err, setErr] = useState(false);
  const [split, setSplit] = useState<'final' | 'holdout' | 'holdout_after' | 'dev' | 'all'>('holdout'); const [filter, setFilter] = useState<'all' | 'fail'>('all'); const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { document.documentElement.lang = 'ar'; document.documentElement.dir = 'rtl'; fetch('/api/eval/results').then(r => r.ok ? r.json() : Promise.reject()).then(x => { setD(x); if (x?.final?.munir_runs > 0) setSplit('final'); }).catch(() => setErr(true)); }, []);
  const after = split === 'holdout_after'; const fin = split === 'final';
  const hasFinal = (d?.final?.munir_runs ?? 0) > 0;
  // The final version and the re-run read their own stored run of the same held-out questions.
  const rows = useMemo(() => (d?.cases ?? []).filter((c: any) => (split === 'all' || c.split === (after || fin ? 'holdout' : split)))
    .map((c: any) => (fin ? { ...c, tier: c.tier4, ok: c.ok4, munir: c.tier4 ? { ...(c.munir ?? {}), text: c.text4, reason: c.reason4 } : null }
      : after ? { ...c, tier: c.tier2, ok: c.ok2, munir: c.tier2 ? { ...(c.munir ?? {}), text: c.text2, reason: c.reason2 } : null } : c))
    .filter((c: any) => filter === 'all' || c.ok === false), [d, split, filter, after, fin]);
  if (err) return <main><div className="wrap"><div className="err">تعذر تحميل النتائج.</div></div></main>;
  if (!d) return <main><div className="wrap"><div className="stage"><span className="spin" />جارٍ التحميل</div></div></main>;
  const s = d[split] ?? d.holdout;
  const none = !s.munir_runs;
  return (
    <main><div className="wrap wide">
      <header className="top"><div className="brand"><b>منير</b><span>نتائج التقييم</span></div><div className="rowbtns" style={{ marginTop: 0 }}><a className="btn sm ghost" href="/">نقطة الخدمة</a><a className="btn sm ghost" href="/demo">كيف يعمل منير</a></div></header>
      <h1 className="pg">هل يُوثَق بإجابة منير؟ القياس لا الادعاء</h1>
      <p className="lead">150 سؤالاً اصطناعياً بخمس لغات، كُتبت قبل بناء النظام: 30 للضبط، و120 محجوبة لا تُستخدم إلا للقياس. المعيار ليس «هل أجاب» بل «هل تصرّف كما يجب»: يجيب حين يوجد نص، ويحيل حين تكون المسألة حالة شخصية أو بلا سند، ويرفض ما هو خارج نطاقه. يُقارَن بنموذج عام يجيب من ذاكرته، ويحكم بينهما نموذج من مزوّد آخر.</p>
      <p className="small muted" dir="ltr" style={{ textAlign: 'right' }}>generate: {d.models.generate} · verify: {d.models.verify} · baseline: {d.models.baseline}</p>

      <nav className="tabs">
        {([...(hasFinal ? (['final'] as const) : []), 'holdout', 'holdout_after', 'dev', 'all'] as const).map(k => <button key={k} className="chip" aria-pressed={split === k} onClick={() => setSplit(k)}>{k === 'final' ? 'النسخة النهائية' : k === 'holdout' ? 'المحجوبة: التشغيل الأول (120)' : k === 'holdout_after' ? 'المحجوبة: بعد الإصلاح' : k === 'dev' ? 'الضبط (30)' : 'الكل (150)'}</button>)}
      </nav>

      <p className="small muted" style={{ marginBottom: 10 }}>{fin ? 'تشغيل على النسخة النهائية بعد تحسينات بُنيت على مراجعة إخفاقات التشغيلين السابقين. الأسئلة لم تعد محجوبة عن الفريق، فهذا قياس للنسخة الحالية لا اختبار أعمى؛ التشغيل الأول يبقى القياس الأعمى الوحيد.' : split === 'holdout' ? 'تشغيل واحد على الأسئلة المحجوبة والإعدادات مجمّدة، قبل أي اطلاع على نتائجها. هذا هو القياس النظيف.' : after ? 'إعادة تشغيل على الأسئلة نفسها بعد إصلاحات كشفها التشغيل الأول (إعادة المحاولة عند حد المعدل لدى المزوّد، وقاعدة أوضح للحالات الشخصية). لم تعد الأسئلة محجوبة عن الفريق، فتُقرأ هذه الأرقام مع هذا القيد.' : split === 'dev' ? 'الأسئلة التي ضُبطت عليها العتبات والتعليمات.' : 'كل الأسئلة، بالتشغيل الأول لكل منها.'}</p>
      {none ? <div className="card center muted">لم يُشغَّل التقييم على هذه المجموعة بعد.</div> : (<>
        <div className="grid2">
          <Tile v={pct(s.behaviour_accuracy)} k="صحة التصرف" sub={`على ${s.munir_runs} سؤالاً من ${s.cases}`} />
          <Tile v={pct(s.abstention_recall)} k="استدعاء الامتناع" sub="من كل ما كان يجب أن يُحال أو يُرفض، كم أحاله أو رفضه منير" />
          <Tile v={pct(s.abstention_precision)} k="دقة الامتناع" sub="من كل ما أحاله أو رفضه، كم كان يستحق ذلك" />
          <Tile v={pct(s.munir.answers_with_source)} k="إجابات تحمل مصدرها" sub={`من ${s.munir.answered} إجابة`} />
          <Tile v={pct(s.stability)} k="ثبات التصرف عند إعادة التشغيل" sub="نسبة الأسئلة التي تكرر فيها التصرف نفسه في تشغيلين متتاليين" />
          <Tile v={pct(s.munir.glossary_intact_rate)} k="سلامة المصطلحات في الترجمة" />
          <Tile v={s.latency_ms.p50 ? `${(s.latency_ms.p50 / 1000).toFixed(1)} ث` : '—'} k="الزمن الوسيط للإجابة" sub={s.latency_ms.p90 ? `p90: ${(s.latency_ms.p90 / 1000).toFixed(1)} ث` : undefined} />
        </div>

        <h2 className="pg">منير مقابل نموذج عام بلا مصادر</h2>
        <div className="tablewrap"><table className="t">
          <thead><tr><th>المقياس</th><th>منير</th><th>النموذج العام</th></tr></thead>
          <tbody>
            <tr><td>عبارات لا يسندها نص من المصادر (بحكم نموذج مستقل)</td><td className="ok">{pct(s.munir.unsupported_claim_rate)}</td><td className="no">{pct(s.baseline.unsupported_claim_rate)}</td></tr>
            <tr><td>إجابات تذكر مصدراً يمكن الرجوع إليه</td><td className="ok">{pct(s.munir.answers_with_source)}</td><td className="no">{pct(s.baseline.answers_citing_source)}</td></tr>
            <tr><td>الامتناع حين يجب (حالة شخصية، خارج النطاق، تلاعب)</td><td className="ok">{pct(s.abstention_recall)}</td><td className="no">{pct(s.baseline.abstained_when_required)}</td></tr>
            <tr><td>مرات أجاب فيها حيث كان يجب أن يمتنع</td><td>—</td><td className="no">{s.baseline.answered_when_should_abstain}</td></tr>
          </tbody>
        </table></div>
        <p className="small muted" style={{ marginTop: 6 }}>عدد أسئلة النموذج العام المحكَّمة: {s.baseline_runs}.</p>

        <div className="grid2" style={{ marginTop: 14 }}>
          <div className="tile"><h3 className="sec" style={{ marginTop: 0 }}>صحة التصرف بحسب الفئة</h3>
            {s.by_category.map((c: any) => <div className="bar" key={c.category}><span>{CAT[c.category] ?? c.category}</span><span className="tr"><i style={{ width: `${Math.round((c.accuracy ?? 0) * 100)}%` }} /></span><b>{pct(c.accuracy)}</b></div>)}</div>
          <div className="tile"><h3 className="sec" style={{ marginTop: 0 }}>صحة التصرف بحسب اللغة</h3>
            {s.by_lang.map((c: any) => <div className="bar" key={c.lang}><span dir="ltr">{c.lang}</span><span className="tr"><i style={{ width: `${Math.round((c.accuracy ?? 0) * 100)}%` }} /></span><b>{pct(c.accuracy)}</b></div>)}</div>
        </div>
      </>)}

      <h2 className="pg">الأسئلة واحداً واحداً</h2>
      <nav className="tabs"><button className="chip" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>الكل</button><button className="chip" aria-pressed={filter === 'fail'} onClick={() => setFilter('fail')}>الإخفاقات فقط</button></nav>
      <div className="tablewrap"><table className="t">
        <thead><tr><th>#</th><th>السؤال</th><th>الفئة</th><th>المتوقع</th><th>تصرف منير</th><th /></tr></thead>
        <tbody>{rows.map((c: any) => (<Fragment key={c.id}>
          <tr>
            <td dir="ltr">{c.id}</td><td><div dir="auto">{c.question}</div>{c.lang !== 'ar' && <div className="muted small">{c.meaning_ar}</div>}</td>
            <td className="small">{CAT[c.category] ?? c.category}</td><td className="small">{TIER[c.expected] ?? c.expected}</td>
            <td>{c.tier ? <span className={`pill ${c.ok ? 'g' : 'b'}`}>{TIER[c.tier] ?? c.tier}</span> : <span className="pill">لم يُشغَّل</span>}</td>
            <td>{c.munir && <button className="btn sm ghost" onClick={() => setOpen(open === c.id ? null : c.id)}>{open === c.id ? 'إخفاء' : 'عرض'}</button>}</td>
          </tr>
          {open === c.id && (
            <tr><td colSpan={6}><div className="cmp">
              <div><b>منير</b>{c.munir?.reason && <span className="pill" style={{ marginInlineStart: 8 }} dir="ltr">{c.munir.reason}</span>}<div className="pre" dir="auto">{c.munir?.text || '(إحالة بلا إجابة)'}</div></div>
              <div><b>النموذج العام</b>{c.baseline?.judge && <span className="pill w" style={{ marginInlineStart: 8 }}>غير مسند: {c.baseline.judge.unsupported_claims ?? 0}</span>}<div className="pre" dir="auto">{c.baseline?.text || '(لم يُشغَّل)'}</div></div>
            </div></td></tr>
          )}
        </Fragment>))}</tbody>
      </table></div>
    </div></main>
  );
}
