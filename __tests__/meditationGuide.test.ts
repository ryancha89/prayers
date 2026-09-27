import fs from 'fs';
import path from 'path';

/**
 * The English meditation guide (26-09): bundled, linked, spoken only in English, and it gets out of
 * the way — the bed ducks under it, a pause holds its place, leaving silences it.
 */
const ROOT = path.join(__dirname, '..');

// A react-native-sound stand-in that loads instantly and records what it was told.
const mockCalls: string[] = [];
class MockSound {
  static MAIN_BUNDLE = 'bundle';
  static instances: MockSound[] = [];
  /** Set to hold every load open until the test calls the returned finishers. */
  static deferred: (() => void)[] | null = null;
  onEnd: ((ok: boolean) => void) | null = null;
  constructor(public file: string, _base: string, onLoad: (e: unknown) => void) {
    MockSound.instances.push(this);
    mockCalls.push(`load:${file}`);
    if (MockSound.deferred) MockSound.deferred.push(() => onLoad(null));
    else onLoad(null);
  }
  play(cb: (ok: boolean) => void) {
    mockCalls.push('play');
    this.onEnd = cb;
  }
  pause() {
    mockCalls.push('pause');
  }
  stop() {
    mockCalls.push('stop');
  }
  release() {
    mockCalls.push('release');
  }
}

const mockDuck = jest.fn();
jest.mock('react-native-sound', () => mockSoundClass());
function mockSoundClass() {
  return MockSound;
}
jest.mock('../src/shared/audio/backgroundMusic', () => ({ backgroundMusic: { duck: (on: boolean) => mockDuck(on) } }));
jest.mock('../src/shared/devlog', () => ({ devlog: () => {} }));

// Required, not imported: an import is hoisted above MockSound's definition, and the mock factory
// would then hand the module a class that does not exist yet.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { guideVoice, GUIDES } = require('../src/features/meditation/guideVoice');

beforeEach(() => {
  guideVoice.stop();
  mockCalls.length = 0;
  mockDuck.mockClear();
  MockSound.instances = [];
});

describe('the meditation guide', () => {
  it('ships every recording it names and links each natively', () => {
    expect(Object.keys(GUIDES).sort()).toEqual(['en', 'ja', 'zh-CN', 'zh-TW']);
    for (const f of new Set(Object.values(GUIDES) as string[])) {
      const file = path.join(ROOT, 'src', 'shared', 'assets', 'sounds', f);
      expect(fs.statSync(file).size).toBeGreaterThan(300_000); // a minute or more of speech
      for (const m of ['ios/link-assets-manifest.json', 'android/link-assets-manifest.json']) {
        expect(fs.readFileSync(path.join(ROOT, m), 'utf8')).toContain(f);
      }
    }
  });

  it('says nothing in a language that has no guide', () => {
    guideVoice.play('ko');
    guideVoice.play('vi');
    expect(mockCalls).toEqual([]);
    expect(mockDuck).not.toHaveBeenCalled();
  });

  it('speaks in English, over a ducked bed', () => {
    guideVoice.play('en');
    expect(mockCalls).toEqual([expect.stringContaining('meditation_guide_en'), 'play']);
    expect(mockDuck).toHaveBeenLastCalledWith(true);
  });

  it('holds its place through a pause and carries on from it', () => {
    guideVoice.play('en');
    guideVoice.pause();
    guideVoice.play('en');
    // One load: Carry on resumes the same player instead of starting the guide over.
    expect(mockCalls.filter(c => c.startsWith('load:'))).toHaveLength(1);
    expect(mockCalls).toEqual([expect.any(String), 'play', 'pause', 'play']);
    expect(mockDuck.mock.calls.map(c => c[0])).toEqual([true, false, true]);
  });

  it('brings the bed back when it ends, and does not start again that session', () => {
    guideVoice.play('en');
    MockSound.instances[0].onEnd?.(true);
    expect(mockDuck).toHaveBeenLastCalledWith(false);
    mockCalls.length = 0;
    guideVoice.play('en'); // Carry on after the guide is over
    expect(mockCalls).toEqual([]);
  });

  it('stays quiet if the session is paused while the recording is still loading', () => {
    MockSound.deferred = [];
    try {
      guideVoice.play('en');
      guideVoice.pause();
      MockSound.deferred.forEach(f => f());
      expect(mockCalls).not.toContain('play');
    } finally {
      MockSound.deferred = null;
    }
  });

  it('switches recording when the language does', () => {
    guideVoice.play('ja');
    guideVoice.stop();
    guideVoice.play('zh-CN');
    expect(mockCalls.filter(c => c.startsWith('load:'))).toEqual([
      'load:meditation_guide_ja.m4a',
      'load:meditation_guide_zh.m4a',
    ]);
  });

  it('falls silent when the session is left, and starts from the top next time', () => {
    guideVoice.play('en');
    guideVoice.stop();
    expect(mockCalls).toContain('stop');
    mockCalls.length = 0;
    guideVoice.play('en');
    expect(mockCalls[0]).toContain('load:');
  });
});
