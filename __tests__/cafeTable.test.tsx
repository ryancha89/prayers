/**
 * Spec 007 — the coffee shop's table service (tarot with an AI reader, coffee with a fortune cookie),
 * driven end to end through the MockUnityBridge standing in for Unity and a mocked saju_server.
 *
 * Pinned here, because none of it shows until a device runs it:
 *  · the order of the contract's messages: nothing paid goes to Unity (SPREAD, COFFEE_ORDER) before
 *    the player confirmed, and nothing is charged before CAFE_CARDS_CHOSEN,
 *  · a 503 is retried with the SAME request_id (the ledger's idempotency), a new purchase gets a new one,
 *  · the confirmation names the price and the balance, and short of coins leads to the coin shop,
 *  · the wallet follows every answer's `coins_balance`,
 *  · while picking and while the cookie waits nothing of RN but the End button takes a touch,
 *  · End / standing up drop a late answer rather than reviving a finished reading.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';

// Whole-flow tests render the cafe many times over; under a parallel run they pass 5 s.
jest.setTimeout(20000);

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));
jest.mock('react-native-sound', () => null);
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('../src/shared/devlog', () => ({ devlog: jest.fn() }));
jest.mock('../src/shared/audio/sfx', () => ({
  sfx: { tap: jest.fn(), select: jest.fn(), back: jest.fn(), send: jest.fn() },
}));
const mockFetch = jest.fn();
jest.mock('../src/features/auth/api/headers', () => ({
  authedFetch: (...args: unknown[]) => mockFetch(...args),
  apiHeaders: jest.fn(),
}));
// The cafe mints a Game-Token before it opens; never ask the real server for one from a test.
jest.mock('../src/features/auth/api/session', () => ({ ensureGameToken: async () => null }));
jest.mock('../src/features/coins/api/coinsApi', () => ({ refreshCoins: jest.fn(), buyCoins: jest.fn() }));
jest.mock('../src/features/tickets/api/attendance', () => ({ fetchAttendance: async () => null, checkIn: jest.fn() }));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), addListener: () => () => {} }),
  useFocusEffect: () => {},
}));
jest.mock('../src/features/counseling/bridge', () => {
  const { MockUnityBridge } = jest.requireActual('../src/features/counseling/bridge/MockUnityBridge');
  const bridge = new MockUnityBridge();
  return {
    isNativeUnity: () => true,
    nativeUnityBridge: bridge,
    getCafeBridge: () => bridge,
    unityApiBase: 'http://localhost:4000',
  };
});
jest.mock('../src/features/counseling/components/UnityHost', () => ({ UnityHost: () => null }));

import { CafeScreen } from '../src/features/cafe/screens/CafeScreen';
import { getCafeBridge } from '../src/features/counseling/bridge';
import type { MockUnityBridge } from '../src/features/counseling/bridge/MockUnityBridge';
import { useLanguageStore } from '../src/shared/i18n';
import { useCoins } from '../src/features/coins/store/coinStore';
import { useAuthStore } from '../src/features/auth/store/authStore';
import { COUNSELOR_AVATAR_ART } from '../src/features/counselors/assets';
import { readerPortrait } from '../src/features/cafe/table/portrait';
import { CAFE_PRICE, MOVE_ANSWER_MS, MOVE_WALK_MS, REVEAL_FALLBACK_MS } from '../src/features/cafe/table/useCafeTable';
import { IN_PROGRESS_WAIT_MS, isRetryable } from '../src/features/cafe/api/cafeApi';
import type { UnityToRNEvent } from '../src/features/counseling/types';

const bridge = getCafeBridge() as unknown as MockUnityBridge;
const calls = (type: string) => bridge.cafeCalls.filter(c => c.type === type);
const types = () => bridge.cafeCalls.map(c => c.type);
const fromUnity = (e: UnityToRNEvent) => act(() => bridge.emitToRN(e));

/* ---- the server ----------------------------------------------------------------------------- */

/** `wait`: the answer is held until it resolves — a slow server. */
type Reply = { status: number; body: unknown; wait?: Promise<void> };
const routes: { match: string; replies: Reply[] }[] = [];
const sent: { url: string; body: any }[] = [];
const serve = (match: string, ...replies: Reply[]) => routes.push({ match, replies });
const ok = (body: unknown): Reply => ({ status: 200, body });
const posted = (frag: string) => sent.filter(s => s.url.includes(frag) && s.body);

mockFetch.mockImplementation(async (url: string, init?: { body?: string }) => {
  sent.push({ url, body: init?.body ? JSON.parse(init.body) : null });
  const route = routes.find(r => url.includes(r.match) && r.replies.length);
  if (!route) throw new Error(`unexpected server call ${url}`);
  const r = route.replies.shift()!;
  if (r.wait) await r.wait;
  return { status: r.status, ok: r.status >= 200 && r.status < 300, json: async () => r.body };
});

