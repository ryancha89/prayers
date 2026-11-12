import AsyncStorage from '@react-native-async-storage/async-storage';
import { getUserAuth } from '../../auth/store/authStore';

/**
 * Who a paid-but-unconfirmed store purchase belongs to, on THIS device (2026-11-11).
 *
 * The store, not the app, keeps an unfinished transaction, and it re-delivers it on the next launch
 * to whoever is signed in then. So: A pays, the confirm never lands (no network, a 5xx), A signs out,
 * B signs in on the same phone — and the launch recovery handed A's receipt to the server with B's
 * token, which credited B. Sign-out already stops the in-session retries (`stopCoinConfirms`); this
 * is the part that has to survive a relaunch.
 *
 * One AsyncStorage record, `{ [transaction key]: { uid, at } }`, written the first time a purchase is
 * seen while someone is signed in, and dropped when the purchase is finished or refused for good.
 * It holds no money and no receipt — just which account may be credited — so losing it is never worse
 * than today's behaviour: an entry we never recorded (the app died between the payment and the
 * listener, or the receipt was made on another device of the same store account) stays creditable to
 * the account in front of us, because the store tells us nothing about who bought it.
 *
 * Entries older than MAX_AGE_MS are pruned: a receipt nobody could confirm for a month is support's
 * problem, and the record must not grow for ever.
 */
const KEY = 'prayers.coins.purchaseOwner.v1';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

type Entry = { uid: string; at: number };
type Record_ = { [transactionKey: string]: Entry };

let cache: Record_ | null = null;

async function read(): Promise<Record_> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    cache = parsed && typeof parsed === 'object' ? (parsed as Record_) : {};
  } catch {
    cache = {};
  }
  return cache;
}

async function write(next: Record_): Promise<void> {
  cache = next;
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
}

function prune(rec: Record_, now: number): Record_ {
  const out: Record_ = {};
  for (const [key, e] of Object.entries(rec)) {
    if (e && typeof e.uid === 'string' && typeof e.at === 'number' && now - e.at < MAX_AGE_MS) out[key] = e;
  }
  return out;
}

/** Remember the signed-in account as the owner of this transaction, the first time we see it. An
 *  owner already recorded is never overwritten — that is the whole point of the record. */
export async function claimPurchase(transactionKey: string, now = Date.now()): Promise<void> {
  const uid = getUserAuth();
  if (!uid || !transactionKey) return;
  const rec = prune(await read(), now);
  if (rec[transactionKey]) return;
  await write({ ...rec, [transactionKey]: { uid, at: now } });
}

/** The account this transaction was paid for, or null when we never saw it signed in. */
export async function purchaseOwner(transactionKey: string, now = Date.now()): Promise<string | null> {
  const rec = prune(await read(), now);
  return rec[transactionKey]?.uid ?? null;
}

/**
 * May the account signed in right now be credited for this transaction? Only its owner may; an
 * unowned one (never recorded here) may, because nothing on the device says otherwise.
 */
export async function creditableNow(transactionKey: string, now = Date.now()): Promise<boolean> {
  const owner = await purchaseOwner(transactionKey, now);
  return owner == null || owner === getUserAuth();
}

/** The purchase is finished (credited) or refused for good: the device no longer needs its owner. */
export async function releasePurchase(transactionKey: string, now = Date.now()): Promise<void> {
  const rec = prune(await read(), now);
  if (!(transactionKey in rec)) return;
  const next = { ...rec };
  delete next[transactionKey];
  await write(next);
}

/** Jest only. */
export function resetPurchaseOwnersForTests(): void {
  cache = null;
}
