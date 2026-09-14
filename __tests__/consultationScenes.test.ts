/**
 * The server's `scenes[]`, from the wire to the bubble.
 *
 * This is the piece that was built and then never connected: saju_server has broken every tagged
 * answer into scenes — a break where the delivery changes, a tone, a hold — since the 26-08
 * contract, and no client asked for them. The room split the answer itself at ~110 characters and
 * drew one flat face over the whole reading.
 *
 * What these tests pin is the seam, not the server: that the app ASKS, that a scene's tone survives
 * the two mappings between the wire and the stage, and — most of all — that an answer with NO
 * scenes still behaves exactly as it did, because that is every reading the embedded room delivers
 * (it answers over v2, which speaks cues and has no scenes at all).
 */
jest.mock(
  '../src/features/counseling/api/devToken',
  () => ({ SAJU_ACCESS_TOKEN: 'test-token' }),
  { virtual: true },
);
jest.mock('../src/features/counseling/bridge', () => ({ unityApiBase: 'http://localhost:4000' }));
jest.mock('../src/shared/config/api', () => ({ apiBase: () => 'http://localhost:4000' }));
jest.mock('../src/shared/devlog', () => ({ devlog: () => {} }));
jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: async (k: string) => store.get(k) ?? null,
      setItem: async (k: string, v: string) => void store.set(k, v),
      removeItem: async (k: string) => void store.delete(k),
    },
  };
});


import {
  MockCounselorAI,
  ServerCounselorAI,
  performanceForTone,
  scenesToPerformance,
} from '../src/features/counseling/api/counselorAI';
import { createMockStagePort, spreadScenes } from '../src/features/counseling/bridge/stagePort';
import { signInAsDeveloper } from '../src/features/auth/api/session';
import { signedOut, storeGameToken } from '../src/features/auth/store/authStore';
import type {
  CounselingSubject,
  CounselorScene,
  OracleResultPayload,
} from '../src/features/counseling/types';

type FetchMock = jest.Mock<Promise<Response>, [string, RequestInit]>;