const READERS = {
  consultants: [
    { id: 'luna', name: 'Luna', title: 'Moonlit reader', persona: 'jeonuji', portrait_key: 'sunyeo', voice: 'f_soft' },
    { id: 'orion', name: 'Orion', title: '', persona: 'x', portrait_key: 'tarot', voice: 'm_low' },
  ],
};
const DEALT = Array.from({ length: 7 }, (_, i) => ({ id: `major_${i}`, orientation: i === 2 ? 'reversed' : 'upright' }));
const READING = {
  reading_id: 'r-1',
  cards: DEALT.map((c, i) => ({ ...c, name: `Card ${i}`, position: `Pos ${i}`, meaning: `Meaning ${i}` })),
  overall: 'All told, patience.',
  advice: 'Write the letter.',
  coins_balance: 70,
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/* ---- rendering ------------------------------------------------------------------------------ */

let tree: ReactTestRenderer.ReactTestRenderer | null = null;
const flush = () => act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); });
const byLabel = (label: string) =>
  tree!.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];
const press = async (label: string) => {
  const node = byLabel(label);
  if (!node) throw new Error(`no button "${label}"`);
  await act(async () => { node.props.onPress(); });
  await flush();
};
const byTestID = (id: string) => tree!.root.findAll(n => n.props.testID === id);
const shown = () => JSON.stringify(tree!.toJSON());
const type = (id: string, text: string) => act(() => byTestID(id)[0].props.onChangeText(text));

const render = async () => {
  await act(async () => { tree = ReactTestRenderer.create(<CafeScreen />); });
  fromUnity({ type: 'CAFE_READY', payload: { guest: 'dosa', spots: ['bar'] } });
};
const sit = async () => {
  await render();
  fromUnity({ type: 'CAFE_SEATED', payload: { spot: 'table_2' } });
};

beforeEach(async () => {
  await useLanguageStore.persist.rehydrate();
  useLanguageStore.setState({ lang: 'en' });
  useAuthStore.setState({ userAuth: 'acct-42' } as never);
  useCoins.setState({ balance: 100, shopOpen: false });
  bridge.cafeCalls.length = 0;
  routes.length = 0;
  sent.length = 0;
});
afterEach(() => {
  if (tree) act(() => tree!.unmount());
  tree = null;
  jest.useRealTimers();
});

/** From the menu to a reader seated at the table, question asked, sheet open. */
async function toConfirm() {
  await sit();
  serve('cafe/tarot/consultants', ok(READERS));
  await press('Tarot Consultation');
  await press('Luna');
  fromUnity({ type: 'CAFE_CONSULTANT_SEATED', payload: { consultantId: 'luna' } });
  type('cafe-question-input', '  Will I move this year?  ');
  await press('Ask');
}

/** …paid, spread, seven picked: POST readings is in flight or answered. */
async function toChosen() {
  await toConfirm();
  await press('Pay 30 PC');
  fromUnity({ type: 'CAFE_DECK_READY' });
  fromUnity({ type: 'CAFE_CARDS_CHOSEN', payload: { cards: DEALT as never } });
  await flush();
}

/* ---- the tarot ------------------------------------------------------------------------------ */

