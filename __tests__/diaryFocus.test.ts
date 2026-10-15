/**
 * Spec 006 T031 + the book's bridge message (T018).
 *
 * Pinned: a consultation begun from a diary entry carries it as `focusMemoryId` on its FIRST ask
 * only — on ORACLE_ASK to the embedded player, and as top-level `focus_memory_id` on the Prayers
 * consultation path — and a start that did not come from the diary carries none. A book page set
 * while the room is still loading is sent once the room is up.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));
jest.mock('../src/shared/devlog', () => ({ devlog: () => {} }));
const mockFetch = jest.fn();
jest.mock('../src/features/auth/api/headers', () => ({
  apiHeaders: async () => ({ 'Content-Type': 'application/json' }),
  authedFetch: (url: string, init: RequestInit) => mockFetch(url, init),
}));

import { useCounselingStore } from '../src/features/counseling/store/counselingStore';
import { createStagePort } from '../src/features/counseling/bridge/stagePort';
import { sendConsultationMessage } from '../src/features/counseling/api/prayersServer';
import { NativeUnityBridge } from '../src/features/counseling/bridge/NativeUnityBridge';
import type { UnityBridge } from '../src/features/counseling/types';

const card = { id: 'jiho', characterId: 'jiho_01' } as never;

it('the focus lasts the session, and a start not from the diary has none', () => {
  useCounselingStore.getState().begin(card, { focusMemoryId: 'mem_1' });
  expect(useCounselingStore.getState().currentFocus()).toBe('mem_1');
  expect(useCounselingStore.getState().currentFocus()).toBe('mem_1');
  useCounselingStore.getState().begin(card, { focusMemoryId: 'mem_2' });
  useCounselingStore.getState().begin(card);
  expect(useCounselingStore.getState().currentFocus()).toBeUndefined();
});

it('leaving the room clears the focus, so a resumed session (no begin) never carries the entry', () => {
  useCounselingStore.getState().begin(card, { focusMemoryId: 'mem_5' });
  useCounselingStore.getState().clearFocus();
  expect(useCounselingStore.getState().currentFocus()).toBeUndefined();
});

it('rides on every ORACLE_ASK of the session (the first is often the memory-free reading)', () => {
  const sent: any[] = [];
  const bridge = { sendEvent: (e: unknown) => sent.push(e) } as unknown as UnityBridge;
  useCounselingStore.getState().begin(card, { focusMemoryId: 'mem_9' });
  const port = createStagePort(bridge, () => {}, () => useCounselingStore.getState().currentFocus());
  port.askOracle({ question: 'q1', topic: 'general', scope: 'self' });
  port.askOracle({ question: 'q2', topic: 'general', scope: 'self', loop: true });
  expect(sent.map(e => e.payload.focusMemoryId)).toEqual(['mem_9', 'mem_9']);
});

it('goes out as top-level focus_memory_id on the Prayers path, and not at all when unset', async () => {
  mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ content: 'hi' }) });
  await sendConsultationMessage({ uniqId: 'u', content: 'q', lang: 'en', focusMemoryId: 'mem_3' });
  await sendConsultationMessage({ uniqId: 'u', content: 'q', lang: 'en' });
  const bodies = mockFetch.mock.calls.map(c => JSON.parse(c[1].body));
  expect(bodies[0].focus_memory_id).toBe('mem_3');
  expect('focus_memory_id' in bodies[1]).toBe(false);
  expect(mockFetch.mock.calls[0][0]).toMatch(/\/api\/v1\/prayers\/consultations\/message$/);
});

it('a page set while the room loads is folded into INIT retries and sent on MYROOM_READY', () => {
  jest.useFakeTimers();
  const posted: any[] = [];
  const bridge = new NativeUnityBridge();
  bridge.registerView({ postMessage: (_g: string, _m: string, m: string) => posted.push(JSON.parse(m)) });
  bridge.openMyRoom({ lang: 'ko', book: null });
  const page = { id: 'm', kind: 'diary' as const, date: '2026년 10월 7일 (수)', text: '오늘' };
  bridge.sendMyRoomBook(page);
  expect(posted.filter(p => p.type === 'MYROOM_BOOK')).toHaveLength(0);
  jest.advanceTimersByTime(1600);
  expect(posted.filter(p => p.type === 'MYROOM_INIT').pop().payload.book).toEqual(page);
  bridge.receiveFromUnity(JSON.stringify({ type: 'MYROOM_READY' }));
  expect(posted.filter(p => p.type === 'MYROOM_BOOK').map(p => p.payload)).toEqual([{ book: page }]);
  bridge.sendMyRoomBook(null);
  expect(posted.filter(p => p.type === 'MYROOM_BOOK').pop().payload).toEqual({ book: null });
  bridge.closeMyRoom();
  jest.useRealTimers();
});
