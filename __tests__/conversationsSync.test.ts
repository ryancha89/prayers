/**
 * The conversations tab reads the ACCOUNT, and the phone is only its cache.
 *
 * Until 18-09 a past consultation existed in exactly one place: AsyncStorage on the device that
 * held it. Reinstall the app, or sign in on a second phone, and every reading was gone — while the
 * server had kept every turn all along, which is how the room's own "last time we talked about
 * money" line works.
 *
 * These tests pin the reconciliation, because the interesting part is not the fetch — it is which
 * half wins. The server owns that a thread happened, when, and what was last said; the device owns
 * the transcript bodies, which the list endpoint does not carry. Neither may erase the other.
 */
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

import { syncConversationsFromServer } from '../src/features/conversations/syncConversations';
import { useConversationsStore } from '../src/features/conversations/store/conversationsStore';
import { signInAsDeveloper } from '../src/features/auth/api/session';
import { signedOut, storeGameToken } from '../src/features/auth/store/authStore';

type FetchMock = jest.Mock<Promise<Response>, [string, RequestInit]>;

const stubFetch = (body: unknown, status = 200): FetchMock => {
  const res = { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
  const fn: FetchMock = jest.fn((_url: string, _init: RequestInit) => Promise.resolve(res));
  (globalThis as unknown as { fetch: FetchMock }).fetch = fn;
  return fn;
};

const thread = (over: Partial<Record<string, unknown>> = {}) => ({
  uniq_id: 'session_yunjung_self',
  counselor: 'yunjung',
  subject: 'self',
  topic: 'wealth',
  topic_label: 'Tiền bạc',
  turns: 3,
  last_seen_at: '2026-09-17T10:00:00.000Z',
  last_question: 'Năm nay tiền bạc thế nào?',
  last_answer: 'Nên lấy sự đều đặn làm trọng.',
  ...over,
});

const realFetch = globalThis.fetch;

beforeEach(() => {
  signInAsDeveloper('dev-test-account');
  storeGameToken('game-token-abc', Date.now() + 3_600_000);
  useConversationsStore.setState({ byId: {}, order: [] });
});

afterEach(() => {
  signedOut();
  (globalThis as unknown as { fetch: typeof realFetch }).fetch = realFetch;
});

it('asks the account, in the player language, and lands the threads on the device', async () => {
  const fetchSpy = stubFetch({ success: true, conversations: [thread()] });

  const count = await syncConversationsFromServer('vi');

  expect(count).toBe(1);
  expect(fetchSpy.mock.calls[0][0]).toContain('/api/v1/prayers/consultations?language=vi');

  const row = useConversationsStore.getState().byId['session_yunjung_self'];
  expect(row.counselorId).toBe('yunjung');
  expect(row.subjectId).toBe('self');
  // Her answer, not the question: it is the later of the two, and the one that says where the
  // conversation got to.
  expect(row.lastMessage).toBe('Nên lấy sự đều đặn làm trọng.');
  expect(row.lastTopicSummary).toBe('Tiền bạc');
  expect(row.updatedAt).toBe('2026-09-17T10:00:00.000Z');
});

it('keeps the transcript this device has cached — the list endpoint does not carry it', async () => {
  useConversationsStore.setState({
    byId: {
      session_yunjung_self: {
        sessionId: 'session_yunjung_self',
        counselorId: 'yunjung',
        counselorName: 'Go Yunjung',
        counselorAccent: '#111',
        lastMessage: 'stale',
        updatedAt: '2026-09-01T00:00:00.000Z',
        messages: [{ id: 'm1', role: 'user', text: 'câu cũ', at: '2026-09-01T00:00:00.000Z' }],
      },
    },
    order: ['session_yunjung_self'],
  });

  stubFetch({ success: true, conversations: [thread()] });
  await syncConversationsFromServer('vi');

  const row = useConversationsStore.getState().byId['session_yunjung_self'];
  expect(row.messages).toHaveLength(1);
  expect(row.messages[0].text).toBe('câu cũ');
  // ...and the server still wins on everything it does know about.
  expect(row.lastMessage).toBe('Nên lấy sự đều đặn làm trọng.');
  expect(row.updatedAt).toBe('2026-09-17T10:00:00.000Z');
});

it('orders every thread by when it was last touched, local-only ones included', async () => {
  useConversationsStore.setState({
    byId: {
      session_theo_mother: {
        sessionId: 'session_theo_mother',
        counselorId: 'theo',
        counselorName: 'Theo',
        counselorAccent: '#222',
        lastMessage: 'đang nói dở',
        updatedAt: '2026-09-18T09:00:00.000Z',
        messages: [],
      },
    },
    order: ['session_theo_mother'],
  });

  stubFetch({ success: true, conversations: [thread()] });
  await syncConversationsFromServer('vi');

  // The session still open on this phone is newer than anything the account has written down, so
  // it stays on top rather than being pushed under the server's list.
  expect(useConversationsStore.getState().order).toEqual([
    'session_theo_mother',
    'session_yunjung_self',
  ]);
});

it('leaves the list alone when the account cannot be asked', async () => {
  useConversationsStore.setState({
    byId: {
      session_yunjung_self: {
        sessionId: 'session_yunjung_self',
        counselorId: 'yunjung',
        counselorName: 'Go Yunjung',
        counselorAccent: '#111',
        lastMessage: 'vẫn còn đây',
        updatedAt: '2026-09-01T00:00:00.000Z',
        messages: [],
      },
    },
    order: ['session_yunjung_self'],
  });

  // A server too old to have the route. `null`, and emphatically not an empty list: blanking a
  // player's history because a deploy is late is the bug this whole feature is about.
  stubFetch({ error: 'Not Found' }, 404);
  const count = await syncConversationsFromServer('vi');

  expect(count).toBeNull();
  expect(useConversationsStore.getState().order).toEqual(['session_yunjung_self']);
  expect(useConversationsStore.getState().byId['session_yunjung_self'].lastMessage).toBe(
    'vẫn còn đây',
  );
});

it('drops a row it could not draw rather than showing a faceless one', async () => {
  // Unity's own room writes a key built from the subject and the tone, carrying no card id. The
  // server already filters those out; this pins that the client does not re-admit them.
  stubFetch({
    success: true,
    conversations: [thread(), { uniq_id: 'femaleJiwon癸sudam', turns: 2 }],
  });

  const count = await syncConversationsFromServer('vi');

  expect(count).toBe(1);
  expect(useConversationsStore.getState().order).toEqual(['session_yunjung_self']);
});
