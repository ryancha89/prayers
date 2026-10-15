import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * My Room's mailbox (the envelope, 07-10 mockup). There is no mail on the server and none is made
 * up: every row here is an event the app itself produced, pushed by the code where it happened —
 *
 *   reflection  a counsellor finished reading a diary entry (diary store: pending → ready)
 *   checkin     today's check-in is waiting / was claimed (tickets/api/attendance)
 *   coins       a coin purchase landed (coins/api/coinsApi.buyCoins)
 *   moment      a journey moment was unlocked (journey/player/journeyPlayer.unlock)
 *   furniture   a My Room piece or theme was bought (myroom/api/myRoomApi.buyMyRoomSku)
 *
 * Rows hold the facts only (ids, counts); the words are drawn at display time (inbox/lines.ts) so a
 * language change re-words the whole box. Kept on the phone, newest first, capped.
 */
export type InboxKind = 'reflection' | 'checkin' | 'coins' | 'moment' | 'furniture';

export interface InboxItem {
  /** Stable per event: a second push of the same event updates the row instead of adding one. */
  id: string;
  kind: InboxKind;
  /** ISO, when it happened. */
  at: string;
  read: boolean;
  data: Record<string, string | number | boolean>;
}

/**
 * AsyncStorage that never rejects. The producers below sit inside the check-in, the coin purchase
 * and the journey unlock: a mailbox that could not be saved must never fail one of those (nor leave
 * an unhandled rejection behind in a build or a test without the native module).
 */
const quietStorage = {
  getItem: (k: string) => AsyncStorage.getItem(k).catch(() => null),
  setItem: (k: string, v: string) => AsyncStorage.setItem(k, v).catch(() => {}),
  removeItem: (k: string) => AsyncStorage.removeItem(k).catch(() => {}),
};

/** Old mail goes first; a mailbox nobody empties should not grow forever on the phone. */
export const INBOX_CAP = 60;

interface InboxState {
  items: InboxItem[];
  /** Add, or update the row with the same id (moved to the top, unread again unless `read` is given). */
  push(item: Omit<InboxItem, 'at' | 'read'> & { at?: string; read?: boolean }): void;
  markRead(id: string): void;
  markAllRead(): void;
  remove(id: string): void;
}

export const useInbox = create<InboxState>()(
  persist(
    set => ({
      items: [],
      push: item =>
        set(s => {
          const row: InboxItem = { ...item, at: item.at ?? new Date().toISOString(), read: item.read ?? false };
          return { items: [row, ...s.items.filter(i => i.id !== row.id)].slice(0, INBOX_CAP) };
        }),
      markRead: id => set(s => ({ items: s.items.map(i => (i.id === id && !i.read ? { ...i, read: true } : i)) })),
      markAllRead: () => set(s => ({ items: s.items.map(i => (i.read ? i : { ...i, read: true })) })),
      remove: id => set(s => ({ items: s.items.filter(i => i.id !== id) })),
    }),
    {
      name: 'prayers.inbox.v1',
      storage: createJSONStorage(() => quietStorage),
      partialize: s => ({ items: s.items }),
    },
  ),
);

export const unreadCount = (items: InboxItem[]): number => items.reduce((n, i) => n + (i.read ? 0 : 1), 0);

/* ── The producers' one-liners ───────────────────────────────────────────────────────────── */

/**
 * The day's check-in, by the phone's date. Waiting → one unread row for today (and yesterday's
 * unclaimed one goes: it can no longer be claimed). Claimed → the same row, now saying what it gave,
 * read — the player is the one who just claimed it.
 */
export function noteCheckIn(date: string, claimed: boolean, granted?: number): void {
  const id = `checkin:${date}`;
  const st = useInbox.getState();
  const prev = st.items.find(i => i.id === id);
  if (!claimed) {
    // Known already (read or not): leave it where it is.
    if (prev) return;
    useInbox.setState({ items: st.items.filter(i => !(i.kind === 'checkin' && i.data.claimed === false)) });
    useInbox.getState().push({ id, kind: 'checkin', data: { date, claimed: false } });
    return;
  }
  if (prev?.data.claimed === true) return;
  st.push({ id, kind: 'checkin', read: true, data: { date, claimed: true, granted: granted ?? 0 } });
}

/** A diary reflection is ready. Only the moment it turns ready — not every pull that still says so. */
export function noteReflection(memoryId: string, tone: string): void {
  const id = `reflection:${memoryId}`;
  if (useInbox.getState().items.some(i => i.id === id)) return;
  useInbox.getState().push({ id, kind: 'reflection', data: { memoryId, tone } });
}

export function noteCoins(coinsAdded: number, balance: number): void {
  if (coinsAdded <= 0) return; // a replayed receipt adds nothing and says nothing
  useInbox.getState().push({ id: `coins:${Date.now()}`, kind: 'coins', data: { coins: coinsAdded, balance } });
}

export function noteMoment(journeyId: string, momentId: string, label: string | null): void {
  useInbox.getState().push({ id: `moment:${journeyId}:${momentId}`, kind: 'moment', data: { journeyId, momentId, label: label ?? '' } });
}

export function noteFurniture(sku: string, charged: number): void {
  useInbox.getState().push({ id: `furniture:${sku}:${Date.now()}`, kind: 'furniture', data: { sku, charged } });
}