describe('a tarot reading at the table', () => {
  it('seated: the menu replaces the stick, the look layer and the guest panel', async () => {
    await render();
    expect(byTestID('cafe-look').length).toBeGreaterThan(0);
    fromUnity({ type: 'CAFE_SEATED', payload: { spot: 'table_2' } });
    expect(byTestID('cafe-menu').length).toBeGreaterThan(0);
    expect(byTestID('cafe-look')).toHaveLength(0);
    // A CAFE_PHASE talking from the same sit must not raise the guest's panel over the table.
    fromUnity({ type: 'CAFE_PHASE', payload: { phase: 'talking', spot: 'table_2', reason: '' } });
    expect(byTestID('cafe-panel')).toHaveLength(0);
    expect(shown()).toContain('Order Coffee');
    // Both rows carry their real price: the reading costs 30 too (asked again before the spread).
    expect(shown().split('30 PC').length - 1).toBe(2);
    expect(shown()).not.toContain('Free');
  });

  it('lists the readers from the server in the app language, with the counselor portraits', async () => {
    await sit();
    serve('cafe/tarot/consultants', ok(READERS));
    await press('Tarot Consultation');
    expect(sent[0].url).toMatch(/\/api\/v1\/prayers\/cafe\/tarot\/consultants\?lang=en$/);
    const luna = byTestID('cafe-reader-luna')[0];
    expect(luna.findAll(n => n.props.source === COUNSELOR_AVATAR_ART.yuna).length).toBeGreaterThan(0);
    // No art for the registry's tarot card: the initial on the accent.
    expect(byTestID('cafe-reader-orion')[0].findAll(n => n.props.children === 'O').length).toBeGreaterThan(0);
    expect(types()).toEqual([]);
  });

  it('a failed list offers another try; back returns to the menu', async () => {
    await sit();
    serve('cafe/tarot/consultants', { status: 500, body: null }, ok(READERS));
    await press('Tarot Consultation');
    expect(shown()).toContain("Couldn't load the readers.");
    await press('Try again');
    expect(byTestID('cafe-reader-luna').length).toBeGreaterThan(0);
    await press('Back');
    expect(byTestID('cafe-menu').length).toBeGreaterThan(0);
  });

  it('walks the whole flow in the contract’s order, charging only once seven cards are down', async () => {
    await toConfirm();
    expect(calls('CAFE_TAROT_START').map(c => c.payload)).toEqual([{ consultantId: 'luna', portraitKey: 'sunyeo', voice: 'f_soft' }]);
    const speaks = () => calls('CAFE_TAROT_SPEAK').map(c => c.payload as { slot?: number; text: string });
    expect(speaks()[0].text).toBe('Hello! Nice to meet you. What would you like to know today?');
    expect(speaks()[1].text).toBe('I see. Let me prepare the cards for you.');

    // The sheet, before anything is spent or spread.
    expect(byTestID('cafe-confirm').length).toBeGreaterThan(0);
    expect(shown()).toContain('Magic Seven');
    expect(shown()).toContain('30 Prayer Coins');
    expect(shown()).toContain('Balance: 100 PC');
    expect(types()).not.toContain('CAFE_TAROT_SPREAD');
    await press('Pay 30 PC');
    expect(types()).toContain('CAFE_TAROT_SPREAD');
    expect(posted('cafe/tarot/readings')).toHaveLength(0);

    fromUnity({ type: 'CAFE_DECK_READY' });
    expect(speaks()[2].text).toBe('Please choose seven cards while focusing on your question.');
    expect(byTestID('cafe-pick-count')[0].props.children).toBe('0 / 7');
    fromUnity({ type: 'CAFE_CARD_PICKED', payload: { slot: 4, count: 3 } });
    expect(byTestID('cafe-pick-count')[0].props.children).toBe('3 / 7');

    // 503 first: worded, retried with the same request_id, then the reading.
    serve('cafe/tarot/readings', { status: 503, body: { error_code: 'LLM_UNAVAILABLE' } }, ok(READING));
    fromUnity({ type: 'CAFE_CARDS_CHOSEN', payload: { cards: DEALT as never } });
    await flush();
    expect(shown()).toContain('You were not charged');
    // The seven turned over the moment they were chosen (spec step 4), before any reading — names unknown yet.
    expect(calls('CAFE_TAROT_REVEAL').map(c => c.payload)).toEqual([{ cards: DEALT.map(c => ({ ...c, name: '' })) }]);
    await press('Try again');
    const [first, second] = posted('cafe/tarot/readings').map(p => p.body);
    expect(first).toEqual({ request_id: expect.stringMatching(UUID), consultant_id: 'luna', question: 'Will I move this year?', cards: DEALT, lang: 'en' });
    expect(second.request_id).toBe(first.request_id);
    expect(useCoins.getState().balance).toBe(70);

    expect(calls('CAFE_TAROT_REVEAL').map(c => c.payload).at(-1)).toEqual(
      { cards: READING.cards.map(c => ({ id: c.id, orientation: c.orientation, name: c.name })) },
    );
    // The reading waits for the LAST card to be face up, not the first.
    expect(shown()).toContain('Turning the cards over…');
    fromUnity({ type: 'CAFE_CARD_REVEALED', payload: { slot: 0 } });
    expect(shown()).toContain('Turning the cards over…');
    fromUnity({ type: 'CAFE_CARD_REVEALED', payload: { slot: 6 } });
    expect(shown()).toContain('Card 1 of 7 · Pos 0');
    expect(speaks().at(-1)).toEqual({ slot: 0, text: 'Card 0. Meaning 0', mood: 'explain' });
    for (let i = 1; i < 7; i++) await press('Next');
    expect(byTestID('cafe-reading-title')[0].props.children).toBe('Card 6 · Upright');
    expect(speaks().map(s => s.slot).filter(s => s != null)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    await press('Next');
    expect(speaks().at(-1)).toEqual({ text: 'All told, patience.', mood: 'explain' });
    await press('Next');
    expect(speaks().at(-1)).toEqual({ text: 'Write the letter.', mood: 'warm' });
    await press('Next');
    expect(speaks().at(-1)?.text).toBe('Would you like to ask anything else about your reading?');

    // A follow-up: asked, confirmed at 10, answered from the same reading.
    serve('cafe/tarot/readings/r-1/followups', ok({ answer: 'Spring suits it.', coins_balance: 60 }));
    type('cafe-followup-input', 'When exactly?');
    await press('Send');
    expect(shown()).toContain('Follow-up question');
    expect(shown()).toContain('10 Prayer Coins');
    expect(shown()).toContain('Balance: 70 PC');
    expect(posted('followups')).toHaveLength(0);
    await press('Pay 10 PC');
    expect(posted('followups').map(p => p.body)).toEqual([{ request_id: expect.stringMatching(UUID), question: 'When exactly?', lang: 'en' }]);
    expect(posted('followups')[0].body.request_id).not.toBe(first.request_id);
    expect(byTestID('cafe-answer-0')[0].props.children).toBe('Spring suits it.');
    expect(speaks().at(-1)?.text).toBe('Spring suits it.');
    expect(useCoins.getState().balance).toBe(60);

    await press('End');
    expect(calls('CAFE_TAROT_END')).toHaveLength(1);
    // Spec step 7: the reader SAYS the goodbye (spoken before the stand-up, which waits for it).
    expect(speaks().at(-1)?.text).toBe('Thank you for visiting. I hope the cards have given you some clarity. See you again!');
    expect(types().lastIndexOf('CAFE_TAROT_SPEAK')).toBeLessThan(types().lastIndexOf('CAFE_TAROT_END'));
    expect(byTestID('cafe-farewell')[0].props.children).toBe(
      'Thank you for visiting. I hope the cards have given you some clarity. See you again!',
    );
    expect(byTestID('cafe-menu').length).toBeGreaterThan(0);
  });

  it('a sent question stays on the table as the player\u2019s words; cancelled, Begin asks to pay for it again', async () => {
    await toConfirm();
    expect(byTestID('cafe-question-said')[0].props.children).toBe('Will I move this year?');
    expect(byTestID('cafe-question-input')[0].props.value).toBe('');
    // No second way to pay while the sheet is up.
    expect(byTestID('cafe-tarot-begin')).toHaveLength(0);
    await press('Cancel');
    expect(byTestID('cafe-confirm')).toHaveLength(0);
    expect(types()).not.toContain('CAFE_TAROT_SPREAD');
    expect(byTestID('cafe-question-said')[0].props.children).toBe('Will I move this year?');
    await press('Begin the reading');
    expect(byTestID('cafe-confirm').length).toBeGreaterThan(0);
    await press('Pay 30 PC');
    expect(types()).toContain('CAFE_TAROT_SPREAD');
  });

  it('short of coins: the sheet says so and leads to the coin shop instead of paying', async () => {
    useCoins.setState({ balance: 20 });
    await toConfirm();
    expect(shown()).toContain('Not enough Prayer Coins.');
    expect(byLabel('Pay 30 PC')).toBeUndefined();
    await press('Get Prayer Coins');
    expect(useCoins.getState().shopOpen).toBe(true);
    expect(types()).not.toContain('CAFE_TAROT_SPREAD');
  });

  it('a 402 at reading time sets the wallet from coins_balance and offers the shop; a retry is a new purchase', async () => {
    serve('cafe/tarot/readings', { status: 402, body: { error_code: 'INSUFFICIENT_COINS', coins_balance: 5 } }, ok(READING));
    await toChosen();
    expect(useCoins.getState().balance).toBe(5);
    expect(shown()).toContain('Top up, then try again.');
    await press('Get Prayer Coins');
    expect(useCoins.getState().shopOpen).toBe(true);
    await press('Try again');
    const ids = posted('cafe/tarot/readings').map(p => p.body.request_id);
    expect(ids).toHaveLength(2);
    expect(ids[1]).not.toBe(ids[0]);
    expect(types()).toContain('CAFE_TAROT_REVEAL');
  });

  it('INVALID_CARDS is worded with no retry; End still ends', async () => {
    serve('cafe/tarot/readings', { status: 422, body: { error_code: 'INVALID_CARDS' } });
    await toChosen();
    expect(shown()).toContain('These cards couldn');
    expect(byLabel('Try again')).toBeUndefined();
    await press('End');
    expect(calls('CAFE_TAROT_END')).toHaveLength(1);
  });

  it('the reading arriving after all seven are face up starts at once', async () => {
    let release!: () => void;
    serve('cafe/tarot/readings', { ...ok(READING), wait: new Promise<void>(r => { release = r; }) });
    await toChosen();
    fromUnity({ type: 'CAFE_CARD_REVEALED', payload: { slot: 6 } });
    expect(shown()).toContain('Reading the cards…');
    await act(async () => { release(); });
    await flush();
    expect(shown()).toContain('Card 1 of 7');
  });

  it('starts narrating even if Unity never reports a flip', async () => {
    jest.useFakeTimers();
    serve('cafe/tarot/readings', ok(READING));
    await toChosen();
    expect(shown()).toContain('Turning the cards over…');
    act(() => { jest.advanceTimersByTime(REVEAL_FALLBACK_MS); });
    expect(shown()).toContain('Card 1 of 7');
  });

  it('while picking, only the End button takes a touch: everything else reaches the cards', async () => {
    await toConfirm();
    await press('Pay 30 PC');
    fromUnity({ type: 'CAFE_DECK_READY' });
    expect(byTestID('cafe-table')).toHaveLength(0);
    expect(byTestID('cafe-look')).toHaveLength(0);
    const strip = byTestID('cafe-strip')[0];
    expect(strip.props.pointerEvents).toBe('box-none');
    const views = strip.findAll(n => n.props.pointerEvents != null);
    // The strip's own words do not catch touches; End does.
    expect(views.some(v => v.props.pointerEvents === 'none')).toBe(true);
    expect(byLabel('End')).toBeDefined();
  });

  it('while picking, a tap over the table goes to Unity as CAFE_TAP (0..1 of the view); a drag does not', async () => {
    await toConfirm();
    expect(byTestID('cafe-tap')).toHaveLength(0);
    await press('Pay 30 PC');
    expect(byTestID('cafe-tap')).toHaveLength(0);
    fromUnity({ type: 'CAFE_DECK_READY' });
    const layer = byTestID('cafe-tap')[0];
    act(() => layer.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 800 } } }));
    expect(layer.props.onStartShouldSetResponder()).toBe(true);
    const touch = (x: number, y: number) => ({ nativeEvent: { locationX: x, locationY: y } });
    act(() => { layer.props.onResponderGrant(touch(100, 200)); layer.props.onResponderRelease(touch(103, 202)); });
    act(() => { layer.props.onResponderGrant(touch(100, 200)); layer.props.onResponderRelease(touch(180, 200)); });
    expect(calls('CAFE_TAP').map(c => c.payload)).toEqual([{ x: 103 / 400, y: 202 / 800 }]);
    serve('cafe/tarot/readings', ok(READING));
    fromUnity({ type: 'CAFE_CARDS_CHOSEN', payload: { cards: DEALT as never } });
    expect(byTestID('cafe-tap')).toHaveLength(0);
  });

  it('an answer that lands after End is dropped', async () => {
    let release!: () => void;
    serve('cafe/tarot/readings', { ...ok(READING), wait: new Promise<void>(r => { release = r; }) });
    await toChosen();
    expect(shown()).toContain('Reading the cards…');
    await press('End');
    const reveals = calls('CAFE_TAROT_REVEAL').length;   // the early turn-over, at the seventh card
    await act(async () => { release(); });
    await flush();
    expect(calls('CAFE_TAROT_REVEAL')).toHaveLength(reveals);
    expect(byTestID('cafe-menu').length).toBeGreaterThan(0);
  });

  it('standing up (CAFE_PHASE exploring) clears the table and gives the stick back', async () => {
    await sit();
    fromUnity({ type: 'CAFE_PHASE', payload: { phase: 'exploring', spot: '', reason: '' } });
    expect(byTestID('cafe-menu')).toHaveLength(0);
    expect(byTestID('cafe-look').length).toBeGreaterThan(0);
  });

  it('Leave the table stands the player up', async () => {
    await sit();
    await press('Leave the table');
    expect(types()).toEqual(['CAFE_STAND']);
    expect(byTestID('cafe-menu')).toHaveLength(0);
  });
});