const stubFetch = (body: unknown, status = 200): FetchMock => {
  const res = { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
  const fn: FetchMock = jest.fn((_url: string, _init: RequestInit) => Promise.resolve(res));
  (globalThis as unknown as { fetch: FetchMock }).fetch = fn;
  return fn;
};
const bodyOf = (fn: FetchMock) => JSON.parse(fn.mock.calls[0][1].body as string);

const subject = { id: 's1', displayName: 'Me', isUser: true } as CounselingSubject;
// Every request now rides on an ACCOUNT. Signed in here with a game token already in hand, so
// `apiHeaders` makes no request of its own and `mock.calls[0]` is still the call under test.
beforeEach(() => {
  signInAsDeveloper('dev-test-account');
  storeGameToken('game-token-abc', Date.now() + 3_600_000);
});
afterEach(() => signedOut());

const realFetch = globalThis.fetch;
afterEach(() => {
  (globalThis as unknown as { fetch: typeof realFetch }).fetch = realFetch;
});

const ask = (overrides: Record<string, unknown> = {}) =>
  new ServerCounselorAI(new MockCounselorAI()).reply({
    counselorName: '유나',
    subject,
    userText: '올해 재물운은요?',
    turn: 2,
    lang: 'ko',
    sessionId: 'prayers-wood-wealth-1',
    ...overrides,
  });

const scene = (text: string, tone: string, hold?: number) => ({
  index: 0,
  text,
  tone,
  ...(hold === undefined ? {} : { hold_ms: hold }),
});

/* ── tone → what the room can draw ─────────────────────────────────────────── */

test('every tone the server can send maps to something drawable', () => {
  // The catalogue as `Prayers::Catalog::TONES` has it. A tone added there and forgotten here is the
  // failure this guards: it would reach the room and be silently flattened.
  const tones = [
    'neutral', 'emphasis', 'positive', 'negative', 'point', 'thinking', 'concerned',
    'reassuring', 'good_news', 'surprised', 'agree', 'disagree', 'sad', 'suspense',
    'reveal', 'heart', 'bless', 'card', 'analysis', 'element',
  ];
  const emotions = ['neutral', 'happy', 'thinking', 'concerned', 'surprised'];
  for (const tone of tones) {
    expect(emotions).toContain(performanceForTone(tone).emotion);
  }
  // Bad news must never arrive on a neutral face — that is the one reading the room cannot give.
  expect(performanceForTone('sad').emotion).toBe('concerned');
  expect(performanceForTone('negative').emotion).toBe('concerned');
});

test('a tone this build has never heard of degrades to a flat delivery, not a crash', () => {
  // The catalogue is SERVED so it can grow without an app release. An older app meeting a newer
  // tone is therefore normal, not exceptional.
  expect(performanceForTone('tarot_flourish')).toEqual({ emotion: 'neutral', animation: 'talk' });
});

test('scenes keep the server order and drop the ones with nothing to say', () => {
  const out = scenesToPerformance([
    scene('먼저 큰 흐름을 봅니다.', 'analysis', 3200),
    scene('   ', 'neutral'),
    scene('여기서 한 번 걸립니다.', 'concerned'),
  ]);

  expect(out?.map(s => s.text)).toEqual(['먼저 큰 흐름을 봅니다.', '여기서 한 번 걸립니다.']);
  expect(out?.[0].tone).toBe('analysis');
  expect(out?.[0].holdMs).toBe(3200);
  expect(out?.[0].emotion).toBe('thinking');
  // An empty scene is not a beat: it would cost a real hold on screen with nothing on it.
  expect(out).toHaveLength(2);
});

test('no scenes is undefined, not an empty run', () => {
  // The difference matters downstream: `[]` would read as "the server broke this into nothing".
  expect(scenesToPerformance(undefined)).toBeUndefined();
  expect(scenesToPerformance([])).toBeUndefined();
  expect(scenesToPerformance([scene('  ', 'neutral')])).toBeUndefined();
});

/* ── the request, and the answer coming back ───────────────────────────────── */

test('a turn asks for the break-up', async () => {
  const fetchMock = stubFetch({ content: '올해는 흐름이 좋습니다.', followup: false });
  await ask();
  expect(bodyOf(fetchMock).setting.scenes).toBe(true);
});

test('the pillars are said in the language being spoken, on the way out of the server', async () => {
  // The unit tests for sayGlyphs pass whether or not it is WIRED — removing the call from
  // ServerCounselorAI.reply left them all green. This is the one that fails: the defect was never
  // the transliteration table, it was a bare 庚 reaching a phone and being read aloud in Chinese
  // in the middle of an English sentence.
  stubFetch({
    content: 'This emphasis comes from 庚 in the month pillar.',
    followup: false,
    scenes: [scene('With 甲 Wood facing strong Metal, hold your ground.', 'analysis', 3000)],
  });

  const out = await ask({ lang: 'en' });

  expect(out.text).toBe('This emphasis comes from Geng in the month pillar.');
  // The scenes are what the voice actually speaks, one beat at a time — cleaning only `text` would
  // fix the bubble and leave the reading aloud exactly as broken.
  expect(out.scenes?.[0].text).toBe('With Jia Wood facing strong Metal, hold your ground.');
});

test('the reply opens on the first scene’s face, and carries the rest', async () => {
  stubFetch({
    content: '올해는 흐름이 좋습니다.',
    followup: false,
    scenes: [scene('흐름을 봅니다.', 'analysis'), scene('좋은 소식이 있습니다.', 'good_news')],
  });

  const resp = await ask();

  expect(resp.emotion).toBe('thinking');
  expect(resp.animation).toBe('thinking');
  expect(resp.scenes).toHaveLength(2);
  expect(resp.scenes?.[1].emotion).toBe('happy');
});

test('an untagged answer is still flat — nothing here guesses a face from the words', async () => {
  stubFetch({ content: '올해는 흐름이 좋습니다.', followup: false });
  const resp = await ask();
  expect(resp.emotion).toBe('neutral');
  expect(resp.scenes).toBeUndefined();
});

/* ── handing the scenes to the phases ──────────────────────────────────────── */

test('scenes are spread over the phases in order, never re-ordered', () => {
  const spread = spreadScenes([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 4);
  expect(spread).toEqual([[1, 2, 3], [4, 5, 6], [7, 8], [9, 10]]);
  // Flattened it is the reading again, unchanged. That is the whole invariant.
  expect(spread.flat()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test('fewer scenes than phases leaves the tail empty rather than repeating one', () => {
  expect(spreadScenes(['a', 'b'], 4)).toEqual([['a'], ['b'], [], []]);
  expect(spreadScenes([], 4)).toEqual([[], [], [], []]);
});

/** Drives the mock stage one turn and hands back the ORACLE_RESULT it produced. */
async function oracleFor(reply: { text: string; scenes?: CounselorScene[] }) {
  let result: OracleResultPayload | null = null;
  const port = createMockStagePort({
    onOracle: r => {
      result = r;
    },
    onSpeakDone: () => {},
    onExit: () => {},
    reply: async () => reply,
  });
  port.askOracle({ question: 'q', topic: 'wealth', scope: 'year' });
  await Promise.resolve();
  await Promise.resolve();
  return result as unknown as OracleResultPayload;
}

const performed = (text: string, tone: string): CounselorScene => ({
  text,
  tone,
  ...performanceForTone(tone),
});

test('the stage builds its beats from the scenes, one phase after another', async () => {
  const scenes = [
    performed('하나.', 'analysis'),
    performed('둘.', 'concerned'),
    performed('셋.', 'positive'),
    performed('넷.', 'reveal'),
  ];
  const result = await oracleFor({ text: '하나.\n둘.\n셋.\n넷.', scenes });

  expect(result.beats.map(b => b.phaseId)).toEqual(['P11', 'P14', 'P17', 'P19']);
  expect(result.beats.map(b => b.lines)).toEqual([['하나.'], ['둘.'], ['셋.'], ['넷.']]);
  expect(result.beats[1].scenes?.[0].tone).toBe('concerned');
});

test('without scenes the stage falls back to the paragraph split it always used', async () => {
  const result = await oracleFor({ text: 'A단락.\n\nB단락.\n\nC단락.\n\nD단락.' });

  expect(result.beats.map(b => b.lines[0])).toEqual(['A단락.', 'B단락.', 'C단락.', 'D단락.']);
  expect(result.beats.every(b => b.scenes === undefined)).toBe(true);
});
