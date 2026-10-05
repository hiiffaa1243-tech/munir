#!/usr/bin/env python3
"""Turn the approved source PDFs into structured chunks for Munir.

Usage: python scripts/extract.py <folder with PDFs> <out dir>
Writes <out>/chunks.json (source texts, NOT committed to the public repo) and data/sources.json (registry, committed).
Chunking follows the document structure: a fatwa (question + answer + reference) or the paragraphs under one heading
stay together, so a ruling is never separated from its conditions.
"""
import json, re, sys, collections, pathlib, warnings
warnings.filterwarnings('ignore')
import pymupdf

SOURCES = [
 # id, file name, title, author, publisher, kind
 ('fatwas', 'Fatwas on Hajj, ‘Umrah, and Visitation.pdf', 'Fatwas on Hajj, ‘Umrah, and Visitation', 'The Scientific Committee (fatwas of the Permanent Committee and senior scholars)', "Presidency of Religious Affairs at the Sacred Mosque and the Prophet's Mosque", 'fatwas'),
 ('violations', 'Violations During Hajj, ‘Umrah and Visitation.pdf', 'Violations During Hajj, ‘Umrah and Visitation', 'The Scientific Committee', "Presidency of Religious Affairs at the Sacred Mosque and the Prophet's Mosque", 'book'),
 ('umrah_concise', 'Concise Description of ‘Umrah and Its Rulings.pdf', 'Concise Description of ‘Umrah and Its Rulings', 'The Scientific Committee', "Presidency of Religious Affairs at the Sacred Mosque and the Prophet's Mosque", 'book'),
 ('umrah_howto', 'How to do`Umrah.pdf', 'How to do ‘Umrah, with selected supplications', 'Booklets for Visitors to the Two Holy Mosques', "Presidency of Religious Affairs at the Sacred Mosque and the Prophet's Mosque", 'book'),
 ('hajj_howto', 'How to Perform Hajj.pdf', 'How to Perform Hajj', 'Shaykh Muhammad ibn Salih al-‘Uthaymin', 'IslamHouse', 'book'),
 ('guide', 'A Guide to Hajj, ‘Umrah and Visiting the Prophet’s Mosque.pdf', 'A Guide to Hajj, ‘Umrah and Visiting the Prophet’s Mosque', 'The Agency of Islamic Enlightenment in Hajj; approved by the Permanent Committee of Islamic Research and Ifta', 'IslamHouse', 'book'),
 ('rites', 'Rites of Hajj and Umrah.pdf', 'Rites of Hajj and Umrah from the Book and Sunnah', 'Shaikh Muhammad Nasir-ud-Din al-Albani', 'IslamHouse', 'book'),
 ('ahadith', 'Ahadith pertaining to Hajj from the Sahihayn.pdf', 'Ahadith pertaining to Hajj from the Sahihayn', 'Compilation from Sahih al-Bukhari and Sahih Muslim', 'IslamHouse', 'book'),
 ('hady', 'Rulings on Sacrificial Animals, Offerings, and Slaughtering.pdf', 'Rulings on Sacrificial Animals, Offerings, and Slaughtering', 'The Scientific Committee', "Presidency of Religious Affairs at the Sacred Mosque and the Prophet's Mosque", 'book'),
 ('ten_days', 'Merit of the First Ten Days of Dhul-Hijjah.pdf', 'Merit of the First Ten Days of Dhul-Hijjah', 'The Scientific Committee', "Presidency of Religious Affairs at the Sacred Mosque and the Prophet's Mosque", 'book'),
 ('fasting', 'Some Rulings on Fasting.pdf', 'Some Rulings on Fasting', 'The Scientific Committee', "Presidency of Religious Affairs at the Sacred Mosque and the Prophet's Mosque", 'book'),
]
KEEP = 'ﷺﷻ﷽'  # honorific ligatures kept as-is
ARABIC = re.compile(r'[؀-ۿݐ-ݿﭐ-ﷹ﷼﷾-﷿ﹰ-﻿]+')
TARGET, MAXLEN, MINLEN = 1100, 1700, 220

