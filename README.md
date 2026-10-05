<div dir="rtl">

# منير · Munir

**إجابة شرعية موثقة عن الحج والعمرة بلغة الحاج، أو إحالة صريحة إلى متخصص شرعي.**

مشاركة في «تحدي الذكاء الاصطناعي في خدمة المحتوى الإسلامي»، المسار الأول: الحوار المعرفي والإجابات الموثوقة.

| | |
|---|---|
| الرابط الحي | **LIVE_URL** |
| كيف يعمل، مع مواقف جاهزة للتجربة | `LIVE_URL/demo` |
| نتائج التقييم المنشورة | `LIVE_URL/eval` |
| فحص حي للنماذج وقاعدة البيانات | `LIVE_URL/api/health?deep=1` |

## المشكلة

الحاج يسأل في لحظة النسك، بلغته، ويحتاج جواباً يثق به الآن. المتاح أمامه: مرشد لا يتكلم لغته أو غير موجود في تلك الساعة، أو نموذج ذكاء اصطناعي عام يجيب بثقة من ذاكرته بلا مصدر، ويفتي في حالات شخصية لا يصح أن يفتي فيها.

## ما يفعله منير

- **يجيب من مصادر معتمدة فقط**، وكل عبارة في الإجابة تحمل رقم مصدرها وصفحته ونصه الأصلي.
- **يمتنع حين يجب**: ما لا سند له في المصادر، وما كان حالة شخصية أو فتوى خاصة، يُحال إلى متخصص شرعي معتمد بتذكرة، ولا يُجاب عنه بتخمين.
- **بخمس لغات**: العربية والإنجليزية والأردية والإندونيسية والفرنسية، صوتاً ونصاً، مع معجم مقفل يحمي المصطلحات الشرعية من الترجمة الآلية الحرة.
- **يفصّل بحسب الحال** بدل أن يستجوب السائل: يعرض حكم العامد والناسي والجاهل معاً.
- **يصل إلى جوال الحاج بلا حساب**: رمز QR لمرة واحدة يفتح دفتراً خاصاً يعمل دون اتصال، وتصله فيه إجابة المتخصص لاحقاً.
- **يحوّل الأسئلة إلى معرفة**: خريطة التباس مجهولة الهوية تبيّن أين يحتار الحجاج وما الذي ينقص المصادر.

## لماذا ليس «روبوت محادثة» آخر

كل بوابة لا تُجتاز تنتهي بإحالة، لا بإجابة أضعف (fail-closed):

```mermaid
flowchart TD
  Q[سؤال الحاج: صوت أو نص] --> U[1. فهم السؤال وتصنيفه]
  U -->|خارج النطاق| O[اعتذار وتوجيه]
  U --> M{2. يطابق إجابة معتمدة؟}
  M -->|نعم| V[نص الإجابة المعتمدة كما هو]
  M -->|لا| R{3. في المصادر نص كافٍ؟}
  R -->|لا| T[إحالة إلى متخصص + تذكرة]
  R -->|نعم| G[4. توليد مقيد: كل عبارة باستشهادها]
  G --> C{فحص برمجي للاستشهادات}
  C -->|فشل مرتين| T
  C -->|نجح| X{5. تحقق مستقل من مزوّد آخر}
  X -->|عبارة واحدة غير مسندة| T
  X -->|كلها مسندة| L[6. ترجمة مقيدة بالمعجم]
  V --> L
  L --> A[إجابة موسومة بدرجة الثقة ومصدرها]
  T --> S[المتخصص يجيب بخطوة واحدة مع نص مصدري] --> V
```

| الضابط | كيف يُنفَّذ | أين في الكود |
|---|---|---|
| لا توليد بلا سند | بوابة كفاية السياق قبل التوليد: بحث هجين (دلالي + نصي) مدموج بـ RRF وعتبة تشابه | `src/lib/pipeline/steps.ts` |
| كل عبارة بمصدرها | فحص برمجي، لا نموذج، يرفض أي عبارة بلا استشهاد أو باستشهاد غير موجود في المقاطع | `enforceCitations` |
| تحقق غير مترابط الأخطاء | نموذج التحقق من مزوّد غير مزوّد التوليد، يراجع كل عبارة والتوجيه العملي على نصها | `verifyWithModel` |
| لا فتوى خاصة | تصنيف الحالة الشخصية في أول خطوة، وإحالتها مهما وُجد من نصوص | `src/lib/pipeline/index.ts` |
| حماية المصطلح | حجب المصطلح برمز قبل الترجمة، استعادته من جدول مقفل، ثم فحص السلامة والصيغ الممنوعة | `src/lib/glossary` |
| مقاومة التلاعب | نص السائل يُمرَّر بياناً لا تعليمات، ومحاولات التوجيه تُرصد وتُسجَّل | `prompts.ts` |
| إجابة المتخصص | خطوة واحدة: إجابة + نص مصدري إلزامي + تحقق آلي، ثم تُنشر لكل من سأل بلغته | `api/specialist/answers` |
| الخصوصية | لا حساب ولا اسم ولا رقم. مفتاح الدفتر يتولد في الجوال ولا يُخزَّن منه إلا بصمته | `src/lib/notebook` |
| الشفافية | إفصاح دائم بأن الخدمة ذكاء اصطناعي وليست مفتياً، ودرجة الثقة أول ما يُعرض | واجهة الإجابة |

