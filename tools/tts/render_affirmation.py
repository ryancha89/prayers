"""Render a paced affirmation script to audio with a calm female voice.

The script is plain text with `<break time="3s" />` tags between lines. Each
text block is synthesised separately with OpenAI gpt-4o-mini-tts (the same
provider the prayers backend uses), then stitched with exact silences, a gentle
fade on every phrase, loudness normalisation, and exported as WAV master and
AAC M4A for react-native-sound.

    OPENAI_API_KEY=... python3 tools/tts/render_affirmation.py \
        tools/tts/scripts/calm_affirmation_ko.txt out/calm_affirmation --voice shimmer

    --sample     render only the first 4 phrases (voice audition)
    --voice      shimmer | sage | nova | coral | ...
    --tempo      extra slow-down applied after synthesis (0.9 = 10 % slower)
"""
import argparse, io, json, os, re, subprocess, sys, time, wave
from pathlib import Path
from urllib import request, error

RATE = 24000
INSTRUCTIONS = (
    "당신은 수면 명상과 긍정 확언을 안내하는 여성 내레이터입니다. "
    "아주 느리고 차분하게, 낮고 부드러운 톤으로, 속삭이듯 따뜻하게 말합니다. "
    "서두르지 않고 한 어절씩 여유 있게 발음하며, 말줄임표(...)에서는 잠시 멈춥니다. "
    "감정을 과장하지 않고 편안하고 안정된 느낌을 유지합니다. 문장 끝은 부드럽게 내려 마무리합니다."
)

def parse(text):
    """-> list of ('text', str) | ('break', seconds)"""
    items = []
    for tok in re.split(r'(<break\s+time="[^"]+"\s*/>)', text):
        m = re.match(r'<break\s+time="([\d.]+)(m?s)"\s*/>', tok.strip())
        if m:
            secs = float(m.group(1)) / (1000 if m.group(2) == 'ms' else 1)
            items.append(('break', secs))
        elif tok.strip():
            items.append(('text', re.sub(r'\s*\n\s*', ' ', tok.strip())))
    return items

def synth(text, voice, key, retries=4):
    body = json.dumps({'model': 'gpt-4o-mini-tts', 'voice': voice, 'input': text, 'instructions': INSTRUCTIONS, 'response_format': 'wav'}).encode()
    req = request.Request('https://api.openai.com/v1/audio/speech', data=body, headers={'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'})
    for attempt in range(retries):
        try:
            with request.urlopen(req, timeout=120) as r: return r.read()
        except error.HTTPError as e:
            msg = e.read()[:300]
            if e.code in (429, 500, 502, 503) and attempt < retries - 1: time.sleep(2 ** attempt); continue
            raise SystemExit(f'TTS failed {e.code}: {msg}')

def wav_samples(data):
    with wave.open(io.BytesIO(data)) as w:
        assert w.getnchannels() == 1 and w.getsampwidth() == 2, (w.getnchannels(), w.getsampwidth())
        rate = w.getframerate(); frames = w.readframes(w.getnframes())
    return rate, frames

def resample_if_needed(rate, frames):
    if rate == RATE: return frames
    p = subprocess.run(['ffmpeg', '-v', 'error', '-f', 's16le', '-ar', str(rate), '-ac', '1', '-i', 'pipe:0', '-f', 's16le', '-ar', str(RATE), '-ac', '1', 'pipe:1'], input=frames, capture_output=True, check=True)
    return p.stdout

def trim_and_fade(frames, fade_ms=40, thresh=300, keep_ms=120):
    """Trim leading/trailing near-silence (the model pads phrases), keep a little air, fade edges."""
    import array
    a = array.array('h', frames)
    n = len(a)
    if n == 0: return frames
    start = next((i for i in range(n) if abs(a[i]) > thresh), 0)
    end = next((i for i in range(n - 1, -1, -1) if abs(a[i]) > thresh), n - 1) + 1
    keep = int(RATE * keep_ms / 1000)
    start = max(0, start - keep); end = min(n, end + keep)
    a = a[start:end]; n = len(a)
    f = min(int(RATE * fade_ms / 1000), n // 2)
    for i in range(f):
        g = i / f; a[i] = int(a[i] * g); a[n - 1 - i] = int(a[n - 1 - i] * g)
    return a.tobytes()

def silence(secs): return b'\x00\x00' * int(RATE * secs)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('script'); ap.add_argument('out_base')
    ap.add_argument('--voice', default='shimmer'); ap.add_argument('--sample', action='store_true')
    ap.add_argument('--tempo', type=float, default=1.0); ap.add_argument('--lead', type=float, default=1.5); ap.add_argument('--tail', type=float, default=4.0)
    args = ap.parse_args()
    key = os.environ.get('OPENAI_API_KEY') or sys.exit('OPENAI_API_KEY missing')
    items = parse(Path(args.script).read_text())
    if args.sample:
        cut = [i for i, it in enumerate(items) if it[0] == 'text'][4]
        items = items[:cut]
    cache = Path(args.out_base).parent / '.tts_cache' / args.voice; cache.mkdir(parents=True, exist_ok=True)
    pcm = [silence(args.lead)]; timeline = []; t = args.lead; n_text = sum(it[0] == 'text' for it in items)
    for k, (kind, val) in enumerate(items):
        if kind == 'break':
            pcm.append(silence(val)); t += val; continue
        f = cache / (re.sub(r'[^\w가-힣]+', '_', val)[:60] + '.wav')
        if not f.exists(): f.write_bytes(synth(val, args.voice, key)); print(f'  synth {sum(1 for it in items[:k] if it[0]=="text")+1}/{n_text}: {val[:30]}', flush=True)
        rate, frames = wav_samples(f.read_bytes()); frames = resample_if_needed(rate, frames)
        if args.tempo != 1.0:
            frames = subprocess.run(['ffmpeg', '-v', 'error', '-f', 's16le', '-ar', str(RATE), '-ac', '1', '-i', 'pipe:0', '-filter:a', f'atempo={args.tempo}', '-f', 's16le', '-ar', str(RATE), '-ac', '1', 'pipe:1'], input=frames, capture_output=True, check=True).stdout
        frames = trim_and_fade(frames)
        timeline.append((round(t, 2), val)); pcm.append(frames); t += len(frames) / 2 / RATE
    pcm.append(silence(args.tail)); t += args.tail
    raw = b''.join(pcm)
    out = Path(args.out_base); out.parent.mkdir(parents=True, exist_ok=True)
    # loudness-normalise to a soft -20 LUFS, master WAV + app M4A
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 's16le', '-ar', str(RATE), '-ac', '1', '-i', 'pipe:0', '-af', 'loudnorm=I=-20:TP=-2:LRA=9', '-ar', '44100', str(out) + '.wav'], input=raw, check=True)
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', str(out) + '.wav', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', str(out) + '.m4a'], check=True)
    Path(str(out) + '.timeline.json').write_text(json.dumps({'voice': args.voice, 'tempo': args.tempo, 'duration_s': round(t, 1), 'phrases': timeline}, ensure_ascii=False, indent=1))
    print(f'DONE {out}.m4a  voice={args.voice} tempo={args.tempo} duration={t/60:.1f} min phrases={len(timeline)}')

if __name__ == '__main__':
    main()
