import fs from 'fs';
import path from 'path';

/**
 * The sleep guide (16-10): voice + music start together, the music carries on alone when the voice
 * ends, everything stops at 30:00, and only Replay starts it again — both tracks, from 0.
 * Walked on a fake clock against a fake react-native-sound, through the real SleepSession AND the
 * real sleepAudio player code.
 */
jest.mock('../src/shared/devlog', () => ({ devlog: () => {} }));
jest.mock('react-native-sound', () => null);

const { SleepSession, SLEEP_MS, SLEEP_BED, SLEEP_VOICES, sleepVoiceFor } = require('../src/features/meditation/sleepSession');
const { createSleepAudio } = require('../src/features/meditation/sleepAudio');

const ROOT = path.join(__dirname, '..');

/** A react-native-sound stand-in: loads on the next tick (the real one is async — see the TDZ note
 *  in the meditation-bed test), keeps a position, and lets the test end a track. */
class FakeSound {
  static MAIN_BUNDLE = 'bundle';
  static instances: FakeSound[] = [];
  static categories: string[] = [];
  static fail = new Set<string>();
  static setCategory(c: string) {
    FakeSound.categories.push(c);
  }
  calls: string[] = [];
  position = 0;
  playing = false;
  released = false;
  volume = -1;
  private onEnd: ((ok: boolean) => void) | null = null;
  constructor(public file: string, _base: string, onLoad: (e: unknown) => void) {
    FakeSound.instances.push(this);
    const err = FakeSound.fail.has(file) ? new Error('missing') : null;
    setImmediate(() => onLoad(err));
  }
  getDuration() {
    return this.file === SLEEP_VOICES.ko ? 990.4 : this.file === SLEEP_VOICES.en ? 926.2 : 1800;
  }
  setVolume(v: number) {
    this.volume = v;
  }
  play(cb: (ok: boolean) => void) {
    this.calls.push(`play@${this.position}`);
    this.playing = true;
    this.onEnd = cb;
  }
  pause() {
    this.calls.push('pause');
    this.playing = false;
  }
  stop() {
    this.calls.push('stop');
    this.playing = false;
  }
  release() {
    this.released = true;
  }
  getCurrentTime(cb: (s: number) => void) {
    cb(this.position);
  }
  setCurrentTime(s: number) {
    this.calls.push(`seek@${s}`);
    this.position = s;
  }
  /** The native player reaching the end of the file. */
  end() {
    this.playing = false;
    this.onEnd?.(true);
  }
}

const flush = () => new Promise(r => setImmediate(r));
const byFile = (f: string) => FakeSound.instances.filter(s => s.file === f && !s.released);

function rig() {
  let now = 1_000_000;
  const clock = { now: () => now };
  const audio = createSleepAudio(FakeSound);
  const session = new SleepSession(clock, audio);
  return { session, advance: (ms: number) => (now += ms) };
}

beforeEach(() => {
  FakeSound.instances = [];
  FakeSound.categories = [];
  FakeSound.fail = new Set();
});

