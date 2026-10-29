import { AppState } from 'react-native';
import { create } from 'zustand';
import { devlog } from '../../../shared/devlog';
import { buyWithStore } from '../../tickets/providers/storeBuy';
import { finishPurchase, type ProductPurchase } from '../../tickets/providers/purchase';
import { CONFIRM_RETRY_MS } from '../../coins/api/coinsApi';
import { confirmJourneyPurchase } from './journeyApi';

/**
 * The journey pass, bought through `buyWithStore` — and, like the coin packs (coinsApi), never
 * dropped once the store has taken the money.
 *
 * Charged but not confirmed (29-10): a dropped connection, a 5xx or a 422 after StoreKit said yes
 * used to come back as `refused`, the pass screen said "try again", and nothing ever retried — the
 * coin recovery at launch only settles coin products — so a player could pay for the pass twice.
 * Now the unfinished purchase is held by its store transaction and confirmed again in this session
 * (the coins' backoff, and every return to the foreground), the answer is 'awaiting', and the same
 * pass cannot be bought again until it lands. The server's ledger is per store transaction, so
 * asking again never unlocks or charges twice.
 *
 * Only what can change is held (29-10): no answer, a 5xx, a 401. A 422 is the server's final no on
 * the receipt — holding it locked the pass behind "payment received" for good — so it comes back
 * as 'unverified' and the screen says to contact support. That purchase is NOT finished: nobody was
 * given the pass for it, and the store keeps it for re-delivery and for support to reconcile.
 */

export type BuyPassResult =
  | { ok: true }
  /** 'awaiting': the store took the money, the server has not confirmed it yet — held and retried.
   *  'invalid': the server refused a dev-platform buy (no money was taken).
   *  'unverified': the store took the money and the server refused the receipt for good (422). */
  | { ok: false; reason: 'cancelled' | 'pending' | 'unavailable' | 'failed' | 'invalid' | 'awaiting' | 'unverified' };

/** What became of a paid pass that did not simply land — see CoinNotice (coinStore), same two. */
export interface PassNotice {
  productId: string;
  kind: 'unverified' | 'delayed';
}

interface PassPurchaseState {
  /** Pass products charged for and not yet confirmed by the server. */
  awaiting: string[];
  /** Journeys whose pass a late confirm unlocked — the pass screen moves on when its own appears. */
  owned: string[];
  /** The last paid pass that was refused for good, or whose timed retries ran out. */
  notice: PassNotice | null;
}

export const usePassPurchases = create<PassPurchaseState>()(() => ({ awaiting: [], owned: [], notice: null }));

const clearNotice = (productId: string) => {
  if (usePassPurchases.getState().notice?.productId === productId) usePassPurchases.setState({ notice: null });
};

/** Buys started and not answered yet, per product: a double tap opens one store sheet. */
const buying = new Set<string>();

/**
 * Buy the journey pass. `dev` is the server's own `dev_purchase` flag (not `__DEV__`): checked first,
 * since a simulator has the store module but no App Store. The dev confirmation carries the platform
 * only, exactly as the pass screen always sent it.
 */
export async function buyJourneyPass(journeyId: string, productId: string, dev: boolean): Promise<BuyPassResult> {
  if (buying.has(productId) || usePassPurchases.getState().awaiting.includes(productId)) return { ok: false, reason: 'awaiting' };
  // A sign-out while the store sheet is up must not leave this buy holding under the next account.
  const at = session;
  buying.add(productId);
  clearNotice(productId);
  try {
    const r = await buyWithStore({
      productId,
      dev,
      confirm: input => confirmJourneyPurchase(journeyId, input.platform === 'dev' ? { platform: 'dev' } : input),
      accepted: c => c.owned,
    });
    if (r.ok) return { ok: true };
    if (r.reason !== 'refused') return { ok: false, reason: r.reason };
    // Only a store buy carries `purchase`: the dev platform took no money, so its refusal stands.
    if (!r.purchase) return { ok: false, reason: r.confirmed.error === 'network' ? 'failed' : 'invalid' };
    if (r.confirmed.status === 422) {
      devlog(`[journey] server refused the pass receipt ${r.purchase.transactionId ?? ''} - left unfinished for support`);
      if (at === session) usePassPurchases.setState({ notice: { productId, kind: 'unverified' } });
      return { ok: false, reason: 'unverified' };
    }
    if (at === session) holdForConfirm(journeyId, r.purchase);
    return { ok: false, reason: 'awaiting' };
  } finally {
    buying.delete(productId);
  }
}

/* ---- paid, not yet confirmed ------------------------------------------------------------------ */

interface Held {
  journeyId: string;
  purchase: ProductPurchase;
}