/* ---- the coffee ----------------------------------------------------------------------------- */

describe('coffee and a fortune cookie', () => {
  it('confirm 30 → POST coffee → ORDER then FORTUNE → served → tap the cookie → the fortune', async () => {
    await sit();
    serve('cafe/coffee', { status: 503, body: { error_code: 'LLM_UNAVAILABLE' } }, ok({ fortune: 'A kind word finds you today.', coins_balance: 70 }));
    await press('Order Coffee');
    expect(shown()).toContain('Coffee & fortune cookie');
    expect(shown()).toContain('30 Prayer Coins');
    expect(posted('cafe/coffee')).toHaveLength(0);
    await press('Pay 30 PC');
    expect(types()).toEqual([]);
    expect(shown()).toContain('You were not charged');
    await press('Try again');
    const bodies = posted('cafe/coffee').map(p => p.body);
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toEqual({ request_id: expect.stringMatching(UUID), lang: 'en' });
    expect(bodies[1].request_id).toBe(bodies[0].request_id);
    expect(useCoins.getState().balance).toBe(70);

    expect(bridge.cafeCalls).toEqual([
      { type: 'CAFE_COFFEE_ORDER' },
      { type: 'CAFE_COOKIE_FORTUNE', payload: { text: 'A kind word finds you today.' } },
    ]);
    expect(shown()).toContain('The barista is making your coffee…');
    // The fortune is not shown before the cookie is opened.
    expect(byTestID('cafe-fortune')).toHaveLength(0);
    expect(byTestID('cafe-tap')).toHaveLength(0);
    fromUnity({ type: 'CAFE_COFFEE_SERVED' });
    expect(byTestID('cafe-cookie-prompt').length).toBeGreaterThan(0);
    // The cookie is tapped through RN too: the embedded view gets no touch.
    expect(byTestID('cafe-tap').length).toBeGreaterThan(0);
    fromUnity({ type: 'CAFE_COOKIE_OPENED' });
    expect(byTestID('cafe-fortune-text')[0].props.children).toBe('A kind word finds you today.');
    await press('Close');
    expect(byTestID('cafe-fortune')).toHaveLength(0);
    expect(byTestID('cafe-menu').length).toBeGreaterThan(0);
  });

  it('409 REQUEST_IN_PROGRESS (iOS re-sent the slow POST) is waited out with the same request_id, not shown as a failure', async () => {
    await sit();
    serve('cafe/coffee', { status: 409, body: { success: false, error_code: 'REQUEST_IN_PROGRESS' } },
      ok({ fortune: 'Patience pays.', coins_balance: 70 }));
    await press('Order Coffee');
    jest.useFakeTimers();
    const pay = byLabel('Pay 30 PC');
    // Two taps in one frame: one purchase.
    act(() => { pay.props.onPress(); pay.props.onPress(); });
    await act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); });
    expect(posted('cafe/coffee')).toHaveLength(1);
    expect(byTestID('cafe-table-error')).toHaveLength(0);
    await act(async () => { jest.advanceTimersByTime(IN_PROGRESS_WAIT_MS); for (let i = 0; i < 12; i++) await Promise.resolve(); });
    const bodies = posted('cafe/coffee').map(p => p.body);
    expect(bodies).toHaveLength(2);
    expect(bodies[1].request_id).toBe(bodies[0].request_id);
    expect(byTestID('cafe-table-error')).toHaveLength(0);
    expect(calls('CAFE_COOKIE_FORTUNE')).toEqual([{ type: 'CAFE_COOKIE_FORTUNE', payload: { text: 'Patience pays.' } }]);
  });

  it('a coffee abandoned after no answer keeps its request_id for the next order', async () => {
    await sit();
    serve('cafe/coffee', { status: 502, body: null }, ok({ fortune: 'Yes.', coins_balance: 40 }));
    await press('Order Coffee');
    await press('Pay 30 PC');
    await press('Back');
    await press('Order Coffee');
    await press('Pay 30 PC');
    const ids = posted('cafe/coffee').map(p => p.body.request_id);
    expect(ids[1]).toBe(ids[0]);
  });
});

