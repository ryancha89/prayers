/**
 * Spec 006 T018/T020/T032 — the diary inside My Room, with the embedded player present.
 *
 * Pinned: MYROOM_INIT carries the newest entry as the book page; the desk book's `write` is labelled
 * and its ACT_STATE opens Write, and closing ends the act; the top bar's Diary button opens My Diary
 * with no desk at all; entries written in the 아카이브 tab before the diary are listed, filterable by
 * kind; deleting the newest sends MYROOM_BOOK with the next newest; Talk to Counselor replaces the
 * room with CounselorDetail carrying the entry as focusMemoryId.
 */
import React from 'react';
import { Alert } from 'react-native';
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
jest.mock('../src/shared/audio/sfx', () => ({
  sfx: { tap: jest.fn(), select: jest.fn(), back: jest.fn(), send: jest.fn() },
}));
jest.mock('../src/features/auth/api/headers', () => ({ authedFetch: async () => null, apiHeaders: async () => null }));
jest.mock('../src/features/coins/api/coinsApi', () => ({ refreshCoins: jest.fn(), buyCoins: jest.fn() }));
jest.mock('../src/features/myroom/diary/diaryApi', () => ({
  syncDiary: jest.fn(async () => {}),
  flushPhotos: jest.fn(async () => {}),
  awaitReflection: jest.fn(async () => null),
  photoSource: async (u: string) => ({ uri: u }),
}));
const mockNavigate = jest.fn();
const mockReplace = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, replace: mockReplace, goBack: jest.fn(), addListener: () => () => {} }),
  useFocusEffect: () => {},
}));
jest.mock('../src/features/counseling/bridge', () => {
  const { NativeUnityBridge } = jest.requireActual('../src/features/counseling/bridge/NativeUnityBridge');
  const bridge = new NativeUnityBridge();
  const posted: { type: string; payload?: unknown }[] = [];
  bridge.registerView({ postMessage: (_g: string, _m: string, message: string) => posted.push(JSON.parse(message)) });
  return {
    isNativeUnity: () => true, nativeUnityBridge: bridge, getUnityBridge: () => bridge,
    getWorldBridge: () => bridge, getMyRoomBridge: () => bridge, mockPosted: posted,
  };
});
jest.mock('../src/features/counseling/components/UnityHost', () => ({ UnityHost: () => null }));

import { MyRoomScreen, myRoomActLabel } from '../src/features/myroom/screens/MyRoomScreen';
import { actIcon } from '../src/features/myroom/components/ItemPrompt';
import { nativeUnityBridge } from '../src/features/counseling/bridge';
import { useArchiveStore } from '../src/features/archive/store/archiveStore';
import { useLanguageStore } from '../src/shared/i18n';
import type { ArchiveMemory } from '../src/features/archive/types';

const { mockPosted } = jest.requireMock('../src/features/counseling/bridge') as { mockPosted: { type: string; payload?: any }[] };
const posts = (type: string) => mockPosted.filter(p => p.type === type);
const fromUnity = (event: object) => act(() => nativeUnityBridge.receiveFromUnity(JSON.stringify(event)));
const find = (r: ReactTestRenderer.ReactTestRenderer, id: string) => r.root.findAll(n => n.props.testID === id && typeof n.type !== 'string');
const shown = (r: ReactTestRenderer.ReactTestRenderer, id: string) => find(r, id).length > 0;
const press = (r: ReactTestRenderer.ReactTestRenderer, id: string) => act(async () => find(r, id)[0].props.onPress());

const row = (id: string, category: ArchiveMemory['category'], date: string, content: string, details: Record<string, string> = {}): ArchiveMemory => ({
  id, category, content, details: { date, ...details }, importance: 2, confidence: 1, source: 'manual', aiEnabled: true,
  createdAt: `${date}T09:00:00Z`, updatedAt: `${date}T09:00:00Z`,
});

let r: ReactTestRenderer.ReactTestRenderer;
async function render() {
  await act(async () => { r = ReactTestRenderer.create(<MyRoomScreen />); });
  return r;
}

beforeEach(() => {
  jest.useFakeTimers();
  mockPosted.length = 0;
  mockReplace.mockReset();
  useLanguageStore.setState({ lang: 'en' } as never);
  useArchiveStore.setState({
    // Written in the 아카이브 tab before the diary existed, plus a non-diary row.
    memories: [
      row('d_old', 'diary', '2026-10-01', 'Quiet Sunday', { mood: 'okay', counselor: 'dosa' }),
      row('g_1', 'goal', '2026-10-03', 'Run 10k', { status: 'doing' }),
      row('w_new', 'wish', '2026-10-05', 'See the aurora', { counselor: 'sudam' }),
      row('like_1', 'like', '2026-10-06', 'Rain'),
    ],
    discoveries: [], dirty: [], deleted: [], answeredQuestions: [],
  });
});
afterEach(() => {
  act(() => r?.unmount());
  jest.useRealTimers();
});

it('names the write action, with a pen', () => {
  expect(myRoomActLabel('write', false, false)).toBe('myroom.act.write');
  expect(myRoomActLabel('write', true, false)).toBe('myroom.act.back');
  expect(actIcon('write')).toBe('pen');
});

it('opens the room on the newest entry’s page', async () => {
  await render();
  expect(posts('MYROOM_INIT')[0].payload).toEqual({
    lang: 'en', book: { id: 'w_new', kind: 'wish', date: 'Mon, October 5, 2026', text: 'See the aurora' },
  });
});

