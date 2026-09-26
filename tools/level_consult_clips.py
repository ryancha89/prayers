#!/usr/bin/env python3
"""Level a counselor's Unity voice takes to the room's loudness standard.

The team's takes are levelled to -19 LUFS integrated (ITU-R BS.1770) with a -1 dBTP ceiling
(saju_world_unity fbd0b165: "Voice: every take levelled to -19 LUFS, not peak-normalised"), and
Unity's own peak-normalise is off on every take's .meta so it does not undo that. A re-baked take
(tools/bake_counselor_clips.mjs) comes out of the TTS provider at whatever level it likes, so run
this after every bake, or the counselor jumps in volume between their takes and everyone else's.

Measured against the team's already-levelled ko/wood takes this meter reads -19.0 +/- 0.2, so the
two agree.

Usage:  pip install pyloudnorm numpy scipy
        python3 tools/level_consult_clips.py coldgirl metal [--langs ko,en,ja,vi,zh-CN] [--dry]
"""
import argparse
import glob
import os
import wave

import numpy as np
import pyloudnorm as pyln
from scipy.signal import resample_poly

ROOT = '/Users/namaste/git/saju_fullstack/saju_world_unity/Assets/Audio/Consultation'
TARGET_LUFS = -19.0
CEILING_DBTP = -1.0


def load(path):
    with wave.open(path) as w:
        rate = w.getframerate()
        data = np.frombuffer(w.readframes(w.getnframes()), dtype='<i2').astype(np.float64) / 32768.0
    return data, rate


def save(path, data, rate):
    pcm = (np.clip(data, -1.0, 32767 / 32768) * 32768).round().astype('<i2').tobytes()
    tmp = path + '.tmp'
    with wave.open(tmp, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm)
    os.replace(tmp, path)


def true_peak_db(data):
    # 4x oversampled peak, the usual true-peak estimate.
    return 20 * np.log10(np.max(np.abs(resample_poly(data, 4, 1))) + 1e-12)


def level(path, dry):
    data, rate = load(path)
    meter = pyln.Meter(rate)
    # BS.1770 needs at least one 400 ms block; pad the very short takes (a laugh) with silence for
    # the measurement only.
    probe = data if len(data) >= int(0.4 * rate) else np.pad(data, (0, int(0.4 * rate) - len(data)))
    loud = meter.integrated_loudness(probe)
    if not np.isfinite(loud):
        return None
    gain = TARGET_LUFS - loud
    peak_after = true_peak_db(data) + gain
    if peak_after > CEILING_DBTP:
        gain -= peak_after - CEILING_DBTP
    if not dry:
        save(path, data * (10 ** (gain / 20)), rate)
    return loud, gain


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('personas', nargs='+')
    ap.add_argument('--langs', default='ko,en,ja,vi,zh-CN')
    ap.add_argument('--dry', action='store_true')
    args = ap.parse_args()

    before, gains, skipped, capped = [], [], 0, 0
    for persona in args.personas:
        for lang in args.langs.split(','):
            for path in sorted(glob.glob(os.path.join(ROOT, lang, persona, '*.wav'))):
                r = level(path, args.dry)
                if r is None:
                    skipped += 1
                    continue
                before.append(r[0])
                gains.append(r[1])
                if r[1] < TARGET_LUFS - r[0] - 0.05:
                    capped += 1
    print(f'{len(before)} takes {"measured" if args.dry else "levelled"}, {skipped} too quiet to measure; '
          f'before: median {np.median(before):.1f} LUFS (range {min(before):.1f}..{max(before):.1f}); '
          f'{capped} held under the {CEILING_DBTP} dBTP ceiling')


if __name__ == '__main__':
    main()
