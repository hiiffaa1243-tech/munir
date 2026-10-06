// Locked terminology base. Sharia terms never go through free machine translation:
// they are masked before translation and restored from this table afterwards.
// v2: each entry was looked up in the approved dictionary of Sharia terms (Jamhara, islamic-content.com/dictionary),
// the terminology reference named in the challenge's scientific annex. `jamhara` is the entry consulted and
// `checked` lists the languages where our rendering agrees with it or was taken from it. The dictionary covers
// English for most Hajj terms and Urdu, Indonesian and French for some; where it is silent the rendering is the
// team's and stays marked as not yet reviewed. One deliberate difference: for "Dam" the dictionary entry is the
// general word (blood), while the Hajj sense is a compensatory sacrifice, so the literal rendering stays forbidden.
// v3: Hindi and Chinese renderings were taken from the approved Hindi and Chinese books in the library (the form those
// books use most); a few terms the books do not use carry the standard rendering and await review.
export interface Term {
  tid: string;                // term identifier
  en: string;                 // canonical English form
  variants: string[];         // spellings found in English sources (regex fragments, case-insensitive)
  ar: string; ur: string; id: string; fr: string;
  hi?: string; zh?: string;   // Hindi and Chinese renderings, taken from the approved books in those languages
  tr?: string; bn?: string;   // beta languages
  gloss?: Partial<Record<'en' | 'ar' | 'ur' | 'id' | 'fr', string>>; // short explanation on first mention
  forbid?: Partial<Record<'en' | 'ur' | 'id' | 'fr', string[]>>;     // renderings that must never appear
  jamhara?: number;           // entry consulted in the approved dictionary of Sharia terms (islamic-content.com/dictionary/word/<id>)
  checked?: string[];         // languages in which our rendering agrees with, or was taken from, that entry
  reviewed: boolean;          // true when at least one target language beyond English was confirmed against the dictionary
}

const A = "[’‘'`ʿʻ]?"; // optional apostrophe-like mark used in transliteration
const Q = "[’‘'`ʿʻ]";  // required apostrophe-like mark

