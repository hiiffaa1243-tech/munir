// Locked terminology base. Sharia terms never go through free machine translation:
// they are masked before translation and restored from this table afterwards.
// v1 seed, built for the five launch languages. Each entry is versioned and is meant to be
// reviewed against the Jamhara dictionary (islamic-content.com/dictionary) named in the
// challenge's scientific annex; `reviewed` records that status honestly.
export interface Term {
  tid: string;                // term identifier
  en: string;                 // canonical English form
  variants: string[];         // spellings found in English sources (regex fragments, case-insensitive)
  ar: string; ur: string; id: string; fr: string;
  tr?: string; bn?: string;   // beta languages
  gloss?: Partial<Record<'en' | 'ar' | 'ur' | 'id' | 'fr', string>>; // short explanation on first mention
  forbid?: Partial<Record<'en' | 'ur' | 'id' | 'fr', string[]>>;     // renderings that must never appear
  reviewed: boolean;
}

const A = "[’‘'`ʿʻ]?"; // optional apostrophe-like mark used in transliteration
const Q = "[’‘'`ʿʻ]";  // required apostrophe-like mark

export const GLOSSARY: Term[] = [
  { tid: 'T01', en: 'Tawaf al-Ifadah', variants: [`taw(?:aa|[aā])f\\s+al[- ]if(?:aa|[aā])[dḍ]ah?`, `taw(?:aa|[aā])f\\s+(?:al[- ])?ziy(?:aa|[aā])rah?`], ar: 'طواف الإفاضة', ur: 'طوافِ افاضہ', id: 'tawaf ifadah', fr: 'tawaf al-ifada', tr: 'ifâda tavafı', bn: 'তাওয়াফে ইফাদা',
    gloss: { en: 'the obligatory tawaf of Hajj after Arafah', ar: 'طواف الركن بعد عرفة', ur: 'حج کا فرض طواف', id: 'tawaf rukun haji setelah Arafah', fr: 'le tawaf obligatoire du Hajj après Arafat' }, reviewed: false },
  { tid: 'T02', en: 'Farewell Tawaf', variants: [`taw(?:aa|[aā])f\\s+al[- ]wad(?:aa|[aā])${A}`, `farewell\\s+taw(?:aa|[aā])f`, `taw(?:aa|[aā])f\\s+of\\s+farewell`], ar: 'طواف الوداع', ur: 'طوافِ وداع', id: 'tawaf wada', fr: "tawaf d'adieu", tr: 'veda tavafı', bn: 'বিদায়ী তাওয়াফ', reviewed: false },
  { tid: 'T03', en: 'Arrival Tawaf', variants: [`taw(?:aa|[aā])f\\s+al[- ]qud(?:oo|[uū])m`, `arrival\\s+taw(?:aa|[aā])f`, `taw(?:aa|[aā])f\\s+of\\s+arrival`], ar: 'طواف القدوم', ur: 'طوافِ قدوم', id: 'tawaf qudum', fr: "tawaf d'arrivée", tr: 'kudüm tavafı', bn: 'তাওয়াফে কুদুম', reviewed: false },
  { tid: 'T04', en: 'Tawaf', variants: [`[tṭ]aw(?:aa|[aā])f`], ar: 'الطواف', ur: 'طواف', id: 'tawaf', fr: 'tawaf', tr: 'tavaf', bn: 'তাওয়াফ',
    gloss: { en: 'circling the Kaaba seven times', fr: 'les sept tours autour de la Kaaba', id: 'mengelilingi Ka’bah tujuh kali', ur: 'کعبہ کے گرد سات چکر' }, forbid: { fr: ['circumambulation rituelle païenne'] }, reviewed: false },
  { tid: 'T05', en: 'Ihram', variants: [`i[hḥ]r(?:aa|[aā])m`], ar: 'الإحرام', ur: 'احرام', id: 'ihram', fr: 'ihram', tr: 'ihram', bn: 'ইহরাম',
    gloss: { en: 'the sacred state entered for Hajj or Umrah', ar: 'نية الدخول في النسك', ur: 'حج یا عمرہ کی نیت سے مخصوص حالت', id: 'keadaan suci untuk haji atau umrah', fr: "l'état de sacralisation pour le Hajj ou la Omra" },
    forbid: { en: ['consecration'], fr: ['consécration', 'interdiction rituelle'] }, reviewed: false },
  { tid: 'T06', en: 'Muhrim', variants: [`mu[hḥ]rim(?:ah|s)?`], ar: 'المُحرِم', ur: 'مُحرِم', id: 'orang yang berihram', fr: 'pèlerin en état d’ihram', tr: 'ihramlı', bn: 'ইহরামকারী', reviewed: false },
  { tid: 'T07', en: 'Miqat', variants: [`m(?:ee|[iī])q(?:aa|[aā])ts?`, `maw(?:aa|[aā])q(?:ee|[iī])t`], ar: 'الميقات', ur: 'میقات', id: 'miqat', fr: 'miqat', tr: 'mikat', bn: 'মীকাত',
    gloss: { en: 'the boundary where ihram must begin', ar: 'موضع الإحرام', ur: 'وہ مقام جہاں سے احرام باندھا جاتا ہے', id: 'batas tempat memulai ihram', fr: "la limite où l'on doit entrer en ihram" }, reviewed: false },
  { tid: 'T08', en: 'Talbiyah', variants: [`talbiy(?:ah|a)`], ar: 'التلبية', ur: 'تلبیہ', id: 'talbiyah', fr: 'talbiya', tr: 'telbiye', bn: 'তালবিয়া', reviewed: false },
  { tid: 'T09', en: "Sa'i", variants: [`sa${Q}[iy]{1,2}`, `sa${A}ee`, `sa${Q}yi`], ar: 'السعي', ur: 'سعی', id: "sa'i", fr: "sa'y", tr: "sa'y", bn: 'সাঈ',
    gloss: { en: 'walking seven times between Safa and Marwah', fr: 'les sept trajets entre Safa et Marwa', id: 'berjalan tujuh kali antara Shafa dan Marwah', ur: 'صفا اور مروہ کے درمیان سات چکر' }, reviewed: false },
  { tid: 'T10', en: 'Safa', variants: [`(?:a[sṣ][- ])?[sṣ]af(?:aa|[aā])`], ar: 'الصفا', ur: 'صفا', id: 'Shafa', fr: 'Safa', tr: 'Safa', bn: 'সাফা', reviewed: false },
  { tid: 'T11', en: 'Marwah', variants: [`(?:al[- ])?marwah?`], ar: 'المروة', ur: 'مروہ', id: 'Marwah', fr: 'Marwa', tr: 'Merve', bn: 'মারওয়া', reviewed: false },
  { tid: 'T12', en: 'shaving the head', variants: [`[hḥ]alq`], ar: 'الحلق', ur: 'حلق', id: 'halq (mencukur habis)', fr: 'rasage de la tête (halq)', tr: 'halk (tıraş)', bn: 'হালক (মাথা মুণ্ডন)', reviewed: false },
  { tid: 'T13', en: 'shortening the hair', variants: [`taq[sṣ](?:ee|[iī])r`], ar: 'التقصير', ur: 'تقصیر', id: 'taqshir (memendekkan rambut)', fr: 'raccourcissement des cheveux (taqsir)', tr: 'taksir (saç kısaltma)', bn: 'তাকসীর (চুল ছোট করা)', reviewed: false },
  { tid: 'T14', en: 'Tahallul', variants: [`ta[hḥ]allul`], ar: 'التحلل', ur: 'تحلل (احرام سے نکلنا)', id: 'tahalul', fr: 'tahallul (désacralisation)', tr: 'tahallül', bn: 'তাহাল্লুল',
    gloss: { en: 'exiting the state of ihram', id: 'keluar dari keadaan ihram', fr: "la sortie de l'état d'ihram" }, reviewed: false },
  { tid: 'T15', en: 'Fidyah', variants: [`fidya[h]?`], ar: 'الفدية', ur: 'فدیہ', id: 'fidyah', fr: 'fidya', tr: 'fidye', bn: 'ফিদইয়া',
    gloss: { en: 'a compensation: fasting, feeding the poor, or a sacrifice', ar: 'صيام أو صدقة أو نسك', ur: 'کفارہ: روزے، صدقہ یا قربانی', id: 'tebusan: puasa, memberi makan, atau menyembelih', fr: 'une compensation : jeûne, aumône ou sacrifice' },
    forbid: { en: ['ransom'], fr: ['rançon'] }, reviewed: false },
  { tid: 'T16', en: 'Dam', variants: [`dam+`], ar: 'الدم', ur: 'دم', id: 'dam', fr: 'dam', tr: 'dem', bn: 'দম',
    gloss: { en: 'an expiatory sacrifice of a sheep', ar: 'ذبح شاة جبراناً', ur: 'ایک بکری کی قربانی بطورِ کفارہ', id: 'menyembelih seekor kambing sebagai denda', fr: "le sacrifice expiatoire d'un mouton" },
    forbid: { en: ['blood'], ur: ['خون'], id: ['darah'], fr: ['sang'] }, reviewed: false },
  { tid: 'T17', en: 'Hady', variants: [`had[iy]{1,2}`, `hadee`], ar: 'الهدي', ur: 'ہدی', id: 'hadyu', fr: 'hady', tr: 'hedy', bn: 'হাদী',
    gloss: { en: 'the sacrificial animal offered in Hajj', id: 'hewan sembelihan haji', fr: "l'offrande sacrificielle du Hajj", ur: 'حج کی قربانی کا جانور' }, reviewed: false },
  { tid: 'T18', en: 'Udhiyah', variants: [`${A}u[dḍ]${A}[hḥ]iy+a[h]?`], ar: 'الأضحية', ur: 'قربانی', id: 'kurban', fr: 'sacrifice de l’Aïd (oudhiya)', tr: 'kurban', bn: 'কুরবানী', reviewed: false },
  { tid: 'T19', en: 'standing at Arafah', variants: [`wuq(?:oo|[uū])f`], ar: 'الوقوف بعرفة', ur: 'وقوفِ عرفہ', id: 'wukuf', fr: 'station à Arafat (wouqouf)', tr: 'vakfe', bn: 'উকূফ', reviewed: false },
  { tid: 'T20', en: 'Arafah', variants: [`${A}araf(?:aat|āt|ah|at|a)`], ar: 'عرفة', ur: 'عرفات', id: 'Arafah', fr: 'Arafat', tr: 'Arafat', bn: 'আরাফা', reviewed: false },
  { tid: 'T21', en: 'Muzdalifah', variants: [`muzdalifa[h]?`], ar: 'مزدلفة', ur: 'مزدلفہ', id: 'Muzdalifah', fr: 'Mouzdalifa', tr: 'Müzdelife', bn: 'মুযদালিফা', reviewed: false },
  { tid: 'T22', en: 'Mina', variants: [`min(?:aa|[aā])`], ar: 'منى', ur: 'منیٰ', id: 'Mina', fr: 'Mina', tr: 'Mina', bn: 'মিনা', reviewed: false },
  { tid: 'T23', en: 'Jamrat al-Aqabah', variants: [`jamrat\\s+al[- ]${A}aqaba[h]?`], ar: 'جمرة العقبة', ur: 'جمرہ عقبہ', id: 'jumrah Aqabah', fr: 'Jamrat al-Aqaba', tr: 'Akabe cemresi', bn: 'জামরাতুল আকাবা', reviewed: false },
  { tid: 'T24', en: 'Jamarat', variants: [`jam(?:aa|[aā])r(?:aa|[aā])t`, `jamrah?s?`], ar: 'الجمرات', ur: 'جمرات', id: 'jumrah', fr: 'jamarat', tr: 'cemreler', bn: 'জামারাত',
    gloss: { en: 'the three stone pillars at Mina', id: 'tiga tugu di Mina', fr: 'les trois stèles de Mina', ur: 'منیٰ کے تین ستون' }, reviewed: false },
  { tid: 'T25', en: 'stoning', variants: [`ram[iy]{1,2}`], ar: 'الرمي', ur: 'رمی', id: 'melontar jumrah', fr: 'lapidation des stèles', tr: 'şeytan taşlama', bn: 'রমী (কংকর নিক্ষেপ)', reviewed: false },
  { tid: 'T26', en: "Tamattu'", variants: [`tamat+u${A}`], ar: 'التمتع', ur: 'تمتع', id: "tamattu'", fr: "tamattou'", tr: 'temettu', bn: 'তামাত্তু',
    gloss: { en: 'Umrah then Hajj in the same season with a break between', id: 'umrah lalu haji dalam satu musim', fr: 'Omra puis Hajj dans la même saison' }, reviewed: false },
  { tid: 'T27', en: 'Qiran', variants: [`qir(?:aa|[aā])n`], ar: 'القِران', ur: 'قِران', id: 'qiran', fr: 'qiran', tr: 'kıran', bn: 'কিরান', reviewed: false },
  { tid: 'T28', en: 'Ifrad', variants: [`ifr(?:aa|[aā])d`], ar: 'الإفراد', ur: 'افراد', id: 'ifrad', fr: 'ifrad', tr: 'ifrad', bn: 'ইফরাদ', reviewed: false },
  { tid: 'T29', en: 'Umrah', variants: [`${A}umra[h]?`], ar: 'العمرة', ur: 'عمرہ', id: 'umrah', fr: 'Omra', tr: 'umre', bn: 'উমরাহ', forbid: { fr: ['petit pèlerinage païen'] }, reviewed: false },
  { tid: 'T30', en: 'Hajj', variants: [`[hḥ]ajj`], ar: 'الحج', ur: 'حج', id: 'haji', fr: 'Hajj', tr: 'hac', bn: 'হজ', reviewed: false },
  { tid: 'T31', en: 'pillar (rukn)', variants: [`rukn`, `ark(?:aa|[aā])n`], ar: 'الركن', ur: 'رکن', id: 'rukun', fr: 'pilier (roukn)', tr: 'rükün', bn: 'রুকন', reviewed: false },
  { tid: 'T32', en: 'obligatory act (wajib)', variants: [`w(?:aa|[aā])jib(?:(?:aa|[aā])t)?`], ar: 'الواجب', ur: 'واجب', id: 'wajib', fr: 'obligation (wajib)', tr: 'vacip', bn: 'ওয়াজিব', reviewed: false },
  { tid: 'T33', en: 'Sunnah', variants: [`sunna[h]?`], ar: 'السنة', ur: 'سنت', id: 'sunnah', fr: 'sounna', tr: 'sünnet', bn: 'সুন্নাহ', reviewed: false },
  { tid: 'T34', en: 'Mahram', variants: [`ma[hḥ]ram`], ar: 'المَحرَم', ur: 'محرم', id: 'mahram', fr: 'mahram', tr: 'mahrem', bn: 'মাহরাম', reviewed: false },
  { tid: 'T35', en: "Idtiba'", variants: [`i[dḍ][tṭ]ib(?:aa|[aā])${A}`], ar: 'الاضطباع', ur: 'اضطباع', id: "idhtiba'", fr: "idtiba'", tr: 'ıztıba', bn: 'ইযতিবা',
    gloss: { en: 'uncovering the right shoulder during tawaf', id: 'membuka bahu kanan saat tawaf', fr: "découvrir l'épaule droite pendant le tawaf", ur: 'طواف میں دایاں کندھا کھولنا' }, reviewed: false },
  { tid: 'T36', en: 'Raml', variants: [`raml`], ar: 'الرَّمَل', ur: 'رمل', id: 'raml (berjalan cepat)', fr: 'raml (marche rapide)', tr: 'remel', bn: 'রমল', reviewed: false },
  { tid: 'T37', en: 'the Black Stone', variants: [`black\\s+stone`, `[hḥ]ajar\\s+al[- ]aswad`], ar: 'الحجر الأسود', ur: 'حجرِ اسود', id: 'Hajar Aswad', fr: 'la Pierre noire', tr: 'Hacerülesved', bn: 'হাজরে আসওয়াদ', reviewed: false },
  { tid: 'T38', en: 'the Yemeni Corner', variants: [`yeme?ni\\s+corner`, `rukn\\s+al[- ]yam(?:aa|[aā])n(?:ee|[iī])`], ar: 'الركن اليماني', ur: 'رکنِ یمانی', id: 'Rukun Yamani', fr: 'le Coin yéménite', tr: 'Rükn-i Yemânî', bn: 'রুকনে ইয়ামানী', reviewed: false },
  { tid: 'T39', en: 'Maqam Ibrahim', variants: [`maq(?:aa|[aā])m\\s+(?:of\\s+)?ibr(?:aa|[aā])h(?:ee|[iī])m`, `station\\s+of\\s+(?:ibr(?:aa|[aā])h(?:ee|[iī])m|abraham)`], ar: 'مقام إبراهيم', ur: 'مقامِ ابراہیم', id: 'Maqam Ibrahim', fr: "la Station d'Ibrahim", tr: 'Makam-ı İbrahim', bn: 'মাকামে ইবরাহীম', reviewed: false },
  { tid: 'T40', en: 'the Hijr', variants: [`[hḥ]ijr(?:\\s+ism(?:aa|[aā])${A}?(?:ee|[iī])l)?`, `[hḥ]a[tṭ](?:ee|[iī])m`], ar: 'الحِجر', ur: 'حطیم', id: 'Hijr Ismail', fr: "le Hijr d'Ismaël", tr: 'Hicr', bn: 'হাতীম', reviewed: false },
  { tid: 'T41', en: 'the Days of Tashriq', variants: [`(?:days?\\s+of\\s+)?tashr(?:ee|[iī])q`, `ayy(?:aa|[aā])m\\s+(?:al|at)[- ]tashr(?:ee|[iī])q`], ar: 'أيام التشريق', ur: 'ایامِ تشریق', id: 'hari-hari Tasyriq', fr: 'les jours de Tachriq', tr: 'teşrik günleri', bn: 'আইয়ামে তাশরীক',
    gloss: { en: '11th, 12th and 13th of Dhul-Hijjah', id: '11, 12, dan 13 Zulhijah', fr: 'les 11, 12 et 13 Dhoul-Hijja', ur: '11، 12 اور 13 ذوالحجہ' }, reviewed: false },
  { tid: 'T42', en: 'the Day of Tarwiyah', variants: [`(?:day\\s+of\\s+)?tarwiya[h]?`], ar: 'يوم التروية', ur: 'یومِ ترویہ', id: 'hari Tarwiyah', fr: 'le jour de Tarwiya', tr: 'terviye günü', bn: 'ইয়াওমুত তারবিয়া',
    gloss: { en: 'the 8th of Dhul-Hijjah', id: '8 Zulhijah', fr: 'le 8 Dhoul-Hijja', ur: '8 ذوالحجہ' }, reviewed: false },
  { tid: 'T43', en: 'the Day of Sacrifice', variants: [`day\\s+of\\s+(?:na[hḥ]r|sacrifice)`, `yawm\\s+(?:al|an)[- ]na[hḥ]r`], ar: 'يوم النحر', ur: 'یومِ نحر', id: 'hari Nahar', fr: 'le jour du Sacrifice', tr: 'kurban günü', bn: 'ইয়াওমুন নাহর',
    gloss: { en: 'the 10th of Dhul-Hijjah', id: '10 Zulhijah', fr: 'le 10 Dhoul-Hijja', ur: '10 ذوالحجہ' }, reviewed: false },
  { tid: 'T44', en: 'Ihsar', variants: [`i[hḥ][sṣ](?:aa|[aā])r`, `mu[hḥ][sṣ]ar`], ar: 'الإحصار', ur: 'احصار', id: 'ihshar', fr: 'ihsar (empêchement)', tr: 'ihsâr', bn: 'ইহসার',
    gloss: { en: 'being prevented from completing the rites', id: 'terhalang menyelesaikan manasik', fr: "être empêché d'achever les rites", ur: 'مناسک مکمل کرنے سے روک دیا جانا' }, reviewed: false },
  { tid: 'T45', en: 'intention (niyyah)', variants: [`niy+a[ht]?`], ar: 'النية', ur: 'نیت', id: 'niat', fr: 'intention (niyya)', tr: 'niyet', bn: 'নিয়ত', reviewed: false },
  { tid: 'T46', en: 'Wudu', variants: [`wu[dḍ](?:oo|[uū])${A}?`], ar: 'الوضوء', ur: 'وضو', id: 'wudhu', fr: 'ablutions (woudou)', tr: 'abdest', bn: 'অযু', reviewed: false },
  { tid: 'T47', en: 'Ghusl', variants: [`ghusl`], ar: 'الغُسل', ur: 'غسل', id: 'mandi wajib (ghusl)', fr: 'grandes ablutions (ghousl)', tr: 'gusül', bn: 'গোসল', reviewed: false },
  { tid: 'T48', en: 'Dhul-Hijjah', variants: [`dh(?:oo|[uū])l?[- ]?[hḥ]ijja[h]?`, `zul[- ]?hijja[h]?`], ar: 'ذو الحجة', ur: 'ذوالحجہ', id: 'Zulhijah', fr: 'Dhoul-Hijja', tr: 'Zilhicce', bn: 'যিলহজ', reviewed: false },
  { tid: 'T49', en: 'Zamzam', variants: [`zamzam`], ar: 'زمزم', ur: 'زمزم', id: 'Zamzam', fr: 'Zamzam', tr: 'Zemzem', bn: 'যমযম', reviewed: false },
  { tid: 'T50', en: 'the Kaaba', variants: [`ka${A}a?ba[h]?`], ar: 'الكعبة', ur: 'کعبہ', id: "Ka'bah", fr: 'la Kaaba', tr: 'Kâbe', bn: 'কাবা', reviewed: false },
  { tid: 'T52', en: "Tan'im", variants: [`tan${A}(?:ee|[iī])m`], ar: 'التنعيم', ur: 'تنعیم', id: "Tan'im", fr: "Tan'im", tr: "Ten'îm", bn: 'তানঈম', reviewed: false },
  { tid: 'T53', en: 'Multazam', variants: [`multazam`], ar: 'الملتزم', ur: 'ملتزم', id: 'Multazam', fr: 'Moultazam', tr: 'Mültezem', bn: 'মুলতাযাম', reviewed: false },
  { tid: 'T54', en: 'expiation (kaffarah)', variants: [`kaff(?:aa|[aā])ra[h]?`], ar: 'الكفارة', ur: 'کفارہ', id: 'kafarat', fr: 'expiation (kaffara)', tr: 'kefaret', bn: 'কাফফারা', reviewed: false },
  { tid: 'T55', en: 'prohibitions of ihram', variants: [`ma[hḥ][zẓdḍ](?:oo|[uū])r(?:aa|[aā])t\\s+al[- ]i[hḥ]r(?:aa|[aā])m`], ar: 'محظورات الإحرام', ur: 'ممنوعاتِ احرام', id: 'larangan ihram', fr: "interdits de l'ihram", tr: 'ihram yasakları', bn: 'ইহরামের নিষিদ্ধ বিষয়', reviewed: false },
  { tid: 'T56', en: 'Tawhid', variants: [`taw[hḥ](?:ee|[iī])d`], ar: 'التوحيد', ur: 'توحید', id: 'tauhid', fr: 'tawhid', tr: 'tevhid', bn: 'তাওহীদ',
    gloss: { en: 'singling out Allah in worship', fr: "l'unicité d'Allah dans l'adoration", id: 'mengesakan Allah dalam ibadah', ur: 'عبادت میں اللہ کو ایک ماننا' }, reviewed: false },
  { tid: 'T57', en: 'Fatwa', variants: [`fatw(?:aa|[aā])s?`, `fat(?:aa|[aā])w(?:aa|[aā])`], ar: 'الفتوى', ur: 'فتویٰ', id: 'fatwa', fr: 'fatwa', tr: 'fetva', bn: 'ফতোয়া', reviewed: false },
  { tid: 'T58', en: 'Hadith', variants: [`[hḥ]ad(?:ee|[iī])th`, `a[hḥ](?:aa|[aā])d(?:ee|[iī])th`], ar: 'الحديث', ur: 'حدیث', id: 'hadis', fr: 'hadith', tr: 'hadis', bn: 'হাদীস', reviewed: false },
  { tid: 'T59', en: 'Qiblah', variants: [`qibla[h]?`], ar: 'القبلة', ur: 'قبلہ', id: 'kiblat', fr: 'qibla', tr: 'kıble', bn: 'কিবলা', reviewed: false },
  { tid: 'T60', en: 'Mabit', variants: [`mab(?:ee|[iī])t`], ar: 'المبيت', ur: 'مبیت (رات گزارنا)', id: 'mabit (bermalam)', fr: 'nuitée (mabit)', tr: 'mebît (geceleme)', bn: 'মাবীত (রাত্রিযাপন)', reviewed: false },
];

export const GLOSSARY_VERSION = 'v1.1-seed';
