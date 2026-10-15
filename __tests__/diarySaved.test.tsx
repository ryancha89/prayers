/**
 * Spec 006 T029 — Diary Saved.
 *
 * Pinned (SC-003): the first frame already says something — "{name} is reading your page…" with the
 * entry's counsellor — before any answer; the server's reflection then replaces it, with its topic
 * chips localised (an unknown id → "Other"); a server fallback line shows as-is; no server at all
 * says the page is safe on the phone; still pending at the end of the wait says so. The reflection
 * text is only ever the server's.
 */
import { useAuthStore } from '../src/features/auth/store/authStore';
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));
jest.mock('react-native-sound', () => null);
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('../src/shared/devlog', () => ({ devlog: () => {} }));
jest.mock('../src/shared/audio/sfx', () => ({ sfx: { tap: jest.fn(), select: jest.fn(), back: jest.fn() } }));
jest.mock('../src/features/auth/api/headers', () => ({ apiHeaders: async () => null, authedFetch: async () => null }));
const mockAwait = jest.fn();
jest.mock('../src/features/myroom/diary/diaryApi', () => ({
  awaitReflection: (...a: unknown[]) => mockAwait(...a),
  photoSource: async (u: string) => ({ uri: u }),
}));

import { DiarySavedSheet } from '../src/features/myroom/diary/components/DiarySavedSheet';
import { useArchiveStore } from '../src/features/archive/store/archiveStore';
import { useLanguageStore } from '../src/shared/i18n';

const lineOf = (r: ReactTestRenderer.ReactTestRenderer) =>
  ([] as unknown[]).concat(r.root.findAll(n => n.props.testID === 'diary-saved-line' && n.props.children !== undefined)[0].props.children).join('');
const allText = (r: ReactTestRenderer.ReactTestRenderer) => JSON.stringify(r.toJSON());

let id = '';
beforeEach(() => {
  mockAwait.mockReset();
  useLanguageStore.setState({ lang: 'en' } as never);
  useArchiveStore.setState({ memories: [], discoveries: [], dirty: [], deleted: [], answeredQuestions: [] });
  id = useArchiveStore.getState().add({ category: 'diary', content: 'x', details: { mood: 'good', counselor: 'dosa', date: '2026-10-07' } }).id;
});

async function render(onTalk = jest.fn()) {
  let r!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    r = ReactTestRenderer.create(<DiarySavedSheet memoryId={id} onView={jest.fn()} onTalk={onTalk} onClose={jest.fn()} />);
  });
  return r;
}

it('shows the player’s own page reading on the first frame (their name, not a counsellor’s), then the reflection and topics', async () => {
  useAuthStore.setState({ displayName: 'Linh' } as never);
  let land!: (v: unknown) => void;
  let update!: (r: unknown) => void;
  mockAwait.mockImplementation((_id: string, lang: string, opts: { onUpdate: (r: unknown) => void }) => {
    expect(lang).toBe('en');
    update = opts.onUpdate;
    return new Promise(res => { land = res; });
  });
  const r = await render();
  expect(lineOf(r)).toBe('Reading your page…');
  // The player's bubble carries their name and their own words; the counsellor only names the way out.
  const byTest = (id: string) => r.root.findAll(n => n.props.testID === id && typeof n.props.children === 'string')[0];
  expect(byTest('diary-saved-page-name').props.children).toBe('Linh');
  expect(byTest('diary-saved-page').props.children).toBe('x');
  expect(allText(r)).toContain('Talk with Jiho');
  const ready = { status: 'ready', text: 'You carried a lot today.', topics: ['work', 'rest', 'astral'], counselor: 'dosa', lang: 'en', stale: false };
  await act(async () => { update(ready); land(ready); });
  expect(lineOf(r)).toBe('You carried a lot today.');
  const text = allText(r);
  expect(text).toContain('Work');
  expect(text).toContain('Rest');
  expect(text).toContain('Other');
});

it('shows the server’s fallback line as it is', async () => {
  const fb = { status: 'fallback', text: 'Thank you for writing today.', topics: [], counselor: 'dosa', lang: 'en', stale: false };
  mockAwait.mockImplementation(async (_i: string, _l: string, o: { onUpdate: (r: unknown) => void }) => { o.onUpdate(fb); return fb; });
  const r = await render();
  expect(lineOf(r)).toBe('Thank you for writing today.');
});

it('with no server: the page is safe on the phone; still pending at 45 s: still reading', async () => {
  mockAwait.mockResolvedValueOnce(null);
  let r = await render();
  expect(lineOf(r)).toBe("Saved on this phone. The reflection will come once you're back online.");
  mockAwait.mockResolvedValueOnce({ status: 'pending', text: '', topics: [] });
  r = await render();
  expect(lineOf(r)).toBe('Still reading. The reflection will be waiting in your diary.');
});

it('with the AI switch off: nothing is asked for, the page is kept just for the player', async () => {
  useArchiveStore.getState().setAiEnabled(id, false);
  const r = await render();
  expect(mockAwait).not.toHaveBeenCalled();
  expect(lineOf(r)).toBe('Saved just for you.');
});

it('Talk to Counselor hands over', async () => {
  mockAwait.mockResolvedValue(null);
  const onTalk = jest.fn();
  const r = await render(onTalk);
  await act(async () => r.root.findAll(n => n.props.testID === 'diary-saved-talk')[0].props.onPress());
  expect(onTalk).toHaveBeenCalled();
});
