/**
 * My Room's mailbox: real events only, pushed where they happen. Pinned: the store (upsert by id,
 * read/unread, cap), each producer's rule (a reflection only on pending → ready; a check-in row per
 * day that turns into its receipt; no receipt for a replayed coin purchase), and the words/links
 * the sheet draws in every language.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));

import {
  INBOX_CAP, noteCheckIn, noteCoins, noteFurniture, noteMoment, noteReflection, unreadCount, useInbox,
} from '../src/features/myroom/inbox/inboxStore';
import { inboxLine } from '../src/features/myroom/inbox/lines';
import { useDiaryStore } from '../src/features/myroom/diary/diaryStore';
import { translate } from '../src/shared/i18n/translations';
import { pieceName } from '../src/features/myroom/names';

const items = () => useInbox.getState().items;

beforeEach(() => {
  useInbox.setState({ items: [] });
  useDiaryStore.setState({ reflections: {}, photos: {}, photoDeletes: [] });
});

describe('the store', () => {
  it('adds newest first, updates the same id in place, and counts unread', () => {
    noteMoment('j', 'm1', 'Spring');
    noteMoment('j', 'm2', null);
    expect(items().map(i => i.id)).toEqual(['moment:j:m2', 'moment:j:m1']);
    expect(unreadCount(items())).toBe(2);
    useInbox.getState().markRead('moment:j:m1');
    expect(unreadCount(items())).toBe(1);
    noteMoment('j', 'm1', 'Spring');
    expect(items().map(i => i.id)).toEqual(['moment:j:m1', 'moment:j:m2']);
    useInbox.getState().markAllRead();
    expect(unreadCount(items())).toBe(0);
  });

  it('keeps at most INBOX_CAP rows, dropping the oldest', () => {
    for (let i = 0; i < INBOX_CAP + 5; i++) noteMoment('j', `m${i}`, null);
    expect(items()).toHaveLength(INBOX_CAP);
    expect(items()[0].id).toBe(`moment:j:m${INBOX_CAP + 4}`);
  });
});

describe('the producers', () => {
  const ready = { status: 'ready' as const, text: 'r', topics: [], counselor: 'metal', lang: 'ko', stale: false };
  const pending = { ...ready, status: 'pending' as const, text: '' };

  it('a reflection is news once: when it turns from pending to ready', () => {
    const diary = useDiaryStore.getState();
    // Found ready on a first pull (a reinstall): not news.
    diary.mergeServer([{ id: 'old', reflection: ready, photos: [] }]);
    expect(items()).toHaveLength(0);
    diary.setReflection('m1', pending);
    expect(items()).toHaveLength(0);
    useDiaryStore.getState().setReflection('m1', ready);
    expect(items().map(i => [i.id, i.data.tone])).toEqual([['reflection:m1', 'metal']]);
    // The next pull still says ready: nothing new.
    useDiaryStore.getState().mergeServer([{ id: 'm1', reflection: ready, photos: [] }]);
    expect(items()).toHaveLength(1);
    // Ready arriving by a pull after the player left the Saved screen is news too.
    useDiaryStore.getState().setReflection('m2', pending);
    useDiaryStore.getState().mergeServer([{ id: 'm2', reflection: ready, photos: [] }]);
    expect(items().map(i => i.id)).toContain('reflection:m2');
    // A fallback is the server's stand-in, not a reading.
    useDiaryStore.getState().setReflection('m3', pending);
    useDiaryStore.getState().setReflection('m3', { ...ready, status: 'fallback' });
    expect(items().map(i => i.id)).not.toContain('reflection:m3');
    noteReflection('m1', 'metal');
    expect(items().filter(i => i.id === 'reflection:m1')).toHaveLength(1);
  });

  it("today's check-in: one unread row while waiting; claiming turns it into a read receipt", () => {
    noteCheckIn('2026-10-06', false);
    noteCheckIn('2026-10-07', false);
    // Yesterday's unclaimed reward can no longer be claimed: it goes.
    expect(items().map(i => i.id)).toEqual(['checkin:2026-10-07']);
    noteCheckIn('2026-10-07', false);
    expect(items()).toHaveLength(1);
    expect(unreadCount(items())).toBe(1);
    noteCheckIn('2026-10-07', true, 2);
    expect(items()).toHaveLength(1);
    expect(items()[0]).toMatchObject({ read: true, data: { claimed: true, granted: 2 } });
    // A later status that says "checked today" does not reopen it.
    noteCheckIn('2026-10-07', true);
    noteCheckIn('2026-10-07', false);
    expect(items()[0]).toMatchObject({ read: true, data: { claimed: true, granted: 2 } });
  });

  it('a coin purchase is a receipt; a replayed receipt (0 coins) says nothing', () => {
    noteCoins(0, 100);
    expect(items()).toHaveLength(0);
    noteCoins(500, 600);
    expect(items()[0]).toMatchObject({ kind: 'coins', read: false, data: { coins: 500, balance: 600 } });
  });

  it('a furniture purchase is a receipt', () => {
    noteFurniture('item:Sofa', 150);
    expect(items()[0]).toMatchObject({ kind: 'furniture', data: { sku: 'item:Sofa', charged: 150 } });
  });
});

describe('the words and the links', () => {
  const ctx = (lang: 'ko' | 'en' | 'ja' | 'zh-CN' | 'zh-TW' | 'vi') => ({
    entry: (id: string) => (id === 'm1' ? '오늘은 맑음' : null),
    counselor: () => 'Theo',
    piece: (sku: string) => pieceName(k => translate(lang, k), sku),
  });

  it('every kind reads in all six languages and links inside the room', () => {
    noteReflection('m1', 'metal');
    noteReflection('gone', 'metal');
    noteCheckIn('2026-10-07', false);
    noteCoins(100, 200);
    noteMoment('j', 'm', null);
    noteFurniture('item:Sofa', 150);
    for (const lang of ['ko', 'en', 'ja', 'zh-CN', 'zh-TW', 'vi'] as const) {
      const t = (k: any, p?: any) => translate(lang, k, p);
      for (const it of items()) {
        const line = inboxLine(it, t, ctx(lang));
        expect([lang, it.kind, line.title.length > 0, /\b[a-z]+\.[a-z]+\./.test(line.title + line.body)]).toEqual([lang, it.kind, true, false]);
      }
    }
    const t = (k: any, p?: any) => translate('ko', k, p);
    const link = (id: string) => inboxLine(items().find(i => i.id === id)!, t, ctx('ko')).link;
    expect(link('reflection:m1')).toEqual({ to: 'diary', memoryId: 'm1' });
    // The entry was deleted: the row stays, but leads nowhere.
    expect(link('reflection:gone')).toBeNull();
    expect(link('checkin:2026-10-07')).toEqual({ to: 'checkin' });
    expect(link('moment:j:m')).toBeNull();
    const coins = items().find(i => i.kind === 'coins')!;
    expect(inboxLine(coins, t, ctx('ko'))).toMatchObject({ title: '코인 100개가 충전됐어요', link: { to: 'coins' } });
    const sofa = items().find(i => i.kind === 'furniture')!;
    expect(inboxLine(sofa, t, ctx('ko'))).toMatchObject({ body: '소파 — 편집에서 볼 수 있어요', link: { to: 'decorate' } });
    expect(inboxLine(items().find(i => i.id === 'reflection:m1')!, t, ctx('ko')).title).toBe('Theo의 답장이 도착했어요');
  });
});
