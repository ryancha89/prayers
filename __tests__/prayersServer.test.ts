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
jest.mock('../src/shared/device/deviceId', () => ({ getDeviceId: () => 'device-abc' }));
jest.mock('../src/shared/devlog', () => ({ devlog: () => {} }));

import {
  checkConsultationReadiness,
  fetchTopics,
  sendConsultationMessage,
  TicketRequiredError,
} from '../src/features/counseling/api/prayersServer';
import { MockCounselorAI, ServerCounselorAI } from '../src/features/counseling/api/counselorAI';
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
    // Both headers, not one. The static token gets the request through the door; User-Auth only
    // decides which guest it is once inside.
    expect(headersOf(fetchSpy)['Saju-Authorization']).toBe('Bearer-test-token');
    expect(headersOf(fetchSpy)['User-Auth']).toBe('device-abc');
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
