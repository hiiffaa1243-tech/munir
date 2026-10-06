'use client';
import { useEffect, useState } from 'react';

const TIER: Record<string, string> = { verified: 'معتمدة من متخصص', grounded: 'مستخرجة من مصدر', referred: 'محالة إلى متخصص', clarify: 'استيضاح', out_of_scope: 'خارج النطاق' };
const LANG: Record<string, string> = { ar: 'العربية', en: 'الإنجليزية', ur: 'الأردية', id: 'الإندونيسية', fr: 'الفرنسية', tr: 'التركية', bn: 'البنغالية' };
const pct = (x: number) => `${Math.round(x * 100)}%`;

function Bars({ data, labels }: { data: Record<string, number>; labels?: Record<string, string> }) {
  const rows = Object.entries(data).sort((a, b) => b[1] - a[1]); const max = Math.max(1, ...rows.map(r => r[1]));
  if (!rows.length) return <p className="muted small">لا توجد بيانات بعد.</p>;
  return <div>{rows.map(([k, v]) => <div className="bar" key={k}><span dir="auto">{labels?.[k] ?? k}</span><span className="tr"><i style={{ width: `${(100 * v) / max}%` }} /></span><b>{v}</b></div>)}</div>;
}

/** The confusion map: where pilgrims get stuck, by language, rite and stage. Aggregates only. */
export default function Insights() {
  const [d, setD] = useState<any>(null); const [err, setErr] = useState(false);
  useEffect(() => { document.documentElement.lang = 'ar'; document.documentElement.dir = 'rtl'; fetch('/api/insights').then(r => r.ok ? r.json() : Promise.reject()).then(setD).catch(() => setErr(true)); }, []);
  if (err) return <main><div className="wrap"><div className="err" role="alert">تعذر تحميل المؤشرات. حدّث الصفحة وحاول مرة أخرى.</div></div></main>;
  if (!d) return <main><div className="wrap"><div className="stage" role="status" aria-live="polite"><span className="spin" aria-hidden="true" />جارٍ التحميل</div></div></main>;
  const answered = (d.by_tier.verified ?? 0) + (d.by_tier.grounded ?? 0);
  return (
    <main><div className="wrap wide">
      <header className="top"><div className="brand"><b>منير</b><span>خريطة الالتباس</span></div><div className="rowbtns" style={{ marginTop: 0 }}><a className="btn sm ghost" href="/">نقطة الخدمة</a><a className="btn sm ghost" href="/eval">نتائج التقييم</a></div></header>
      <h1 className="pg">أين يحتار ضيوف الرحمن؟</h1>
      <p className="lead">كل سؤال يُطرح على منير يصير إشارة مجهولة الهوية: بأي لغة، وفي أي نسك، وعند أي مرحلة. تجتمع الإشارات فتدل الجهات المعنية على ما يحتاج توعية مسبقة، وعلى ما ينقص المصادر. لا اسم ولا رقم ولا حساب، ونص السؤال لا يظهر هنا إلا إذا تكرر من سائلين اثنين فأكثر.</p>

      <div className="grid2" style={{ marginTop: 18 }}>
        <div className="tile"><div className="v">{d.total}</div><div className="k">سؤالاً مسجلاً</div></div>
        <div className="tile"><div className="v">{d.total ? pct(answered / d.total) : '—'}</div><div className="k">أُجيب عنها من مصدر أو من إجابة معتمدة</div></div>
        <div className="tile"><div className="v">{d.total ? pct((d.by_tier.referred ?? 0) / d.total) : '—'}</div><div className="k">أُحيلت إلى متخصص شرعي</div></div>
        <div className="tile"><div className="v">{d.open_tickets}</div><div className="k">تذكرة مفتوحة بانتظار الإجابة</div></div>
        <div className="tile"><div className="v">{d.latency_ms.p50 ? `${(d.latency_ms.p50 / 1000).toFixed(1)} ث` : '—'}</div><div className="k">الزمن الوسيط للإجابة (p90: {d.latency_ms.p90 ? `${(d.latency_ms.p90 / 1000).toFixed(1)} ث` : '—'})</div></div>
      </div>

      <div className="grid2" style={{ marginTop: 14 }}>
        <div className="tile"><h3 className="sec" style={{ marginTop: 0 }}>نوع الإجابة</h3><Bars data={d.by_tier} labels={TIER} /></div>
        <div className="tile"><h3 className="sec" style={{ marginTop: 0 }}>لغة السائل</h3><Bars data={d.by_lang} labels={LANG} /></div>
        <div className="tile"><h3 className="sec" style={{ marginTop: 0 }}>مرحلة النسك</h3><Bars data={d.by_stage} /></div>
        <div className="tile"><h3 className="sec" style={{ marginTop: 0 }}>نقطة الخدمة</h3><Bars data={d.by_kiosk} labels={{ phone: 'الجوال', unknown: 'الموقع' }} /></div>
      </div>

      <h2 className="pg">فجوات المعرفة: مراحل يكثر فيها ما لا تغطيه المصادر</h2>
      <div className="tablewrap" tabIndex={0} role="region" aria-label="فجوات المعرفة"><table className="t"><thead><tr><th>المرحلة</th><th>الأسئلة</th><th>المحال منها</th><th>نسبة الإحالة</th></tr></thead>
        <tbody>{d.knowledge_gaps.map((g: any) => <tr key={g.stage}><td dir="auto">{g.stage}</td><td>{g.total}</td><td>{g.referred}</td><td>{pct(g.rate)}</td></tr>)}</tbody></table></div>

      <h2 className="pg">الأسئلة الأكثر تكراراً</h2>
      {d.top_questions.length === 0 ? <p className="muted">لم يتكرر سؤال بعد بما يكفي لعرضه.</p> : (
        <div className="tablewrap" tabIndex={0} role="region" aria-label="الأسئلة الأكثر تكراراً"><table className="t"><thead><tr><th>السؤال</th><th>التكرار</th><th>اللغات</th><th>النتيجة</th></tr></thead>
          <tbody>{d.top_questions.map((q: any, i: number) => <tr key={i}><td>{q.q_ar || q.q_en}</td><td>{q.n}</td><td dir="ltr">{q.langs.join(', ')}</td><td>{TIER[q.tier] ?? q.tier}</td></tr>)}</tbody></table></div>
      )}

      {d.top_referred.length > 0 && (<>
        <h2 className="pg">أحدث الأسئلة المحالة (تظهر للمتخصص فقط)</h2>
        <div className="tablewrap" tabIndex={0} role="region" aria-label="أحدث الأسئلة المحالة"><table className="t"><thead><tr><th>السؤال</th><th>اللغة</th><th>سبب الإحالة</th></tr></thead>
          <tbody>{d.top_referred.map((q: any, i: number) => <tr key={i}><td>{q.q_ar || q.q_en}</td><td>{LANG[q.lang] ?? q.lang}</td><td dir="ltr">{q.reason ?? '—'}</td></tr>)}</tbody></table></div>
      </>)}
    </div></main>
  );
}