/* ---- the small parts ------------------------------------------------------------------------ */

describe('the table’s small parts', () => {
  it('prices are the contract’s, and only 503 / no answer keep an intent open', () => {
    expect(CAFE_PRICE).toEqual({ reading: 30, followup: 10, coffee: 30 });
    expect(isRetryable({ ok: false, kind: 'unavailable' })).toBe(true);
    expect(isRetryable({ ok: false, kind: 'failed' })).toBe(true);
    expect(isRetryable({ ok: false, kind: 'invalidCards' })).toBe(false);
    expect(isRetryable({ ok: false, kind: 'insufficient', price: null, balance: 0 })).toBe(false);
  });

  it('maps a portrait key through the registry to the app’s art', () => {
    expect(readerPortrait('sunyeo').image).toBe(COUNSELOR_AVATAR_ART.yuna);
    expect(readerPortrait('theo').image).toBe(COUNSELOR_AVATAR_ART.theo);
    expect(readerPortrait('tarot')).toEqual({ image: undefined, accent: '#7B5EA7' });
    expect(readerPortrait('nobody').image).toBeUndefined();
  });
});

/* ---- the wire ------------------------------------------------------------------------------- */

describe('the native bridge’s table messages', () => {
  it('posts the contract’s shapes to RNBridge.OnMessage, payload nested', () => {
    const { NativeUnityBridge } = jest.requireActual('../src/features/counseling/bridge/NativeUnityBridge');
    const native = new NativeUnityBridge();
    const wire: { target: string; method: string; json: any }[] = [];
    native.registerView({ postMessage: (target: string, method: string, json: string) => wire.push({ target, method, json: JSON.parse(json) }) });
    native.sendCafeTarotStart({ consultantId: 'luna', portraitKey: 'sunyeo', voice: 'f_soft' });
    native.sendCafeTarotSpread();
    native.sendCafeTarotReveal([{ id: 'major_0', orientation: 'reversed', name: 'The Fool' }]);
    native.sendCafeTarotSpeak({ slot: 3, text: 'Hi', mood: 'warm' });
    native.sendCafeTarotSpeak({ text: 'Bye' });
    native.sendCafeTarotEnd();
    native.sendCafeCoffeeOrder();
    native.sendCafeCookieFortune('Good things.');
    expect(new Set(wire.map(w => `${w.target}.${w.method}`))).toEqual(new Set(['RNBridge.OnMessage']));
    expect(wire.map(w => w.json)).toEqual([
      { type: 'CAFE_TAROT_START', payload: { consultantId: 'luna', portraitKey: 'sunyeo', voice: 'f_soft' } },
      { type: 'CAFE_TAROT_SPREAD' },
      { type: 'CAFE_TAROT_REVEAL', payload: { cards: [{ id: 'major_0', orientation: 'reversed', name: 'The Fool' }] } },
      { type: 'CAFE_TAROT_SPEAK', payload: { slot: 3, text: 'Hi', mood: 'warm' } },
      { type: 'CAFE_TAROT_SPEAK', payload: { text: 'Bye' } },
      { type: 'CAFE_TAROT_END' },
      { type: 'CAFE_COFFEE_ORDER' },
      { type: 'CAFE_COOKIE_FORTUNE', payload: { text: 'Good things.' } },
    ]);
  });
});

