#!/usr/bin/env python3
"""Assemble the uploadable source pack from the extraction output.

Usage: python scripts/build_pack.py data/private data/private/munir-source-pack.json
The pack holds the source registry, the chunks and the published fatwas. It contains the books' text,
so it stays out of the public repository; it is uploaded once through the specialist workspace.
"""
import json, sys, pathlib, re

AUTHOR = 'اللجنة الدائمة للبحوث العلمية والإفتاء · The Permanent Committee for Scholarly Research and Ifta'
TITLE = 'Fatwas on Hajj, ‘Umrah, and Visitation (Presidency of Religious Affairs at the Two Holy Mosques)'

def main(src, out):
    src = pathlib.Path(src)
    data = json.loads((src / 'chunks.json').read_text(encoding='utf8'))
    qa = json.loads((src / 'fatwa_qa.json').read_text(encoding='utf8'))
    fatwas = []
    for i, f in enumerate(qa, 1):
        # Only fatwas with a printed reference and a clean answer enter the verified-answer memory.
        if not f.get('reference') or '....' in f['answer'] or len(f['answer']) < 40 or len(f['question']) < 12: continue
        fatwas.append({'code': f'PC-{i:03d}', 'section': f.get('section', '')[:200], 'page': f.get('page'), 'question': f['question'], 'answer': f['answer'],
                       'reference': re.sub(r'\s+', ' ', f['reference'])[:300], 'source_title': TITLE, 'author_name': AUTHOR})
    sources = [{k: s.get(k) for k in ('id', 'title', 'author', 'publisher', 'lang', 'license', 'pages')} for s in data['sources']]
    pack = {'version': 1, 'sources': sources, 'chunks': data['chunks'], 'fatwas': fatwas}
    pathlib.Path(out).write_text(json.dumps(pack, ensure_ascii=False), encoding='utf8')
    print(f"sources={len(sources)} chunks={len(pack['chunks'])} fatwas={len(fatwas)} bytes={pathlib.Path(out).stat().st_size}")

if __name__ == '__main__': main(sys.argv[1], sys.argv[2])
