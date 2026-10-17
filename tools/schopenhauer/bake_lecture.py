#!/usr/bin/env python3
"""Record the Schopenhauer lecture ONCE and bundle it with the app.

The lecture is fixed text (src/features/philosophy/data/schopenhauer.<lang>.json, from the
"Prayers_쇼펜하우어_12강_전체대본" script), so its voice is not synthesised at runtime: every line is
recorded here, levelled to -18 LUFS (the meditation guide's level), and written as an m4a into
src/shared/assets/sounds/, which `npx react-native-asset` links into the iOS/Android bundles.

A line whose file already exists is SKIPPED — re-running never re-records (and never re-bills) a
take. To redo one, delete its file. Each new take's length is checked against its text: Gemini TTS
can read the style direction aloud, and that comes back far longer than the line.

Writes each take's length back into the JSON (`ms`), which the player uses for progress.

  python3 tools/schopenhauer/bake_lecture.py [--lang ko|en|ja|vi|zh-CN] [--only c01] [--jobs 4]

One voice for every language (Gemini speaks the text's own language); the direction is Korean for
Korean and English for the rest. zh-TW has no recordings of its own: it plays the zh-CN takes.
"""
import base64, json, os, subprocess, sys, tempfile, time, urllib.request, wave
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA = os.path.join(ROOT, 'src/features/philosophy/data/schopenhauer.{lang}.json')
OUT = os.path.join(ROOT, 'src/shared/assets/sounds')
ENV = os.path.expanduser('~/git/saju_fullstack/saju/.env')

# The voice, chosen 16-10 from seven auditioned (Gemini Algenib/Charon/Rasalgethi/Schedar/Iapetus,
# OpenAI onyx/ash): low (median F0 123 Hz), gravelly, and the only kind that kept the slow,
# reflective pace asked for — the OpenAI voices read the same text 40% faster.
VOICE = 'Algenib'
MODEL = 'gemini-3.1-flash-tts-preview'
STYLE_KO = ('다음 문장을 일흔 살의 독일 노철학자가 강의하듯 읽어줘. 낮고 깊으며 세월이 묻은 약간 갈라진 목소리로, 느리고 사색적으로, '
            '문장 사이에 생각하듯 여유를 두고. 냉소적이지만 따뜻함이 살짝 배어 있는 담담한 말투로: ')
STYLE_OTHER = ('Read the following line, in its own language, as a seventy-year-old German philosopher giving a lecture: '
               'a low, deep, slightly gravelly voice weathered by age, slow and reflective, with thoughtful pauses — '
               'dry and sardonic, yet with a faint warmth. Line: ')
# Seconds per non-space character a take may run, (min, max): a take far longer was probably the
# direction read aloud; far shorter, cut off. Latin letters are spoken faster than syllable glyphs.
PACE = {'ko': (0.06, 0.42), 'ja': (0.04, 0.32), 'zh-CN': (0.07, 0.45), 'en': (0.025, 0.24), 'vi': (0.025, 0.26)}


def key():
    for line in open(ENV):
        if line.startswith('GEMINI_API_KEY='):
            return line.split('=', 1)[1].strip().strip('"')
    sys.exit('GEMINI_API_KEY missing from ' + ENV)


def synth(text, api_key, lang):
    style = STYLE_KO if lang == 'ko' else STYLE_OTHER
    body = {'contents': [{'parts': [{'text': f'{style}{text}'}]}],
            'generationConfig': {'responseModalities': ['AUDIO'],
                                 'speechConfig': {'voiceConfig': {'prebuiltVoiceConfig': {'voiceName': VOICE}}}}}
    req = urllib.request.Request(
        f'https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent',
        data=json.dumps(body).encode(), headers={'Content-Type': 'application/json', 'x-goog-api-key': api_key})
    r = json.load(urllib.request.urlopen(req, timeout=180))
    return base64.b64decode(r['candidates'][0]['content']['parts'][0]['inlineData']['data'])


def plausible(text, seconds, lang):
    """A take that is far longer than its text was probably the direction read aloud; far shorter, cut off."""
    n = len(text.replace(' ', ''))
    lo, hi = PACE[lang]
    return lo * n + 0.4 <= seconds <= hi * n + 2.5


def bake(item, api_key, lang):
    text, file = item['text'], item['file']
    dest = os.path.join(OUT, file)
    if os.path.exists(dest):
        return file, 'kept', duration_ms(dest)
    for attempt in range(4):
        try:
            pcm = synth(text, api_key, lang)
        except Exception as e:  # rate limit, 5xx: back off and try again
            time.sleep(4 * (attempt + 1))
            last = f'error {e}'
            continue
        seconds = len(pcm) / 2 / 24000
        if not plausible(text, seconds, lang):
            last = f'implausible {seconds:.1f}s for {len(text)} chars'
            continue
        with tempfile.TemporaryDirectory() as tmp:
            raw = os.path.join(tmp, 'take.wav')
            with wave.open(raw, 'wb') as w:
                w.setnchannels(1); w.setsampwidth(2); w.setframerate(24000); w.writeframes(pcm)
            subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', raw,
                            # The pace listeners chose (1.4×) is part of the take, pitch kept: the
                            # app's 1.0× is this, and its 2.0× stays within AVAudioPlayer's limit.
                            '-af', 'atempo=1.4,loudnorm=I=-18:TP=-1.5:LRA=11', '-ar', '44100', '-ac', '1',
                            '-c:a', 'aac', '-b:a', '64k', dest], check=True)
        return file, 'baked', duration_ms(dest)
    return file, 'FAILED: ' + last, 0


def duration_ms(path):
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path],
                         capture_output=True, text=True).stdout.strip()
    return int(float(out) * 1000) if out else 0


def main():
    args = sys.argv[1:]
    only = args[args.index('--only') + 1] if '--only' in args else None
    jobs = int(args[args.index('--jobs') + 1]) if '--jobs' in args else 4
    lang = args[args.index('--lang') + 1] if '--lang' in args else 'ko'
    path = DATA.format(lang=lang)
    data = json.load(open(path))
    items = []
    for c in data['chapters']:
        for it in c['lines'] + [c['question']]:
            if not only or f'_{only}_' in it['file']:
                items.append(it)
    api_key = key()
    by_file = {it['file']: it for it in items}
    failed = 0
    with ThreadPoolExecutor(jobs) as ex:
        for i, (file, status, ms) in enumerate(ex.map(lambda it: bake(it, api_key, lang), items), 1):
            if ms:
                by_file[file]['ms'] = ms
            if status.startswith('FAILED'):
                failed += 1
            if status != 'kept' or i % 25 == 0:
                print(f'[{i}/{len(items)}] {file} {status} {ms}ms', flush=True)
    json.dump(data, open(path, 'w'), ensure_ascii=False, indent=1)
    if lang == 'zh-CN':
        # zh-TW plays these same takes: carry their lengths over.
        tw_path = DATA.format(lang='zh-TW')
        if os.path.exists(tw_path):
            tw = json.load(open(tw_path))
            for c, tc in zip(data['chapters'], tw['chapters']):
                for l, tl in zip(c['lines'] + [c['question']], tc['lines'] + [tc['question']]):
                    tl['ms'] = l['ms']
            json.dump(tw, open(tw_path, 'w'), ensure_ascii=False, indent=1)
    print(f'DONE {len(items) - failed}/{len(items)} ok, {failed} failed')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
