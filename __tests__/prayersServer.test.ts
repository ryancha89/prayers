/**
 * The Prayers server client, and the seam where it hands back to the scripted stand-in.
 *
 * `devToken` is deliberately gitignored — see devToken.example.ts — so it is mocked virtually here
 * rather than required to exist. That also pins the auth headers to a known value, which is the
 * part most worth pinning: sending `User-Auth` alone is a 401, and that mistake looks exactly like
 * the server being down.
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
  checkConsultationReadiness,
  saveSajuProfile,
  fetchTopics,
  sendConsultationMessage,
  TicketRequiredError,
} from '../src/features/counseling/api/prayersServer';
import { MockCounselorAI, ServerCounselorAI } from '../src/features/counseling/api/counselorAI';
import { signInAsDeveloper } from '../src/features/auth/api/session';
import { signedOut, storeGameToken } from '../src/features/auth/store/authStore';
import type { CounselingSubject } from '../src/features/counseling/types';

type FetchMock = jest.Mock<Promise<Response>, [string, RequestInit]>;

/** Replaces global.fetch and hands back the mock, so the request can be read afterwards. */
const stubFetch = (body: unknown, status = 200): FetchMock => {
  const res = { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
  const fn: FetchMock = jest.fn((_url: string, _init: RequestInit) => Promise.resolve(res));
  (globalThis as unknown as { fetch: FetchMock }).fetch = fn;
  return fn;
};

const bodyOf = (fn: FetchMock, call = 0) => JSON.parse(fn.mock.calls[call][1].body as string);
const headersOf = (fn: FetchMock, call = 0) =>
  fn.mock.calls[call][1].headers as Record<string, string>;

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

describe('fetchTopics', () => {
  it('maps topic_key to key and asks in the caller language', async () => {
    const fetchSpy = stubFetch({
      success: true,
      language: 'vi',
      topics: [{ topic_key: 'wealth', label: 'Tiền bạc', description: 'Thu nhập.' }],
    });

    const cards = await fetchTopics('vi');

    expect(cards).toEqual([{ key: 'wealth', label: 'Tiền bạc', description: 'Thu nhập.' }]);
    expect(fetchSpy.mock.calls[0][0]).toContain('/api/v1/prayers/topics?language=vi');
    // The credential is now the account's own 24h game token, NOT the app-wide shared secret —
    // that is what lets a release build ship without a secret in the bundle. `User-Auth` still
    // rides along because several controllers read the uid straight off the header.
    expect(headersOf(fetchSpy)['Game-Token']).toBe('game-token-abc');
    expect(headersOf(fetchSpy)['User-Auth']).toBe('dev-test-account');
    expect(headersOf(fetchSpy)['Saju-Authorization']).toBeUndefined();
  });

  it('returns null on a bad response so the screen keeps its own list', async () => {
    stubFetch({}, 401);
    expect(await fetchTopics('en')).toBeNull();
  });

  it('drops malformed rows rather than rendering a card with no key', async () => {
    stubFetch({
      success: true,
      topics: [{ label: 'no key' }, { topic_key: 'life', label: 'Life' }],
    });
    expect(await fetchTopics('en')).toEqual([{ key: 'life', label: 'Life', description: '' }]);
  });
});

describe('sendConsultationMessage', () => {
  it('sends the shape the controller reads', async () => {
    const fetchSpy = stubFetch({
      content: 'a reading',
      followup: true,
      topic: { main: 'wealth' },
    });

    const turn = await sendConsultationMessage({
      uniqId: 'session_c_s',
      content: 'How is money this year?',
      lang: 'vi',
      tone: 'sunyeo',
      topic: 'wealth',
      scenes: true,
    });

    expect(turn).toEqual({
      text: 'a reading',
      followUp: true,
      mainTopic: 'wealth',
      suggestSwitch: null,
      scenes: undefined,
    });

    const body = bodyOf(fetchSpy);
    expect(body.uniq_id).toBe('session_c_s');
    // message is an OBJECT, not a string — the v2 shape this endpoint kept compatibility with.
    expect(body.message).toEqual({ content: 'How is money this year?' });
    expect(body.setting).toEqual({ lang: 'vi', tone: 'sunyeo', scenes: true });
    expect(body.base_info.info.topic).toBe('wealth');
  });

  it('omits scenes and tone rather than sending empties', async () => {
    const fetchSpy = stubFetch({ content: 'x' });
    await sendConsultationMessage({ uniqId: 'u', content: 'q', lang: 'en' });
    expect(bodyOf(fetchSpy).setting).toEqual({ lang: 'en' });
  });

  it('throws on 402, because a missing ticket is not a failed reading', async () => {
    stubFetch(
      {
        error: 'need a ticket',
        error_code: 'TICKET_INSUFFICIENT',
        cost: 1,
        balance: 0,
        shortfall: 1,
      },
      402,
    );

    await expect(sendConsultationMessage({ uniqId: 'u', content: 'q', lang: 'en' })).rejects.toThrow(
      TicketRequiredError,
    );
  });

  it('returns null on an upstream failure', async () => {
    stubFetch({ error_code: 'API_ERROR' }, 503);
    expect(await sendConsultationMessage({ uniqId: 'u', content: 'q', lang: 'en' })).toBeNull();
  });

  it('returns null on an empty answer, which is not an answer', async () => {
    stubFetch({ content: '' });
    expect(await sendConsultationMessage({ uniqId: 'u', content: 'q', lang: 'en' })).toBeNull();
  });
});

describe('ServerCounselorAI', () => {
  const ai = new ServerCounselorAI(new MockCounselorAI());

  it('answers with the server reading when there is one', async () => {
    stubFetch({ content: 'the real reading', followup: false });

    const res = await ai.reply({
      counselorName: 'Yuna',
      subject,
      topic: 'wealth',
      userText: 'q',
      turn: 2,
      lang: 'en',
      sessionId: 'session_1',
      tone: 'sunyeo',
    });

    expect(res.text).toBe('the real reading');
    expect(res.camera).toBe('default');
  });

  it('never sends `other`, which the classifier does not know', async () => {
    const fetchSpy = stubFetch({ content: 'r' });

    await ai.reply({
      counselorName: 'Yuna',
      subject,
      topic: 'other',
      userText: 'q',
      turn: 2,
      lang: 'en',
      sessionId: 'session_1',
    });

    expect(bodyOf(fetchSpy).base_info.info).toEqual({});
  });

  it('falls back to the scripted reply when the server cannot answer', async () => {
    stubFetch({}, 503);

    const res = await ai.reply({
      counselorName: 'Yuna',
      subject,
      userText: 'q',
      turn: 2,
      lang: 'en',
      sessionId: 'session_1',
    });

    expect(res.text.length).toBeGreaterThan(0);
    expect(res.text).not.toBe('the real reading');
  });

  it('does not call the server at all without a session id', async () => {
    const fetchSpy = stubFetch({});
    await ai.reply({ counselorName: 'Yuna', subject, userText: 'q', turn: 2, lang: 'en' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('checkConsultationReadiness', () => {
  it('is ok only when the server answers AND the user has a chart', async () => {
    stubFetch({ success: true, has_saju: true });
    expect(await checkConsultationReadiness()).toBe('ok');
  });

  it('reports no-chart on a healthy 200, which is what the room actually hit', async () => {
    // The failure this whole check exists for: the server is up and prompt, and the consultation
    // still cannot happen. Treating it as a connection problem sends the player back to retry
    // something that can never succeed.
    stubFetch({ success: true, has_saju: false });
    expect(await checkConsultationReadiness()).toBe('no-chart');
  });

  it('reports offline on a refused or unreachable server', async () => {
    stubFetch({}, 401);
    expect(await checkConsultationReadiness()).toBe('offline');

    stubFetch({ success: false });
    expect(await checkConsultationReadiness()).toBe('offline');
  });

  it('reports offline rather than throwing when fetch itself fails', async () => {
    const fn = jest.fn(() => Promise.reject(new Error('network down')));
    (globalThis as unknown as { fetch: typeof fn }).fetch = fn;
    expect(await checkConsultationReadiness()).toBe('offline');
  });
});

describe('saveSajuProfile', () => {
  it('splits the date and time the way the calendar expects', async () => {
    const fetchSpy = stubFetch({ success: true, saju_data: {} });

    const ok = await saveSajuProfile({
      name: 'Linh',
      birthDate: '1995-06-15',
      birthTime: '09:00',
      gender: 'female',
    });

    expect(ok).toBe(true);
    expect(fetchSpy.mock.calls[0][0]).toContain('/api/v1/saju/save');
    const body = bodyOf(fetchSpy);
    expect(body).toMatchObject({
      name: 'Linh',
      year: 1995,
      month: 6,
      day: 15,
      hour: 9,
      minute: 0,
      // Sent explicitly: the server defaults a missing gender to male, which changes the reading
      // instead of failing.
      gender: 'female',
      time_unknown: false,
    });
  });

  it('sends time_unknown and NO hour when the time is blank', async () => {
    // An hour alongside time_unknown would be read as a real hour by the pillar adjustment and
    // could move the day pillar across the 23:00 boundary.
    const fetchSpy = stubFetch({ success: true });
    await saveSajuProfile({ name: 'A', birthDate: '2000-01-02', gender: 'male' });

    const body = bodyOf(fetchSpy);
    expect(body.time_unknown).toBe(true);
    expect(body.hour).toBeUndefined();
    expect(body.minute).toBeUndefined();
  });

  it('refuses a malformed date without calling the server', async () => {
    const fetchSpy = stubFetch({ success: true });
    expect(await saveSajuProfile({ name: 'A', birthDate: '15/06/1995', gender: 'male' })).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('is false when the server does not confirm', async () => {
    stubFetch({ success: false });
    expect(await saveSajuProfile({ name: 'A', birthDate: '2000-01-02', gender: 'male' })).toBe(false);

    stubFetch({}, 500);
    expect(await saveSajuProfile({ name: 'A', birthDate: '2000-01-02', gender: 'male' })).toBe(false);
  });
});