const held = new Map<string, Held>();
/** Held ones whose timed retries ran out: still asked about on the foreground, no longer awaiting. */
const stalled = new Set<string>();
const keyOf = (p: ProductPurchase) => p.transactionId ?? p.purchaseToken;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryStep = 0;
let foreground: { remove(): void } | null = null;
let flushing: Promise<void> | null = null;
/** Bumped on sign-out (stopPassConfirms): an answer for the last account is dropped, not acted on. */
let session = 0;

function publishHeld(): void {
  const waiting = [...held].filter(([key]) => !stalled.has(key)).map(([, h]) => h.purchase.productId);
  usePassPurchases.setState({ awaiting: [...new Set(waiting)] });
  if (held.size > 0) return;
  // Nothing left to confirm: the backoff starts over for the next one, and the foreground hook goes.
  stalled.clear();
  retryStep = 0;
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  foreground?.remove();
  foreground = null;
}

/** The timed retries are spent: the button comes back, with words saying the payment is still being
 *  confirmed (29-10: it used to stay off for good). */
function stallHeld(): void {
  for (const [key, h] of held) {
    if (stalled.has(key)) continue;
    stalled.add(key);
    usePassPurchases.setState({ notice: { productId: h.purchase.productId, kind: 'delayed' } });
  }
  publishHeld();
}

function holdForConfirm(journeyId: string, purchase: ProductPurchase): void {
  held.set(keyOf(purchase), { journeyId, purchase });
  // One held after the backoff was spent gets a fresh one, or it would wait for the next foreground.
  if (retryStep >= CONFIRM_RETRY_MS.length) retryStep = 0;
  publishHeld();
  if (!foreground) {
    foreground = AppState.addEventListener('change', st => {
      if (st === 'active') retryHeldPassPurchases().catch(() => {});
    });
  }
  scheduleRetry();
}

function scheduleRetry(): void {
  if (retryTimer || held.size === 0 || retryStep >= CONFIRM_RETRY_MS.length) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    retryStep += 1;
    flushHeld().catch(() => {});
  }, CONFIRM_RETRY_MS[retryStep]);
}

function flushHeld(): Promise<void> {
  if (!flushing) {
    const at = session;
    // Cleared in `.finally`, which always runs after this assignment (a run with nothing to await
    // would otherwise leave its settled promise here for good); a pre-sign-out run leaves it alone.
    flushing = confirmAll(at).finally(() => {
      if (at === session) flushing = null;
    });
  }
  return flushing;
}

async function confirmAll(at: number): Promise<void> {
  for (const [key, h] of [...held]) {
    if (at !== session) return;
    const r = await confirmHeld(h, at);
    if (at !== session) return;
    if (r !== 'retry') {
      held.delete(key);
      stalled.delete(key);
    }
  }
  publishHeld();
  if (held.size > 0 && retryStep >= CONFIRM_RETRY_MS.length) stallHeld();
  else scheduleRetry();
}

/** Hand one paid pass to the server again — the same store transaction every time; on its yes,
 *  consume it and tell the pass screen. A 422 is final: let go, left unfinished, the screen told. */
async function confirmHeld({ journeyId, purchase }: Held, at: number): Promise<'owned' | 'retry' | 'refused'> {
  const r = await confirmJourneyPurchase(journeyId, {
    platform: purchase.platform,
    productId: purchase.productId,
    purchaseToken: purchase.purchaseToken,
    transactionId: purchase.transactionId,
  });
  if (!r.owned) {
    devlog(`[journey] could not confirm pass ${purchase.productId} ${purchase.transactionId ?? ''}: ${r.error ?? ''} (${r.status ?? '-'})`);
    if (r.status !== 422) return 'retry';
    if (at === session) usePassPurchases.setState({ notice: { productId: purchase.productId, kind: 'unverified' } });
    return 'refused';
  }
  // Unlocked for whichever account sent it, so it is consumed either way; the screen is this session's.
  await finishPurchase(purchase);
  if (at !== session) return 'owned';
  clearNotice(purchase.productId);
  const owned = usePassPurchases.getState().owned;
  if (!owned.includes(journeyId)) usePassPurchases.setState({ owned: [...owned, journeyId] });
  return 'owned';
}

/** Confirm every held pass now, with the backoff started over — the app came back to the
 *  foreground, which is when a dropped connection has most likely come back too. */
export function retryHeldPassPurchases(): Promise<void> {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  retryStep = 0;
  return flushHeld();
}

/** Sign-out (forgetLocalData): stop asking about the last account's passes — 29-10, the same leak
 *  as the coins (stopCoinConfirms): the next retry would have posted A's purchase with B's token.
 *  The store transactions stay unfinished. */
export function stopPassConfirms(): void {
  session += 1;
  held.clear();
  stalled.clear();
  flushing = null;
  publishHeld();
  usePassPurchases.setState({ awaiting: [], owned: [], notice: null });
}

/** Jest only: forget every held purchase and timer between tests. */
export function resetPassConfirmsForTests(): void {
  stopPassConfirms();
  buying.clear();
}