describe('the sleep session', () => {
  it('speaks Korean only in Korean, and English for every other language', () => {
    expect(sleepVoiceFor('ko')).toBe('ko');
    for (const l of ['en', 'ja', 'zh-CN', 'zh-TW', 'vi']) expect(sleepVoiceFor(l)).toBe('en');
  });

  it('starts the voice and the bed together, at one volume, in the Playback category', async () => {
    const { session } = rig();
    session.start('ko');
    expect(session.read().status).toBe('loading');
    await flush();
    const [bed] = byFile(SLEEP_BED);
    const [voice] = byFile(SLEEP_VOICES.ko);
    expect(bed.calls).toEqual(['play@0']);
    expect(voice.calls).toEqual(['play@0']);
    expect(bed.volume).toBe(voice.volume);
    expect(FakeSound.categories).toContain('Playback');
    expect(session.read()).toMatchObject({ status: 'running', voice: 'ko', voiceDone: false, elapsedMs: 0 });
  });

  it('walks the whole half hour: voice ends, music carries on, everything stops at 30:00, nothing after', async () => {
    const { session, advance } = rig();
    const seen: string[] = [];
    session.subscribe((s: any) => seen.push(s.status));
    session.start('en');
    await flush();
    const [bed] = byFile(SLEEP_BED);
    const [voice] = byFile(SLEEP_VOICES.en);

    advance(926_200);
    voice.end();
    expect(session.tick()).toMatchObject({ status: 'running', voiceDone: true });
    expect(bed.playing).toBe(true); // the music carries on alone

    advance(SLEEP_MS - 926_200);
    bed.end();
    const end = session.read();
    expect(end).toMatchObject({ status: 'done', remainingSeconds: 0, elapsedMs: SLEEP_MS });
    expect(bed.released && voice.released).toBe(true);
    expect(FakeSound.categories[FakeSound.categories.length - 1]).toBe('Ambient');
    expect(seen).toEqual(['running', 'running', 'done']);

    // Nothing plays on its own after the end, however long the screen stays open.
    advance(60 * 60 * 1000);
    expect(session.tick().status).toBe('done');
    expect(FakeSound.instances.filter(s => s.playing)).toEqual([]);
  });

  it('ends at 30:00 by the clock when the bed never reports its end', async () => {
    const { session, advance } = rig();
    session.start('en');
    await flush();
    advance(SLEEP_MS - 1000);
    expect(session.tick().status).toBe('running');
    advance(1000);
    expect(session.tick()).toMatchObject({ status: 'done', remainingSeconds: 0 });
    expect(byFile(SLEEP_BED)).toEqual([]); // released
  });

  it('Replay restarts both tracks from 0, in the language of the moment', async () => {
    const { session, advance } = rig();
    session.start('en');
    await flush();
    advance(SLEEP_MS);
    session.tick();
    session.replay('ko');
    await flush();
    const [bed] = byFile(SLEEP_BED);
    const [voice] = byFile(SLEEP_VOICES.ko);
    expect(bed.calls).toEqual(['play@0']);
    expect(voice.calls).toEqual(['play@0']);
    expect(session.read()).toMatchObject({ status: 'running', elapsedMs: 0, voice: 'ko', voiceDone: false });
  });

  it('pause holds both and the clock; resume puts the voice back on the bed position', async () => {
    const { session, advance } = rig();
    session.start('en');
    await flush();
    const [bed] = byFile(SLEEP_BED);
    const [voice] = byFile(SLEEP_VOICES.en);
    advance(120_000);
    bed.position = 120;
    voice.position = 119.6; // a little drift
    session.pause();
    expect(bed.calls.slice(-1)).toEqual(['pause']);
    expect(voice.calls.slice(-1)).toEqual(['pause']);
    advance(10 * 60 * 1000); // a long pause does not count
    expect(session.read()).toMatchObject({ status: 'paused', elapsedMs: 120_000 });

    session.resume();
    expect(voice.calls.slice(-2)).toEqual(['seek@120', 'play@120']);
    expect(bed.calls.slice(-1)).toEqual(['play@120']);
    advance(1000);
    expect(session.tick()).toMatchObject({ status: 'running', elapsedMs: 121_000 });
  });

  it('resuming past the end of the voice plays the music only', async () => {
    const { session } = rig();
    session.start('en');
    await flush();
    const [bed] = byFile(SLEEP_BED);
    const [voice] = byFile(SLEEP_VOICES.en);
    bed.position = 1000; // past 926.2 s of voice
    session.pause();
    session.resume();
    expect(voice.calls.filter(c => c.startsWith('play'))).toEqual(['play@0']);
    expect(bed.calls.slice(-1)).toEqual(['play@1000']);
    expect(session.read().voiceDone).toBe(true);
  });

  it('leaving while the files load plays nothing', async () => {
    const { session } = rig();
    session.start('en');
    session.stop();
    await flush();
    expect(FakeSound.instances.every(s => s.calls.length === 0 && s.released)).toBe(true);
    expect(session.read().status).toBe('idle');
  });

  it('runs on music alone when the voice is missing, and says so when nothing loads', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    FakeSound.fail.add(SLEEP_VOICES.en);
    const { session } = rig();
    session.start('en');
    await flush();
    expect(session.read()).toMatchObject({ status: 'running', voiceDone: true });

    FakeSound.fail.add(SLEEP_BED);
    session.replay('en');
    await flush();
    expect(session.read().status).toBe('unavailable');
  });

  it('is unavailable without the native module', () => {
    const session = new SleepSession({ now: () => 0 }, createSleepAudio(null));
    session.start('ko');
    expect(session.read().status).toBe('unavailable');
  });
});

describe('the sleep guide assets', () => {
  it('bundles and links every file it plays', () => {
    for (const f of [SLEEP_BED, SLEEP_VOICES.ko, SLEEP_VOICES.en]) {
      expect(fs.statSync(path.join(ROOT, 'src/shared/assets/sounds', f)).size).toBeGreaterThan(1_000_000);
      for (const m of ['ios/link-assets-manifest.json', 'android/link-assets-manifest.json']) {
        expect(fs.readFileSync(path.join(ROOT, m), 'utf8')).toContain(f);
      }
    }
  });

  it('may keep playing with the screen locked (UIBackgroundModes audio)', () => {
    const plist = fs.readFileSync(path.join(ROOT, 'ios/prayers/Info.plist'), 'utf8');
    expect(plist).toMatch(/<key>UIBackgroundModes<\/key>\s*<array>[\s\S]*?<string>audio<\/string>/);
  });
});

describe('the sleep guide route', () => {
  it('keeps the app bed and the journey mini player off the sleep guide', () => {
    const { miniPlayerHiddenOn, pausesJourneyOn } = require('../src/App');
    // Leave 'SleepGuide' out of SELF_SCORED_SCREENS and the app bed plays under the guide.
    expect(miniPlayerHiddenOn('SleepGuide')).toBe(true);
    expect(pausesJourneyOn('SleepGuide')).toBe(true);
  });
});