it('the book’s Write opens over the room on ACT_STATE, and closing it ends the act', async () => {
  await render();
  fromUnity({ type: 'MYROOM_READY' });
  fromUnity({ type: 'MYROOM_NEAR_ITEM', payload: { uid: 'book1', item: 'DiaryBook', action: 'write', near: true, active: false } });
  expect(shown(r, 'myroom-act')).toBe(true);
  await press(r, 'myroom-act');
  expect(posts('MYROOM_ACT').map(p => p.payload)).toEqual([{ uid: 'book1', action: 'write' }]);
  fromUnity({ type: 'MYROOM_ACT_STATE', payload: { uid: 'book1', action: 'write', active: true } });
  expect(shown(r, 'diary-write')).toBe(true);
  expect(shown(r, 'myroom-look')).toBe(false); // the room's controls are off under the sheet
  await press(r, 'diary-write-close');
  expect(shown(r, 'diary-write')).toBe(false);
  expect(posts('MYROOM_ACT_END')).toHaveLength(1);
});

it('the top bar opens My Diary: the old rows, newest first, filterable; delete sends the next page', async () => {
  await render();
  fromUnity({ type: 'MYROOM_READY' });
  await press(r, 'myroom-diary');
  const listed = () => r.root.findAll(n => typeof n.props.testID === 'string' && n.props.testID.startsWith('diary-row-') && typeof n.type !== 'string').map(n => n.props.testID).filter((v, i, a) => a.indexOf(v) === i);
  expect(listed()).toEqual(['diary-row-w_new', 'diary-row-g_1', 'diary-row-d_old']);
  await act(async () => find(r, 'diary-filter-goal')[0].props.onPress());
  expect(listed()).toEqual(['diary-row-g_1']);
  await act(async () => find(r, 'diary-filter-all')[0].props.onPress());

  await press(r, 'diary-row-w_new');
  expect(shown(r, 'diary-detail')).toBe(true);
  const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => buttons?.find(b => b.style === 'destructive')?.onPress?.());
  await press(r, 'diary-detail-delete');
  alert.mockRestore();
  expect(useArchiveStore.getState().memories.map(m => m.id)).not.toContain('w_new');
  expect(posts('MYROOM_BOOK').pop()?.payload).toEqual({ book: { id: 'g_1', kind: 'goal', date: 'Sat, October 3, 2026', text: 'Run 10k' } });
  expect(shown(r, 'diary-list')).toBe(true);
});

it('Talk to Counselor replaces the room with the entry’s counsellor and the entry as focus', async () => {
  await render();
  await press(r, 'myroom-diary');
  await press(r, 'diary-row-d_old');
  await press(r, 'diary-detail-talk');
  expect(mockReplace).toHaveBeenCalledWith('CounselorDetail', { counselorId: 'jiho', focusMemoryId: 'd_old' });
});

it('My Diary’s tabs: Favorites filters, Calendar and Mood open their screens, ⋯ opens My Journey; Detail returns to where it came from', async () => {
  await render();
  await press(r, 'myroom-diary');
  const listed = () => r.root.findAll(n => typeof n.props.testID === 'string' && n.props.testID.startsWith('diary-row-') && typeof n.type !== 'string').map(n => n.props.testID).filter((v, i, a) => a.indexOf(v) === i);

  // The heart in Detail marks a favourite; the Favorites tab then lists only it.
  await press(r, 'diary-row-g_1');
  await press(r, 'diary-detail-favorite');
  expect(useArchiveStore.getState().memories.find(m => m.id === 'g_1')?.details.favorite).toBe('1');
  await press(r, 'diary-detail-close');
  await press(r, 'diary-view-favorites');
  expect(listed()).toEqual(['diary-row-g_1']);
  await press(r, 'diary-view-all');
  expect(listed()).toHaveLength(3);

  // Calendar: tapping a day lists it; its Detail closes back onto the calendar.
  await press(r, 'diary-view-calendar');
  expect(shown(r, 'diary-calendar')).toBe(true);
  // The calendar opens on today's month; step back to October 2026 if the test clock is elsewhere.
  const target = '2026-10';
  for (let i = 0; i < 60 && !shown(r, `diary-day-${target}-05`); i++) {
    await press(r, new Date().toISOString().slice(0, 7) > target ? 'diary-calendar-prev' : 'diary-calendar-next');
  }
  await press(r, 'diary-day-2026-10-05');
  expect(listed()).toEqual(['diary-row-w_new']);
  await press(r, 'diary-row-w_new');
  await press(r, 'diary-detail-close');
  expect(shown(r, 'diary-calendar')).toBe(true);
  await press(r, 'diary-calendar-close');

  // Mood: picking Okay leaves the one okay diary.
  await press(r, 'diary-view-mood');
  await press(r, 'diary-browse-mood-okay');
  expect(listed()).toEqual(['diary-row-d_old']);
  await press(r, 'diary-browse-close');

  // ⋯ → My Journey, one month on the timeline; Goals lists the goal and the wish.
  await press(r, 'diary-list-journey');
  expect(shown(r, 'diary-journey-month-2026-10')).toBe(true);
  await press(r, 'diary-journey-tab-goals');
  expect(listed()).toEqual(['diary-row-w_new', 'diary-row-g_1']);
});
