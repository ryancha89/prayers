/**
 * The question "is the embedded player here" may be answered wrongly, so the answer must not be
 * frozen.
 *
 * On 2026-09-14 the devlog caught two reloads, a minute apart, both logging "absent — using mock"
 * on a build whose UnityFramework was demonstrably linked — the cold launches either side of them
 * logged DETECTED. The cost is not a warning: `absent` swaps the whole embedded game for a JS mock.
 * The room still opens, the flow still runs, the text still appears, and there is no counselor, no
 * voice, no music and no SFX — with nothing on screen saying so. It was reported as "the sound work
 * didn't land", which is the only thing it could look like from outside.
 *
 * The old code asked once at module scope and kept whatever it got. These pin the two halves of the
 * rule that replaced it: a `false` is "not yet", a `true` is forever.
 */
// `mock` prefix: jest only lets a module factory close over variables named this way.
let mockAnswer = false;

jest.mock('react-native', () => ({
  UIManager: { hasViewManagerConfig: () => mockAnswer },
  NativeModules: {},
  Platform: { OS: 'ios', select: (o: Record<string, unknown>) => o.ios },
}));

// The bridge pulls these in; none of them is what is under test here.
jest.mock('../src/features/counseling/bridge/NativeUnityBridge', () => ({
  NativeUnityBridge: class {},
}));
jest.mock('../src/features/counseling/bridge/MockUnityBridge', () => ({
  MockUnityBridge: class {},
}));
jest.mock('../src/shared/devlog', () => ({ devlog: () => {} }));
jest.mock('../src/shared/config/api', () => ({ apiBase: () => 'http://localhost:4000' }));

type Bridge = typeof import('../src/features/counseling/bridge');

/** A fresh module registry, so each test sees the import-time answer it set up. */
function freshBridge(): Bridge {
  jest.resetModules();
  // require, not import(): jest's VM has no dynamic import without --experimental-vm-modules.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../src/features/counseling/bridge');
}

test('a "no" at import is only "not yet" — the next ask decides again', () => {
  mockAnswer = false;
  const bridge = freshBridge();
  expect(bridge.isNativeUnity()).toBe(false);

  // The player registers a moment later, or the context settles: the room asks when it opens.
  mockAnswer = true;
  expect(bridge.isNativeUnity()).toBe(true);
});

test('the bridge follows — a screen opening later does not keep talking to the mock', () => {
  mockAnswer = false;
  const bridge = freshBridge();
  const early = bridge.getUnityBridge();

  mockAnswer = true;
  expect(bridge.getUnityBridge()).not.toBe(early);
  expect(bridge.getUnityBridge()).toBe(bridge.nativeUnityBridge);
});

test('a "yes" is kept: a view manager that exists does not stop existing', () => {
  mockAnswer = true;
  const bridge = freshBridge();
  expect(bridge.isNativeUnity()).toBe(true);

  // A later false must not tear a live session off the player mid-consultation.
  mockAnswer = false;
  expect(bridge.isNativeUnity()).toBe(true);
  expect(bridge.getUnityBridge()).toBe(bridge.nativeUnityBridge);
});

test('a throwing UIManager is a "not yet", not a crash', () => {
  mockAnswer = false;
  const bridge = freshBridge();
  const spy = jest
    .spyOn(require('react-native').UIManager, 'hasViewManagerConfig')
    .mockImplementation(() => {
      throw new Error('no such view manager');
    });
  expect(bridge.isNativeUnity()).toBe(false);
  spy.mockRestore();
});