describe('the reader’s text', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { plain } = require('../src/features/cafe/api/cafeApi');
  it('shows and speaks card names without the model’s [brackets]', () => {
    expect(plain('Lá [Nữ Hoàng Kiếm] ở vị trí quá khứ, [The Sun] xuôi.')).toBe('Lá Nữ Hoàng Kiếm ở vị trí quá khứ, The Sun xuôi.');
    expect(plain('No marks here.')).toBe('No marks here.');
  });
});

/* ---- sit anywhere (21-10) ------------------------------------------------------------------------ */

describe('walked straight in: any free table, then coffee or tarot from its menu', () => {
  const ready = () => fromUnity({ type: 'CAFE_READY', payload: { guest: 'dosa', spots: ['bar', 'lounge', 'tarot'] } });
  /** In through the door, the cafe up. Nothing is asked there (user, 21-10). */
  const open = async () => {
    await act(async () => { tree = ReactTestRenderer.create(<CafeScreen />); });
    await flush();
    ready();
    await flush();
  };
  const seatAt = async (spot: string) => {
    fromUnity({ type: 'CAFE_PHASE', payload: { phase: 'talking', spot, reason: '' } });
    fromUnity({ type: 'CAFE_SEATED', payload: { spot } });
    await flush();
  };
  /** Walked up to `spot` with the stick: Unity names it (CAFE_NEAR) and the Sit button sends it. */
  const sitBy = async (spot: string) => {
    fromUnity({ type: 'CAFE_NEAR', payload: { near: true, spot } });
    await press('Sit here');
  };

  it('no chooser, no pins: the room, one line saying a tap on a seat will do; nothing seats the player by itself', async () => {
    await open();
    // No sheet at the door (CAFE_INIT's exact payload is pinned in cafe.test.tsx), and no table card
    // (PM 21-10: "just let user select anywhere and sit").
    expect(byTestID('cafe-choice')).toHaveLength(0);
    expect(byTestID('cafe-tables')).toHaveLength(0);
    expect(types()).not.toContain('CAFE_SUGGEST');
    expect(shown()).toContain('Tap a seat to sit');
    expect(byTestID('cafe-look').length).toBeGreaterThan(0);
    expect(calls('CAFE_SIT')).toHaveLength(0);
  });

  it('walked up to a seat, a Sit button offers it — the player walks there alone; the hint is gone after the first sit', async () => {
    await open();
    expect(byTestID('cafe-sit')).toHaveLength(0);
    fromUnity({ type: 'CAFE_NEAR', payload: { near: true, spot: 'table3c' } });
    expect(byTestID('cafe-sit').length).toBeGreaterThan(0);
    expect(shown()).not.toContain('Tap a seat to sit');
    fromUnity({ type: 'CAFE_NEAR', payload: { near: false, spot: '' } });
    expect(byTestID('cafe-sit')).toHaveLength(0);
    await sitBy('table3c');
    // No barista escort: the plain walk, no `guided`.
    expect(calls('CAFE_SIT')).toEqual([{ type: 'CAFE_SIT', payload: { spot: 'table3c' } }]);
    fromUnity({ type: 'CAFE_PHASE', payload: { phase: 'seating', spot: 'table3c', reason: '' } });
    expect(shown()).toContain('Heading to your seat…');
    expect(shown()).not.toContain('barista');
    await seatAt('table3c');
    expect(byTestID('cafe-menu').length).toBeGreaterThan(0);
    // Up again: no hint any more this visit, and no Sit button until Unity names a seat afresh.
    fromUnity({ type: 'CAFE_PHASE', payload: { phase: 'exploring', spot: '', reason: '' } });
    await flush();
    expect(shown()).not.toContain('Tap a seat to sit');
    expect(byTestID('cafe-sit')).toHaveLength(0);
  });

  it('any table, first sit: the menu — coffee is ordered from it, at whichever table', async () => {
    await open();
    await sitBy('bar');
    expect(calls('CAFE_SIT')).toEqual([{ type: 'CAFE_SIT', payload: { spot: 'bar' } }]);
    await seatAt('bar');
    expect(byTestID('cafe-menu').length).toBeGreaterThan(0);
    expect(byTestID('cafe-confirm')).toHaveLength(0);
    await press('Order Coffee');
    expect(byTestID('cafe-confirm').length).toBeGreaterThan(0);
    expect(shown()).toContain('Coffee & fortune cookie');
  });

  it('at the tarot table: the menu first, and Tarot there opens the readers without a move', async () => {
    serve('cafe/tarot/consultants', ok(READERS));
    await open();
    await sitBy('tarot');
    fromUnity({ type: 'CAFE_PHASE', payload: { phase: 'seating', spot: 'tarot', reason: '' } });
    expect(shown()).toContain('Moving to the tarot table');
    await seatAt('tarot');
    expect(byTestID('cafe-menu').length).toBeGreaterThan(0);
    expect(byTestID('cafe-readers')).toHaveLength(0);
    await press('Tarot Consultation');
    expect(calls('CAFE_SIT')).toHaveLength(1);
    // The reader is chosen sitting at the table (user, 20-10), not before.
    expect(byTestID('cafe-readers').length).toBeGreaterThan(0);
    expect(calls('CAFE_TAROT_START')).toHaveLength(0);
    await press('Luna');
    expect(calls('CAFE_TAROT_START')).toHaveLength(1);
  });

  it('Tarot at the lounge walks the player to the tarot table, and the readers open on arrival', async () => {
    serve('cafe/tarot/consultants', ok(READERS));
    await open();
    await sitBy('lounge');
    await seatAt('lounge');
    expect(byTestID('cafe-menu').length).toBeGreaterThan(0);
    await press('Tarot Consultation');
    // PM 21-10: "if user select tarot consultation, should move to the tarot table".
    expect(calls('CAFE_SIT').at(-1)).toEqual({ type: 'CAFE_SIT', payload: { spot: 'tarot' } });
    expect(sent.filter(x => x.url.includes('consultants'))).toHaveLength(0);
    fromUnity({ type: 'CAFE_PHASE', payload: { phase: 'seating', spot: 'tarot', reason: '' } });
    expect(byTestID('cafe-moving').length).toBeGreaterThan(0);
    expect(byTestID('cafe-menu')).toHaveLength(0);
    // Still the table's (no stick, no look layer, no Sit button) while the player walks over.
    expect(byTestID('cafe-look')).toHaveLength(0);
    expect(byTestID('cafe-sit')).toHaveLength(0);
    await seatAt('tarot');
    expect(byTestID('cafe-readers').length).toBeGreaterThan(0);
    await press('Luna');
    expect(calls('CAFE_TAROT_START')).toHaveLength(1);
  });

  it('the tarot table taken: a clear busy line, and the player stays at their table and its menu', async () => {
    await open();
    await sitBy('bar');
    await seatAt('bar');
    await press('Tarot Consultation');
    expect(calls('CAFE_SIT').at(-1)?.payload).toEqual({ spot: 'tarot' });
    // Refused before anybody stood up.
    fromUnity({ type: 'CAFE_PHASE', payload: { phase: 'talking', spot: 'bar', reason: 'busy' } });
    expect(byTestID('cafe-menu').length).toBeGreaterThan(0);
    expect(shown()).toContain('Someone is at the tarot table right now');
    // Taken on the way instead: walked back, seated again at the bar's menu, told why.
    await press('Tarot Consultation');
    fromUnity({ type: 'CAFE_PHASE', payload: { phase: 'seating', spot: 'tarot', reason: '' } });
    expect(shown()).toContain('Moving to the tarot table…');
    fromUnity({ type: 'CAFE_PHASE', payload: { phase: 'seating', spot: 'bar', reason: 'busy' } });
    expect(shown()).toContain('Someone is at the tarot table right now');
    // Walking back now: the strip says where to, not "Moving to the tarot table…".
    expect(byTestID('cafe-moving')[0].props.children).toBe('Returning to your seat…');
    expect(shown()).not.toContain('Moving to the tarot table…');
    await seatAt('bar');
    expect(byTestID('cafe-menu').length).toBeGreaterThan(0);
    expect(byTestID('cafe-readers')).toHaveLength(0);
    // The next move starts as a move to the tarot table again.
    await press('Tarot Consultation');
    expect(byTestID('cafe-moving')[0].props.children).toBe('Moving to the tarot table…');
  });

  it('the move to the tarot table can be cancelled: CAFE_STAND, and the table clears on Unity\u2019s exploring', async () => {
    await open();
    await sitBy('lounge');
    await seatAt('lounge');
    await press('Tarot Consultation');
    fromUnity({ type: 'CAFE_PHASE', payload: { phase: 'seating', spot: 'tarot', reason: '' } });
    expect(byTestID('cafe-move-cancel').length).toBeGreaterThan(0);
    await press('Cancel');
    // Unity has no "cancel a move": the on-foot seating's Cancel (CAFE_STAND) ends the walk.
    expect(calls('CAFE_STAND')).toHaveLength(1);
    expect(byTestID('cafe-moving').length).toBeGreaterThan(0);
    fromUnity({ type: 'CAFE_PHASE', payload: { phase: 'exploring', spot: '', reason: '' } });
    await flush();
    expect(byTestID('cafe-strip')).toHaveLength(0);
    expect(byTestID('cafe-menu')).toHaveLength(0);
    expect(byTestID('cafe-look').length).toBeGreaterThan(0);
  });

  it('Unity never answers the move: the menu comes back after MOVE_ANSWER_MS with a gentle line; a late arrival keeps it', async () => {
    jest.useFakeTimers();
    await open();
    await sitBy('bar');
    await seatAt('bar');
    await press('Tarot Consultation');
    act(() => { jest.advanceTimersByTime(MOVE_ANSWER_MS - 1); });
    expect(byTestID('cafe-moving').length).toBeGreaterThan(0);
    act(() => { jest.advanceTimersByTime(1); });
    expect(byTestID('cafe-moving')).toHaveLength(0);
    expect(byTestID('cafe-menu').length).toBeGreaterThan(0);
    expect(shown()).toContain("Couldn't get to the tarot table");
    // The move did happen after all: the menu stays, but now it is the tarot table's — Tarot lists readers.
    fromUnity({ type: 'CAFE_PHASE', payload: { phase: 'talking', spot: 'tarot', reason: '' } });
    fromUnity({ type: 'CAFE_SEATED', payload: { spot: 'tarot' } });
    await flush();
    expect(byTestID('cafe-menu').length).toBeGreaterThan(0);
    serve('cafe/tarot/consultants', ok(READERS));
    await press('Tarot Consultation');
    expect(calls('CAFE_SIT').filter(c => (c.payload as { spot: string }).spot === 'tarot')).toHaveLength(1);
    expect(byTestID('cafe-readers').length).toBeGreaterThan(0);
  });

  it('walking but never seated: the menu after MOVE_WALK_MS, not before; Cancel with no answer clears without the line', async () => {
    jest.useFakeTimers();
    await open();
    await sitBy('lounge');
    await seatAt('lounge');
    await press('Tarot Consultation');
    act(() => { jest.advanceTimersByTime(1000); });
    fromUnity({ type: 'CAFE_PHASE', payload: { phase: 'seating', spot: 'tarot', reason: '' } });
    act(() => { jest.advanceTimersByTime(MOVE_WALK_MS - 1); });
    expect(byTestID('cafe-moving').length).toBeGreaterThan(0);
    act(() => { jest.advanceTimersByTime(1); });
    expect(byTestID('cafe-menu').length).toBeGreaterThan(0);
    expect(shown()).toContain("Couldn't get to the tarot table");
    // Again, and this time Cancel — to a Unity that says nothing: the menu, and no "could not" line.
    await press('Tarot Consultation');
    await press('Cancel');
    act(() => { jest.advanceTimersByTime(MOVE_ANSWER_MS); });
    expect(byTestID('cafe-menu').length).toBeGreaterThan(0);
    expect(shown()).not.toContain("Couldn't get to the tarot table");
  });

  it('a repeated CAFE_READY and a second sit in the same visit: still the plain menu', async () => {
    await open();
    ready();
    await sitBy('lounge');
    await seatAt('lounge');
    expect(byTestID('cafe-menu').length).toBeGreaterThan(0);
    fromUnity({ type: 'CAFE_PHASE', payload: { phase: 'exploring', spot: '', reason: '' } });
    await seatAt('tarot');
    expect(byTestID('cafe-menu').length).toBeGreaterThan(0);
    expect(byTestID('cafe-confirm')).toHaveLength(0);
    expect(byTestID('cafe-readers')).toHaveLength(0);
  });
});