export const GLOSSARY: Term[] = [
  { tid: 'T01', hi: 'तवाफ़-ए-इफ़ाज़ा', zh: '转场环游', en: 'Tawaf al-Ifadah', variants: [`taw(?:aa|[aā])f\\s+al[- ]if(?:aa|[aā])[dḍ]ah?`, `taw(?:aa|[aā])f\\s+(?:al[- ])?ziy(?:aa|[aā])rah?`], ar: 'طواف الإفاضة', ur: 'طوافِ افاضہ', id: 'tawaf ifadah', fr: 'tawaf al-ifada', tr: 'ifâda tavafı', bn: 'তাওয়াফে ইফাদা',
    gloss: { en: 'the obligatory tawaf of Hajj after Arafah', ar: 'طواف الركن بعد عرفة', ur: 'حج کا فرض طواف', id: 'tawaf rukun haji setelah Arafah', fr: 'le tawaf obligatoire du Hajj après Arafat' }, jamhara: 6627, checked: ['en'], reviewed: false },
  { tid: 'T02', hi: 'तवाफ़-ए-विदा', zh: '辞别环游', en: 'Farewell Tawaf', variants: [`taw(?:aa|[aā])f\\s+al[- ]wad(?:aa|[aā])${A}`, `farewell\\s+taw(?:aa|[aā])f`, `taw(?:aa|[aā])f\\s+of\\s+farewell`], ar: 'طواف الوداع', ur: 'طوافِ وداع', id: 'tawaf wada', fr: "tawaf d'adieu", tr: 'veda tavafı', bn: 'বিদায়ী তাওয়াফ', reviewed: false },
  { tid: 'T03', hi: 'तवाफ़-ए-क़ुदूम', zh: '初访环游', en: 'Arrival Tawaf', variants: [`taw(?:aa|[aā])f\\s+al[- ]qud(?:oo|[uū])m`, `arrival\\s+taw(?:aa|[aā])f`, `taw(?:aa|[aā])f\\s+of\\s+arrival`], ar: 'طواف القدوم', ur: 'طوافِ قدوم', id: 'tawaf qudum', fr: "tawaf d'arrivée", tr: 'kudüm tavafı', bn: 'তাওয়াফে কুদুম', jamhara: 6629, checked: ['en'], reviewed: false },
  { tid: 'T04', hi: 'तवाफ़', zh: '环游', en: 'Tawaf', variants: [`[tṭ]aw(?:aa|[aā])f`], ar: 'الطواف', ur: 'طواف', id: 'tawaf', fr: 'tawaf', tr: 'tavaf', bn: 'তাওয়াফ',
    gloss: { en: 'circling the Kaaba seven times', fr: 'les sept tours autour de la Kaaba', id: 'mengelilingi Ka’bah tujuh kali', ur: 'کعبہ کے گرد سات چکر' }, forbid: { fr: ['circumambulation rituelle païenne'] }, jamhara: 6630, checked: ['en'], reviewed: false },
  { tid: 'T05', hi: 'इहराम', zh: '受戒', en: 'Ihram', variants: [`i[hḥ]r(?:aa|[aā])m`], ar: 'الإحرام', ur: 'احرام', id: 'ihram', fr: 'ihram', tr: 'ihram', bn: 'ইহরাম',
    gloss: { en: 'the sacred state entered for Hajj or Umrah', ar: 'نية الدخول في النسك', ur: 'حج یا عمرہ کی نیت سے مخصوص حالت', id: 'keadaan suci untuk haji atau umrah', fr: "l'état de sacralisation pour le Hajj ou la Omra" },
    forbid: { en: ['consecration'], fr: ['consécration', 'interdiction rituelle'] }, jamhara: 341, checked: ['en', 'ur', 'id'], reviewed: true },
  { tid: 'T06', hi: 'मुहरिम', zh: '受戒者', en: 'Muhrim', variants: [`mu[hḥ]rim(?:ah|s)?`], ar: 'المُحرِم', ur: 'مُحرِم', id: 'orang yang berihram', fr: 'pèlerin en état d’ihram', tr: 'ihramlı', bn: 'ইহরামকারী', reviewed: false },
  { tid: 'T07', hi: 'मीक़ात', zh: '戒关', en: 'Miqat', variants: [`m(?:ee|[iī])q(?:aa|[aā])ts?`, `maw(?:aa|[aā])q(?:ee|[iī])t`], ar: 'الميقات', ur: 'میقات', id: 'miqat', fr: 'miqat', tr: 'mikat', bn: 'মীকাত',
    gloss: { en: 'the boundary where ihram must begin', ar: 'موضع الإحرام', ur: 'وہ مقام جہاں سے احرام باندھا جاتا ہے', id: 'batas tempat memulai ihram', fr: "la limite où l'on doit entrer en ihram" }, jamhara: 10191, checked: ['en'], reviewed: false },
  { tid: 'T08', hi: 'तलबिया', zh: '应召词', en: 'Talbiyah', variants: [`talbiy(?:ah|a)`], ar: 'التلبية', ur: 'تلبیہ', id: 'talbiyah', fr: 'talbiya', tr: 'telbiye', bn: 'তালবিয়া', jamhara: 3360, checked: ['en'], reviewed: false },
  { tid: 'T09', hi: 'सई', zh: '奔走', en: "Sa'i", variants: [`sa${Q}[iy]{1,2}`, `sa${A}ee`, `sa${Q}yi`], ar: 'السعي', ur: 'سعی', id: "sa'i", fr: "sa'y", tr: "sa'y", bn: 'সাঈ',
    gloss: { en: 'walking seven times between Safa and Marwah', fr: 'les sept trajets entre Safa et Marwa', id: 'berjalan tujuh kali antara Shafa dan Marwah', ur: 'صفا اور مروہ کے درمیان سات چکر' }, jamhara: 5601, checked: ['en'], reviewed: false },
  { tid: 'T10', hi: 'सफ़ा', zh: '萨法', en: 'Safa', variants: [`(?:a[sṣ][- ])?[sṣ]af(?:aa|[aā])`], ar: 'الصفا', ur: 'صفا', id: 'Shafa', fr: 'Safa', tr: 'Safa', bn: 'সাফা', jamhara: 6283, checked: ['en', 'fr', 'ur', 'id'], reviewed: true },
  { tid: 'T11', hi: 'मर्वा', zh: '麦尔沃', en: 'Marwah', variants: [`(?:al[- ])?marwah?`], ar: 'المروة', ur: 'مروہ', id: 'Marwah', fr: 'Marwa', tr: 'Merve', bn: 'মারওয়া', jamhara: 9331, checked: ['en'], reviewed: false },
  { tid: 'T12', hi: 'सिर मुंडवाना', zh: '剃发', en: 'shaving the head', variants: [`[hḥ]alq`], ar: 'الحلق', ur: 'حلق', id: 'halq (mencukur habis)', fr: 'rasage de la tête (halq)', tr: 'halk (tıraş)', bn: 'হালক (মাথা মুণ্ডন)', jamhara: 4471, checked: ['en'], reviewed: false },
  { tid: 'T13', hi: 'बाल छोटे करवाना', zh: '剪发', en: 'shortening the hair', variants: [`taq[sṣ](?:ee|[iī])r`], ar: 'التقصير', ur: 'تقصیر', id: 'taqshir (memendekkan rambut)', fr: 'raccourcissement des cheveux (taqsir)', tr: 'taksir (saç kısaltma)', bn: 'তাকসীর (চুল ছোট করা)', reviewed: false },
  { tid: 'T14', hi: 'हलाल होना (तहल्लुल)', zh: '开戒', en: 'Tahallul', variants: [`ta[hḥ]allul`], ar: 'التحلل', ur: 'تحلل (احرام سے نکلنا)', id: 'tahalul', fr: 'tahallul (désacralisation)', tr: 'tahallül', bn: 'তাহাল্লুল',
    gloss: { en: 'exiting the state of ihram', id: 'keluar dari keadaan ihram', fr: "la sortie de l'état d'ihram" }, jamhara: 2509, checked: ['en'], reviewed: false },
  { tid: 'T15', hi: 'फ़िद्या', zh: '罚赎', en: 'Fidyah', variants: [`fidya[h]?`], ar: 'الفدية', ur: 'فدیہ', id: 'fidyah', fr: 'fidya', tr: 'fidye', bn: 'ফিদইয়া',
    gloss: { en: 'a compensation: fasting, feeding the poor, or a sacrifice', ar: 'صيام أو صدقة أو نسك', ur: 'کفارہ: روزے، صدقہ یا قربانی', id: 'tebusan: puasa, memberi makan, atau menyembelih', fr: 'une compensation : jeûne, aumône ou sacrifice' },
    forbid: { en: ['ransom'], fr: ['rançon'] }, jamhara: 7411, checked: ['en'], reviewed: false },
  { tid: 'T16', hi: 'दम', zh: '罚赎羊', en: 'Dam', variants: [`dam+`], ar: 'الدم', ur: 'دم', id: 'dam', fr: 'dam', tr: 'dem', bn: 'দম',
    gloss: { en: 'an expiatory sacrifice of a sheep', ar: 'ذبح شاة جبراناً', ur: 'ایک بکری کی قربانی بطورِ کفارہ', id: 'menyembelih seekor kambing sebagai denda', fr: "le sacrifice expiatoire d'un mouton" },
    forbid: { en: ['blood'], ur: ['خون'], id: ['darah'], fr: ['sang'] }, jamhara: 4934, checked: [], reviewed: false },
  { tid: 'T17', hi: 'हद्य', zh: '献牲', en: 'Hady', variants: [`had[iy]{1,2}`, `hadee`], ar: 'الهدي', ur: 'ہدی', id: 'hadyu', fr: 'hady', tr: 'hedy', bn: 'হাদী',
    gloss: { en: 'the sacrificial animal offered in Hajj', id: 'hewan sembelihan haji', fr: "l'offrande sacrificielle du Hajj", ur: 'حج کی قربانی کا جانور' }, jamhara: 10693, checked: [], reviewed: false },
  { tid: 'T18', hi: 'क़ुर्बानी', zh: '宰牲节的献牲', en: 'Udhiyah', variants: [`${A}u[dḍ]${A}[hḥ]iy+a[h]?`], ar: 'الأضحية', ur: 'قربانی کا جانور', id: 'hewan kurban', fr: 'sacrifice de l’Aïd (oudhiya)', tr: 'kurban', bn: 'কুরবানী', jamhara: 1217, checked: ['en', 'ur', 'id'], reviewed: true },
  { tid: 'T19', hi: 'अरफ़ा में ठहरना (वुक़ूफ़)', zh: '驻阿拉法特', en: 'standing at Arafah', variants: [`wuq(?:oo|[uū])f`], ar: 'الوقوف بعرفة', ur: 'وقوفِ عرفہ', id: 'wukuf', fr: 'station à Arafat (wouqouf)', tr: 'vakfe', bn: 'উকূফ', reviewed: false },
  { tid: 'T20', hi: 'अरफ़ा', zh: '阿拉法特', en: 'Arafah', variants: [`${A}araf(?:aat|āt|ah|at|a)`], ar: 'عرفة', ur: 'عرفات', id: 'Arafah', fr: 'Arafat', tr: 'Arafat', bn: 'আরাফা', jamhara: 6847, checked: ['en', 'fr', 'ur', 'id'], reviewed: true },
  { tid: 'T21', hi: 'मुज़्दलिफ़ा', zh: '穆兹代里法', en: 'Muzdalifah', variants: [`muzdalifa[h]?`], ar: 'مزدلفة', ur: 'مزدلفہ', id: 'Muzdalifah', fr: 'Muzdalifah', tr: 'Müzdelife', bn: 'মুযদালিফা', jamhara: 9347, checked: ['en', 'fr', 'ur', 'id'], reviewed: true },
  { tid: 'T22', hi: 'मिना', zh: '米纳', en: 'Mina', variants: [`min(?:aa|[aā])`], ar: 'منى', ur: 'منیٰ', id: 'Mina', fr: 'Mina', tr: 'Mina', bn: 'মিনা', jamhara: 10136, checked: ['en'], reviewed: false },
  { tid: 'T23', hi: 'जमरा-ए-अक़बा', zh: '阿格白石柱', en: 'Jamrat al-Aqabah', variants: [`jamrat\\s+al[- ]${A}aqaba[h]?`], ar: 'جمرة العقبة', ur: 'جمرہ عقبہ', id: 'jamrah Aqabah', fr: 'Jamrat al-Aqaba', tr: 'Akabe cemresi', bn: 'জামরাতুল আকাবা', jamhara: 3864, checked: ['en'], reviewed: false },
  { tid: 'T24', hi: 'जमरात', zh: '石柱', en: 'Jamarat', variants: [`jam(?:aa|[aā])r(?:aa|[aā])t`, `jamrah?s?`], ar: 'الجمرات', ur: 'جمرات', id: 'jamrah', fr: 'jamarat', tr: 'cemreler', bn: 'জামারাত',
    gloss: { en: 'the three stone pillars at Mina', id: 'tiga tugu di Mina', fr: 'les trois stèles de Mina', ur: 'منیٰ کے تین ستون' }, jamhara: 3852, checked: ['en', 'id'], reviewed: true },
  { tid: 'T25', hi: 'कंकड़ी मारना', zh: '打石', en: 'stoning', variants: [`ram[iy]{1,2}`], ar: 'الرمي', ur: 'رمی', id: 'melontar jumrah', fr: 'lapidation des stèles', tr: 'şeytan taşlama', bn: 'রমী (কংকর নিক্ষেপ)', jamhara: 5299, checked: ['en'], reviewed: false },
  { tid: 'T26', hi: 'तमत्तुअ', zh: '享受朝', en: "Tamattu'", variants: [`tamat+u${A}`], ar: 'التمتع', ur: 'تمتع', id: "tamattu'", fr: "tamattou'", tr: 'temettu', bn: 'তামাত্তু',
    gloss: { en: 'Umrah then Hajj in the same season with a break between', id: 'umrah lalu haji dalam satu musim', fr: 'Omra puis Hajj dans la même saison' }, jamhara: 3406, checked: ['en'], reviewed: false },
  { tid: 'T27', hi: 'क़िरान', zh: '连朝', en: 'Qiran', variants: [`qir(?:aa|[aā])n`], ar: 'القِران', ur: 'قِران', id: 'qiran', fr: 'qiran', tr: 'kıran', bn: 'কিরান', jamhara: 7772, checked: ['en'], reviewed: false },
  { tid: 'T28', hi: 'इफ़राद', zh: '单朝', en: 'Ifrad', variants: [`ifr(?:aa|[aā])d`], ar: 'الإفراد', ur: 'افراد', id: 'ifrad', fr: 'ifrad', tr: 'ifrad', bn: 'ইফরাদ', reviewed: false },
  { tid: 'T29', hi: 'उमरा', zh: '副朝', en: 'Umrah', variants: [`${A}umra[h]?`], ar: 'العمرة', ur: 'عمرہ', id: 'umrah', fr: 'Omra', tr: 'umre', bn: 'উমরাহ', gloss: { fr: 'le petit pèlerinage' }, forbid: { fr: ['pèlerinage païen'] }, jamhara: 7144, checked: ['en', 'fr', 'id'], reviewed: true },
  { tid: 'T30', hi: 'हज्ज', zh: '朝觐', en: 'Hajj', variants: [`[hḥ]ajj`], ar: 'الحج', ur: 'حج', id: 'haji', fr: 'Hajj', tr: 'hac', bn: 'হজ', jamhara: 4049, checked: ['en'], reviewed: false },
  { tid: 'T31', hi: 'रुक्न', zh: '要素', en: 'pillar (rukn)', variants: [`rukn`, `ark(?:aa|[aā])n`], ar: 'الركن', ur: 'رکن', id: 'rukun', fr: 'pilier (roukn)', tr: 'rükün', bn: 'রুকন', reviewed: false },
  { tid: 'T32', hi: 'वाजिब', zh: '主命', en: 'obligatory act (wajib)', variants: [`w(?:aa|[aā])jib(?:(?:aa|[aā])t)?`], ar: 'الواجب', ur: 'واجب', id: 'wajib', fr: 'obligation (wajib)', tr: 'vacip', bn: 'ওয়াজিব', jamhara: 10746, checked: ['en'], reviewed: false },
  { tid: 'T33', hi: 'सुन्नत', zh: '圣行', en: 'Sunnah', variants: [`sunna[h]?`], ar: 'السنة', ur: 'سنت', id: 'sunnah', fr: 'sunna', tr: 'sünnet', bn: 'সুন্নাহ', jamhara: 5747, checked: [], reviewed: false },
  { tid: 'T34', hi: 'महरम', zh: '至亲', en: 'Mahram', variants: [`ma[hḥ]ram`], ar: 'المَحرَم', ur: 'محرم', id: 'mahram', fr: 'mahram', tr: 'mahrem', bn: 'মাহরাম', gloss: { fr: 'proche parent avec lequel le mariage est interdit', ur: 'وہ مرد جس سے نکاح جائز نہ ہو' }, jamhara: 8995, checked: ['en', 'fr', 'ur', 'id'], reviewed: true },
  { tid: 'T35', hi: 'इज़्तिबा', zh: '袒露右肩', en: "Idtiba'", variants: [`i[dḍ][tṭ]ib(?:aa|[aā])${A}`], ar: 'الاضطباع', ur: 'اضطباع', id: "idhtiba'", fr: "idtiba'", tr: 'ıztıba', bn: 'ইযতিবা',
    gloss: { en: 'uncovering the right shoulder during tawaf', id: 'membuka bahu kanan saat tawaf', fr: "découvrir l'épaule droite pendant le tawaf", ur: 'طواف میں دایاں کندھا کھولنا' }, jamhara: 1221, checked: ['en', 'fr', 'ur', 'id'], reviewed: true },
  { tid: 'T36', hi: 'रमल', zh: '疾走', en: 'Raml', variants: [`raml`], ar: 'الرَّمَل', ur: 'رمل', id: 'raml (lari kecil)', fr: 'raml (marche rapide)', tr: 'remel', bn: 'রমল', jamhara: 5297, checked: ['en', 'id'], reviewed: true },
  { tid: 'T37', hi: 'हजर-ए-असवद', zh: '黑石', en: 'the Black Stone', variants: [`black\\s+stone`, `[hḥ]ajar\\s+al[- ]aswad`], ar: 'الحجر الأسود', ur: 'حجرِ اسود', id: 'Hajar Aswad', fr: 'Pierre noire', tr: 'Hacerülesved', bn: 'হাজরে আসওয়াদ', jamhara: 4073, checked: ['en', 'fr', 'ur', 'id'], reviewed: true },
  { tid: 'T38', hi: 'रुक्न-ए-यमानी', zh: '也门角', en: 'the Yemeni Corner', variants: [`yeme?ni\\s+corner`, `rukn\\s+al[- ]yam(?:aa|[aā])n(?:ee|[iī])`], ar: 'الركن اليماني', ur: 'رکنِ یمانی', id: 'Rukun Yamani', fr: 'Coin yéménite', tr: 'Rükn-i Yemânî', bn: 'রুকনে ইয়ামানী', jamhara: 5287, checked: ['en'], reviewed: false },
  { tid: 'T39', hi: 'मक़ाम-ए-इब्राहीम', zh: '伊布拉欣站立处', en: 'Maqam Ibrahim', variants: [`maq(?:aa|[aā])m\\s+(?:of\\s+)?ibr(?:aa|[aā])h(?:ee|[iī])m`, `station\\s+of\\s+(?:ibr(?:aa|[aā])h(?:ee|[iī])m|abraham)`], ar: 'مقام إبراهيم', ur: 'مقامِ ابراہیم', id: 'Maqam Ibrahim', fr: 'maqam Ibrahim', tr: 'Makam-ı İbrahim', bn: 'মাকামে ইবরাহীম', jamhara: 9868, checked: ['en'], reviewed: false },
  { tid: 'T40', hi: 'हिज्र (हतीम)', zh: '短围墙', en: 'the Hijr', variants: [`[hḥ]ijr(?:\\s+ism(?:aa|[aā])${A}?(?:ee|[iī])l)?`, `[hḥ]a[tṭ](?:ee|[iī])m`], ar: 'الحِجر', ur: 'حطیم', id: 'Hijr Ismail', fr: "Hijr d'Ismaël", tr: 'Hicr', bn: 'হাতীম', jamhara: 4355, checked: ['en'], reviewed: false },
  { tid: 'T41', hi: 'अय्याम-ए-तशरीक़', zh: '晒干肉日', en: 'the Days of Tashriq', variants: [`(?:days?\\s+of\\s+)?tashr(?:ee|[iī])q`, `ayy(?:aa|[aā])m\\s+(?:al|at)[- ]tashr(?:ee|[iī])q`], ar: 'أيام التشريق', ur: 'ایامِ تشریق', id: 'hari-hari Tasyriq', fr: 'jours de Tachriq', tr: 'teşrik günleri', bn: 'আইয়ামে তাশরীক',
    gloss: { en: '11th, 12th and 13th of Dhul-Hijjah', id: '11, 12, dan 13 Zulhijah', fr: 'les 11, 12 et 13 Dhoul-Hijja', ur: '11، 12 اور 13 ذوالحجہ' }, jamhara: 1901, checked: ['en'], reviewed: false },
  { tid: 'T42', hi: 'यौम-ए-तर्विया', zh: '饮驼日', en: 'the Day of Tarwiyah', variants: [`(?:day\\s+of\\s+)?tarwiya[h]?`], ar: 'يوم التروية', ur: 'یومِ ترویہ', id: 'hari Tarwiyah', fr: 'jour de Tarwiya', tr: 'terviye günü', bn: 'ইয়াওমুত তারবিয়া',
    gloss: { en: 'the 8th of Dhul-Hijjah', id: '8 Zulhijah', fr: 'le 8 Dhoul-Hijja', ur: '8 ذوالحجہ' }, jamhara: 11208, checked: ['en'], reviewed: false },
  { tid: 'T43', hi: 'क़ुर्बानी का दिन', zh: '宰牲日', en: 'the Day of Sacrifice', variants: [`day\\s+of\\s+(?:na[hḥ]r|sacrifice)`, `yawm\\s+(?:al|an)[- ]na[hḥ]r`], ar: 'يوم النحر', ur: 'یومِ نحر', id: 'hari Nahar', fr: 'jour du Sacrifice', tr: 'kurban günü', bn: 'ইয়াওমুন নাহর',
    gloss: { en: 'the 10th of Dhul-Hijjah', id: 'Hari Raya Kurban, 10 Zulhijah', fr: 'le 10 Dhoul-Hijja', ur: '10 ذوالحجہ' }, jamhara: 11210, checked: ['en', 'ur', 'id'], reviewed: true },
  { tid: 'T44', hi: 'इहसार', zh: '受阻', en: 'Ihsar', variants: [`i[hḥ][sṣ](?:aa|[aā])r`, `mu[hḥ][sṣ]ar`], ar: 'الإحصار', ur: 'احصار', id: 'ihshar', fr: 'ihsar (empêchement)', tr: 'ihsâr', bn: 'ইহসার',
    gloss: { en: 'being prevented from completing the rites', id: 'terhalang menyelesaikan manasik', fr: "être empêché d'achever les rites", ur: 'مناسک مکمل کرنے سے روک دیا جانا' }, reviewed: false },
  { tid: 'T45', hi: 'नीयत', zh: '举意', en: 'intention (niyyah)', variants: [`niy+a[ht]?`], ar: 'النية', ur: 'نیت', id: 'niat', fr: 'intention (niyya)', tr: 'niyet', bn: 'নিয়ত', jamhara: 10653, checked: ['en'], reviewed: false },
  { tid: 'T46', hi: 'वुज़ू', zh: '小净', en: 'Wudu', variants: [`wu[dḍ](?:oo|[uū])${A}?`], ar: 'الوضوء', ur: 'وضو', id: 'wudu', fr: 'ablutions (woudou)', tr: 'abdest', bn: 'অযু', jamhara: 10922, checked: ['en', 'fr', 'ur', 'id'], reviewed: true },
  { tid: 'T47', hi: 'स्नान (ग़ुस्ल)', zh: '大净', en: 'Ghusl', variants: [`ghusl`], ar: 'الغُسل', ur: 'غسل', id: 'mandi wajib (ghusl)', fr: 'grandes ablutions (ghousl)', tr: 'gusül', bn: 'গোসল', jamhara: 7292, checked: ['en', 'fr', 'ur', 'id'], reviewed: true },
  { tid: 'T48', hi: 'ज़ुल-हिज्जा', zh: '伊历十二月', en: 'Dhul-Hijjah', variants: [`dh(?:oo|[uū])l?[- ]?[hḥ]ijja[h]?`, `zul[- ]?hijja[h]?`], ar: 'ذو الحجة', ur: 'ذوالحجہ', id: 'Zulhijah', fr: 'Dhoul-Hijja', tr: 'Zilhicce', bn: 'যিলহজ', reviewed: false },
  { tid: 'T49', hi: 'ज़मज़म', zh: '渗渗泉', en: 'Zamzam', variants: [`zamzam`], ar: 'زمزم', ur: 'زمزم', id: 'Zamzam', fr: 'Zamzam', tr: 'Zemzem', bn: 'যমযম', jamhara: 5424, checked: ['en'], reviewed: false },
  { tid: 'T50', hi: 'काबा', zh: '天房', en: 'the Kaaba', variants: [`ka${A}a?ba[h]?`], ar: 'الكعبة', ur: 'کعبہ', id: "Ka'bah", fr: 'Kaaba', tr: 'Kâbe', bn: 'কাবা', jamhara: 8189, checked: ['en'], reviewed: false },
  { tid: 'T52', hi: 'तनईम', zh: '坦伊姆', en: "Tan'im", variants: [`tan${A}(?:ee|[iī])m`], ar: 'التنعيم', ur: 'تنعیم', id: "Tan'im", fr: "Tan'im", tr: "Ten'îm", bn: 'তানঈম', jamhara: 3465, checked: ['en', 'ur', 'id'], reviewed: true },
  { tid: 'T53', hi: 'मुल्तज़म', zh: '穆勒台宰姆', en: 'Multazam', variants: [`multazam`], ar: 'الملتزم', ur: 'ملتزم', id: 'Multazam', fr: 'Moultazam', tr: 'Mültezem', bn: 'মুলতাযাম', jamhara: 9964, checked: ['en'], reviewed: false },
  { tid: 'T54', hi: 'कफ़्फ़ारा', zh: '赎罪', en: 'expiation (kaffarah)', variants: [`kaff(?:aa|[aā])ra[h]?`], ar: 'الكفارة', ur: 'کفارہ', id: 'kafarat', fr: 'expiation (kaffara)', tr: 'kefaret', bn: 'কাফফারা', reviewed: false },
  { tid: 'T55', hi: 'इहराम की अवस्था में निषिद्ध चीज़ें', zh: '受戒期间的禁忌事项', en: 'prohibitions of ihram', variants: [`ma[hḥ][zẓdḍ](?:oo|[uū])r(?:aa|[aā])t\\s+al[- ]i[hḥ]r(?:aa|[aā])m`], ar: 'محظورات الإحرام', ur: 'ممنوعاتِ احرام', id: 'larangan ihram', fr: "interdits de l'ihram", tr: 'ihram yasakları', bn: 'ইহরামের নিষিদ্ধ বিষয়', jamhara: 9006, checked: ['en'], reviewed: false },
  { tid: 'T56', hi: 'तौहीद', zh: '认主独一', en: 'Tawhid', variants: [`taw[hḥ](?:ee|[iī])d`], ar: 'التوحيد', ur: 'توحید', id: 'tauhid', fr: 'tawhid', tr: 'tevhid', bn: 'তাওহীদ',
    gloss: { en: 'singling out Allah in worship', fr: "l'unicité d'Allah dans l'adoration", id: 'mengesakan Allah dalam ibadah', ur: 'عبادت میں اللہ کو ایک ماننا' }, reviewed: false },
  { tid: 'T57', hi: 'फ़तवा', zh: '法特瓦', en: 'Fatwa', variants: [`fatw(?:aa|[aā])s?`, `fat(?:aa|[aā])w(?:aa|[aā])`], ar: 'الفتوى', ur: 'فتویٰ', id: 'fatwa', fr: 'fatwa', tr: 'fetva', bn: 'ফতোয়া', jamhara: 7399, checked: ['en', 'ur'], reviewed: true },
  { tid: 'T58', hi: 'हदीस', zh: '圣训', en: 'Hadith', variants: [`[hḥ]ad(?:ee|[iī])th`, `a[hḥ](?:aa|[aā])d(?:ee|[iī])th`], ar: 'الحديث', ur: 'حدیث', id: 'hadis', fr: 'hadith', tr: 'hadis', bn: 'হাদীস', reviewed: false },
  { tid: 'T59', hi: 'क़िब्ला', zh: '朝向', en: 'Qiblah', variants: [`qibla[h]?`], ar: 'القبلة', ur: 'قبلہ', id: 'kiblat', fr: 'qibla', tr: 'kıble', bn: 'কিবলা', reviewed: false },
  { tid: 'T60', hi: 'रात बिताना', zh: '夜宿', en: 'Mabit', variants: [`mab(?:ee|[iī])t`], ar: 'المبيت', ur: 'مبیت (رات گزارنا)', id: 'mabit (bermalam)', fr: 'nuitée (mabit)', tr: 'mebît (geceleme)', bn: 'মাবীত (রাত্রিযাপন)', jamhara: 8718, checked: ['en'], reviewed: false },
];

export const GLOSSARY_VERSION = 'v3-books';