def clean_line(s):
    s = ARABIC.sub(' ', s).replace('­', '').replace('', '•')
    s = re.sub(r'[﴾﴿]', ' ', s)
    s = re.sub(r'_{4,}', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()

def page_blocks(page):
    """Paragraph-like blocks with their largest font size and bold share."""
    out = []
    for b in page.get_text('dict')['blocks']:
        if b.get('type') != 0: continue
        lines, sizes, bold, total = [], [], 0, 0
        for ln in b['lines']:
            t = ''.join(sp['text'] for sp in ln['spans'])
            for sp in ln['spans']:
                n = len(sp['text'].strip()); total += n
                if n: sizes.append((sp['size'], n))
                if 'bold' in sp['font'].lower() or sp['flags'] & 16: bold += n
            t = clean_line(t)
            if t: lines.append(t)
        if not lines: continue
        size = max((s for s, _ in sizes), default=0)
        out.append({'lines': lines, 'size': size, 'bold': bold / total if total else 0, 'y': b['bbox'][1]})
    return sorted(out, key=lambda x: x['y'])

def join_lines(lines):
    s = ''
    for ln in lines:
        if s.endswith('-') and ln[:1].islower(): s = s[:-1] + ln
        elif s.endswith('-'): s += ln
        else: s += (' ' if s else '') + ln
    return re.sub(r'\s+([,.;:!?])', r'\1', s).strip()

def norm_key(s): return re.sub(r'\d+', '#', s.lower()).strip()

def extract(path):
    doc = pymupdf.open(path)
    pages = [page_blocks(p) for p in doc]
    # running headers and footers: short lines repeated on many pages
    freq = collections.Counter()
    for blocks in pages:
        for k in {norm_key(l) for b in blocks for l in b['lines'] if len(l) < 90 and '[' not in l and ']' not in l}: freq[k] += 1
    npages = max(len(pages), 1)
    repeated = {k for k, c in freq.items() if c >= max(4, 0.3 * npages)}
    sizes = collections.Counter()
    for blocks in pages:
        for b in blocks: sizes[round(b['size'], 1)] += sum(len(l) for l in b['lines'])
    body = sizes.most_common(1)[0][0] if sizes else 11
    paras = []  # (page, text, is_heading)
    for pi, blocks in enumerate(pages):
        for b in blocks:
            lines = [l for l in b['lines'] if norm_key(l) not in repeated and not re.fullmatch(r'[\d\s\-–—|.]+', l) and 'islamhouse' not in l.lower()]
            if not lines: continue
            text = join_lines(lines)
            if len(text) < 2: continue
            short = len(text) <= 90 and not text.endswith(('.', ',', ';', '”', '"', ')')) and len(lines) <= 2
            ordinal = bool(re.match(r'^(First|Second|Third|Fourth|Fifth|Sixth|Seventh|Eighth|Ninth|Tenth|Firstly|Secondly|Thirdly|Fourthly|Fifthly|Sixthly|Seventhly|Eighthly|Ninthly|Tenthly|Chapter|Section|The (First|Second|Third|Fourth|Fifth) Topic)\b', text))
            plain = not re.search(r'[“”"«»\[\]()]', text) and len(text.split()) <= 12 and len(text) >= 4 and not text[:1].islower()
            heading = short and plain and (b['size'] >= body * 1.12 or ordinal) and re.search(r'[A-Za-z]{3}', text) is not None
            paras.append((pi + 1, text, heading))
    return paras, len(pages)

def chunk_book(paras):
    chunks, cur, cur_page, heading = [], [], None, ''
    def flush():
        nonlocal cur, cur_page
        text = ' '.join(cur).strip()
        if len(text) >= MINLEN or (text and not chunks): chunks.append({'path': heading, 'page': cur_page, 'text': text})
        elif text and chunks and chunks[-1]['path'] == heading: chunks[-1]['text'] += ' ' + text
        elif text: chunks.append({'path': heading, 'page': cur_page, 'text': text})
        cur, cur_page = [], None
    for page, text, is_h in paras:
        if is_h:
            flush(); heading = text.rstrip(':').strip(); continue
        if cur and sum(len(x) for x in cur) + len(text) > MAXLEN: flush()
        if cur_page is None: cur_page = page
        cur.append(text)
        if sum(len(x) for x in cur) >= TARGET and text.endswith(('.', '”', '"', ']', ')')): flush()
    flush()
    return chunks

REF = re.compile(r'\[([^\[\]]{8,220}\d[^\[\]]{0,40})\]')
HEAD = re.compile(r'((?:First|Second|Third|Fourth|Fifth|Sixth|Seventh|Eighth|Ninth|Tenth)ly\s*:\s*[A-Z][^?.\[\]]{3,90}?)\s*$')
def chunk_fatwas(paras):
    """One chunk per fatwa: question, answer and the bracketed reference stay together."""
    full = ''
    for page, text, _h in paras: full += f' \x00{page}\x00 ' + text
    pieces = re.split(r'(?=Question\s*:)', full)
    chunks, qa, heading, page = [], [], '', 1
    def strip_marks(t):
        nonlocal page
        ms = re.findall(r'\x00(\d+)\x00', t)
        first = int(ms[0]) if ms else None
        return re.sub(r'\s*\x00\d+\x00\s*', ' ', t).strip(), first, (int(ms[-1]) if ms else None)
    for piece in pieces:
        # the page a question starts on is the last marker seen before it
        text, first, last = strip_marks(piece)
        start_page = page
        if last: page = last
        text = re.sub(r'\s*\*{3}\s*', ' *** ', text)
        if not text.startswith('Question'):
            h = re.search(r'((?:First|Second|Third)\w*\s*:\s*[A-Z][^?.\[\]]{3,60})\s*$', text.replace(' *** ', ' ').strip())
            if h: heading = h.group(1).strip()
            continue
        tail_heading = None
        refs = list(REF.finditer(text))
        body = text
        if refs:
            r = refs[-1]; tail = re.sub(r'\b\d+\b', ' ', text[r.end():].replace('***', ' '))
            tail = re.sub(r'\s+', ' ', tail).strip()
            if 4 <= len(tail) <= 140 and re.search(r'[A-Za-z]{4}', tail): tail_heading = re.sub(r'(?<=[a-z])\d\b', '', tail)
            body = text[:r.end()]
        else:
            h = HEAD.search(text.replace('***', ' ').strip())
            if h: tail_heading = h.group(1).strip(); body = text[:text.rfind(h.group(1))]
        body = body.replace(' *** ', ' ').strip()
        m = re.search(r'Question\s*:\s*(.*?)\s*Answer\s*:\s*(.*)$', body, re.S)
        if m:
            ans = m.group(2); r2 = list(REF.finditer(ans))
            ref = r2[-1].group(1).strip() if r2 else ''
            qa.append({'section': heading, 'page': start_page, 'question': m.group(1).strip(), 'answer': (ans[:r2[-1].start()] if r2 else ans).strip(), 'reference': ref})
        chunks.append({'path': heading, 'page': start_page, 'text': body})
        if tail_heading: heading = tail_heading
    out = []
    for c in chunks:
        if len(c['text']) <= MAXLEN + 500: out.append(c); continue
        m = re.search(r'^(Question\s*:.*?)(Answer\s*:.*)$', c['text'], re.S)
        head = (m.group(1).strip()[:500] + ' ') if m else ''
        body = m.group(2) if m else c['text']
        sents = re.split(r'(?<=[.!?”\]])\s+', body); buf = ''
        for snt in sents:
            if buf and len(buf) + len(snt) > MAXLEN - len(head): out.append({**c, 'text': head + buf.strip()}); buf = ''
            buf += snt + ' '
        if buf.strip(): out.append({**c, 'text': head + buf.strip()})
    return out, qa

def main(src_dir, out_dir):
    src_dir, out_dir = pathlib.Path(src_dir), pathlib.Path(out_dir); out_dir.mkdir(parents=True, exist_ok=True)
    all_chunks, registry, fatwa_qa = [], [], []
    for sid, fname, title, author, publisher, kind in SOURCES:
        f = src_dir / fname
        if not f.exists(): print('MISSING', fname); continue
        paras, npages = extract(f)
        if kind == 'fatwas': chunks, fatwa_qa = chunk_fatwas(paras)
        else: chunks = chunk_book(paras)
        def good(t):
            letters = sum(ch.isalpha() for ch in t)
            return len(t) >= 80 and letters / len(t) > 0.55 and t.count('.') / len(t) < 0.12
        chunks = [c for c in chunks if good(c['text'])]
        for i, c in enumerate(chunks):
            all_chunks.append({'id': f'{sid}_{i:03d}', 'source_id': sid, 'path': c['path'][:160] or None, 'page': c['page'], 'lang': 'en', 'text': c['text']})
        registry.append({'id': sid, 'title': title, 'author': author, 'publisher': publisher, 'lang': 'en', 'pages': npages, 'file': fname,
                         'license': 'Published for free distribution by the publisher; text is not redistributed in this repository', 'chunks': len(chunks)})
        lens = [len(c['text']) for c in chunks]
        print(f'{sid:14} pages={npages:3} chunks={len(chunks):3} avg={sum(lens)//max(len(lens),1):5} max={max(lens) if lens else 0}')
    (out_dir / 'chunks.json').write_text(json.dumps({'sources': registry, 'chunks': all_chunks}, ensure_ascii=False), encoding='utf8')
    (out_dir / 'fatwa_qa.json').write_text(json.dumps(fatwa_qa, ensure_ascii=False, indent=1), encoding='utf8')
    pathlib.Path('data').mkdir(exist_ok=True)
    pathlib.Path('data/sources.json').write_text(json.dumps(registry, ensure_ascii=False, indent=1), encoding='utf8')
    print('total chunks', len(all_chunks), '| fatwa Q&A pairs', len(fatwa_qa))

if __name__ == '__main__': main(sys.argv[1], sys.argv[2])