## التوافق مع المرجعية العلمية للتحدي

| متطلب المرجعية | في منير |
|---|---|
| قابلية التتبع | مصدر وصفحة ونص أصلي لكل عبارة، وسجل تدقيق لكل نشر وسحب |
| منع الهلوسة والامتناع عند غياب المرجع | خمس بوابات متتالية، والفشل في أي منها إحالة |
| مستويات المحتوى (أ، ب، ج، د) | يُصنَّف السؤال، والخلافي يُذكر خلافه كما في المصدر، والفتوى الخاصة (د) خارج النطاق وتُحال |
| ضبط المصطلحات وتفضيل المعاجم المعتمدة | معجم مقفل ومُصدَّر بإصدار، وحالة مراجعة كل مصطلح مسجلة |
| الإفصاح والخصوصية | إفصاح ثابت في كل شاشة، وبيانات اصطناعية فقط في الاختبار |

## القياس

150 سؤالاً اصطناعياً بخمس لغات كُتبت قبل كتابة الكود: 30 للضبط و120 محجوبة للقياس، في سبع فئات تشمل الحالات الشخصية والأسئلة الخادعة ومحاولات التلاعب. يُشغَّل عليها منير ونموذج عام بلا مصادر، ويحكم بينهما نموذج مستقل. النتائج، بإخفاقاتها، منشورة في `/eval`، والمنهجية في [docs/EVALUATION.md](docs/EVALUATION.md).

## حدود معلنة

- المعجم الحالي نسخة أولى أعدّها الفريق، وكل مصطلح فيه موسوم بأنه لم يراجَع بعد من جهة علمية. مراجعته على معجم «جمهرة» خطوة لاحقة.
- ذاكرة الإجابات المعتمدة مبذورة بفتاوى منشورة للجنة الدائمة منقولة بنصها. لوحة المتخصص جاهزة، ولم يعمل عليها متخصص شرعي معتمد بعد.
- المصادر الحالية إنجليزية (إصدارات رسمية لرئاسة الشؤون الدينية بالمسجد الحرام والمسجد النبوي وموقع دار الإسلام)، فالإنجليزية لغة محورية داخل المسار والإجابة تُترجم منها.
- إذا تعذر الوصول إلى مزوّد التحقق يُستخدم نموذج ثانٍ ويُسجَّل ذلك على الإجابة. يمكن إلغاء هذا البديل ليصير الفشل إحالة.

</div>

---

## Technical overview

One Next.js 15 (App Router, TypeScript) application deployed on Vercel, with Supabase (Postgres, pgvector, full-text search). Models are called by role through plain `fetch`, so a provider or model is a configuration change.

| Role | Default | Purpose |
|---|---|---|
| fast | OpenAI `gpt-4.1-mini` | query understanding, equivalence check, constrained translation |
| gen | OpenAI `gpt-4.1` | citation-bound answer composition |
| verify | Google Gemini Flash | independent entailment check (different provider than `gen`) |
| baseline | OpenAI `gpt-4.1` | closed-book comparison, evaluation only |
| embeddings / speech | `text-embedding-3-small`, `whisper-1`, `gpt-4o-mini-tts` | retrieval, voice in, voice out |

```
src/lib/pipeline     understand -> verified memory -> retrieval gate -> generation -> verification -> translation
src/lib/glossary     locked terminology: masking, restoring, integrity check
src/lib/notebook     one-time claim tokens, short codes, hashed notebook keys
src/lib/eval         150 synthetic cases and metrics
src/app              service point (/), notebook (/n), claim (/c), specialist, insights, eval, demo
src/app/api          ask (streamed), transcribe, tts, claim, notebook, specialist/*, eval/*, insights, health
supabase/schema.sql  tables, indexes, retrieval functions; RLS on, no public policies
scripts              PDF extraction and source-pack builder
```

### Run it

```bash
npm install
MUNIR_MOCK=1 npm run dev        # no keys, no network: canned models and an in-memory database
npm test && npm run typecheck   # unit tests for masking, citation enforcement, fusion, tokens
```

For a real deployment: run `supabase/schema.sql` in the Supabase SQL editor, set the variables in `.env.example`, deploy, then open `/specialist` and upload the source pack. `GET /api/health?deep=1` calls every model role once and reports what is misconfigured.

### Sources and data

The approved books are read as PDFs, split along their own structure (a fatwa stays whole; paragraphs stay under their heading), and uploaded as a pack. The books' text is **not** in this repository; `data/sources.json` lists them. See [docs/SOURCES-AND-LICENSES.md](docs/SOURCES-AND-LICENSES.md). All evaluation questions are synthetic. No real pilgrim conversation or personal data is used anywhere.

What existed before the build window is disclosed in [docs/BASELINE.md](docs/BASELINE.md).

Code: MIT. Source texts: their publishers'.
