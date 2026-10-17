#!/usr/bin/env python3
"""Turn the translated Schopenhauer scripts (.docx) into the app's per-language lecture data.

  python3 tools/schopenhauer/import_scripts.py EN=path.docx JA=path.docx VI=path.docx ZH_CN=path.docx

Writes src/features/philosophy/data/schopenhauer.<lang>.json (en, ja, vi, zh-CN, and zh-TW from
zh-CN). The Korean file came from the original Korean script and is not touched here.

THE SHAPE. Each translation has, per chapter: a Heading1 "NN  Title", a stage direction, the
speaker's name, paragraphs of speech, and a closing question — each language with its own labels
(LABELS). A paragraph is several sentences; the lecture plays and subtitles ONE sentence at a time
(as the Korean script was written), so paragraphs are split into sentences here.

zh-TW: there is no Traditional script. Its subtitles are the Simplified text converted with OpenCC
(s2twp, Taiwan phrasing), and it plays the Mandarin recordings — what is SPOKEN is the same.

A line's `ms` is kept when the same file already has one (re-importing never forgets a bake).
"""
import json, os, re, sys, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA = os.path.join(ROOT, 'src/features/philosophy/data')

LABELS = {
    'EN': ('en', 'Stage direction:', 'Schopenhauer', 'Closing question:'),
    'JA': ('ja', '演出:', 'ショーペンハウアー', '最後の問い:'),
    'VI': ('vi', 'Chỉ dẫn sân khấu:', 'Schopenhauer', 'Câu hỏi kết thúc:'),
    'ZH_CN': ('zh-CN', '场景设计:', '叔本华', '课后提问:'),
}
FILE_PREFIX = {'en': 'en', 'ja': 'ja', 'vi': 'vi', 'zh-CN': 'zh'}


def paragraphs(path):
    x = zipfile.ZipFile(path).read('word/document.xml').decode()
    for p in re.findall(r'<w:p[ >].*?</w:p>', x, re.S):
        text = ''.join(re.findall(r'<w:t[^>]*>(.*?)</w:t>', p, re.S))
        text = text.replace('&quot;', '"').replace('&amp;', '&').replace('&apos;', "'").replace('&lt;', '<').replace('&gt;', '>')
        style = re.search(r'<w:pStyle w:val="([^"]+)"', p)
        yield (style.group(1) if style else ''), text.strip()


CJK_END = re.compile(r'(?<=[。！？])(?![」』”’）)])')
LATIN_END = re.compile(r'(?<=[.!?…])["”’)]?\s+(?=["“‘(]?[A-ZÀ-ỸĐ0-9])')


def sentences(par, lang):
    if lang in ('ja', 'zh-CN'):
        parts = CJK_END.split(par)
    else:
        # Keep a closing quote with its sentence: split at the space after it.
        parts = re.split(r'(?<=[.!?…])(["”’)]?)\s+(?=["“‘(]?[A-ZÀ-ỸĐ0-9])', par)
        # re.split with a group returns the captured quotes as separate items; glue them back.
        glued = []
        for i, p in enumerate(parts):
            if i % 2 == 1:
                glued[-1] += p
            else:
                glued.append(p)
        parts = glued
    return [s.strip() for s in parts if s.strip()]


def parse(path, code):
    lang, stage_label, speaker, question_label = LABELS[code]
    chapters, cur = [], None
    for style, t in paragraphs(path):
        if style == 'Heading1':
            m = re.match(r'(\d+)\s+(.*)', t)
            cur = {'no': int(m.group(1)), 'title': m.group(2).strip(), 'staging': '', 'paras': [], 'question': ''}
            chapters.append(cur)
        elif cur is None or not t:
            continue
        elif t.startswith(stage_label):
            cur['staging'] = t[len(stage_label):].strip()
        elif t.startswith(question_label):
            cur['question'] = t[len(question_label):].strip()
        elif t == speaker:
            continue
        else:
            cur['paras'].append(t)
    assert [c['no'] for c in chapters] == list(range(1, 13)), (code, [c['no'] for c in chapters])
    for c in chapters:
        assert c['question'] and c['paras'], (code, c['no'])
    return lang, chapters


def build(lang, chapters, old):
    prefix = FILE_PREFIX[lang]
    kept = {}
    if old:
        for c in old['chapters']:
            for l in c['lines'] + [c['question']]:
                kept[(l['file'], l['text'])] = l['ms']
    out = []
    for c in chapters:
        lines = [s for p in c['paras'] for s in sentences(p, lang)]
        def item(text, file):
            return {'text': text, 'file': file, 'ms': kept.get((file, text), 0)}
        out.append({
            'no': c['no'], 'title': c['title'], 'staging': c['staging'],
            'lines': [item(s, f'schop_{prefix}_c{c["no"]:02d}_{i:02d}.m4a') for i, s in enumerate(lines)],
            'question': item(c['question'], f'schop_{prefix}_c{c["no"]:02d}_q.m4a'),
        })
    return {'id': 'schopenhauer', 'lang': lang, 'chapters': out}


def main():
    sources = dict(a.split('=', 1) for a in sys.argv[1:])
    for code, path in sources.items():
        lang, chapters = parse(path, code)
        dest = os.path.join(DATA, f'schopenhauer.{lang}.json')
        old = json.load(open(dest)) if os.path.exists(dest) else None
        data = build(lang, chapters, old)
        json.dump(data, open(dest, 'w'), ensure_ascii=False, indent=1)
        n = sum(len(c['lines']) + 1 for c in data['chapters'])
        print(f'{lang}: {n} lines → {os.path.relpath(dest, ROOT)}')
        if lang == 'zh-CN':
            try:
                import opencc
            except ImportError:
                sys.exit('zh-TW needs OpenCC: put opencc-python-reimplemented on PYTHONPATH')
            cc = opencc.OpenCC('s2twp')
            tw = json.loads(json.dumps(data))
            tw['lang'] = 'zh-TW'
            for c in tw['chapters']:
                c['title'] = cc.convert(c['title'])
                c['staging'] = cc.convert(c['staging'])
                for l in c['lines'] + [c['question']]:
                    l['text'] = cc.convert(l['text'])  # same file: the Mandarin take
            json.dump(tw, open(os.path.join(DATA, 'schopenhauer.zh-TW.json'), 'w'), ensure_ascii=False, indent=1)
            print('zh-TW: converted from zh-CN (s2twp), plays the zh recordings')


if __name__ == '__main__':
    main()
