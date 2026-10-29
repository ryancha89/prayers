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
 */

export type BuyPassResult =
  | { ok: true }
  /** 'awaiting': the store took the money, the server has not confirmed it yet — held and retried.
   *  'invalid': the server refused a dev-platform buy (no money was taken). */
  | { ok: false; reason: 'cancelled' | 'pending' | 'unavailable' | 'failed' | 'invalid' | 'awaiting' };

interface PassPurchaseState {
  /** Pass products charged for and not yet confirmed by the server. */
  awaiting: string[];
  /** Journeys whose pass a late confirm unlocked — the pass screen moves on when its own appears. */
  owned: string[];
}

export const usePassPurchases = create<PassPurchaseState>()(() => ({ awaiting: [], owned: [] }));

/** Buys started and not answered yet, per product: a double tap opens one store sheet. */
const buying = new Set<string>();

/**
 * Buy the journey pass. `dev` is the server's own `dev_purchase` flag (not `__DEV__`): checked first,
 * since a simulator has the store module but no App Store. The dev confirmation carries the platform
 * only, exactly as the pass screen always sent it.
 */
export async function buyJourneyPass(journeyId: string, productId: string, dev: boolean): Promise<BuyPassResult> {
  if (buying.has(productId) || usePassPurchases.getState().awaiting.includes(productId)) return { ok: false, reason: 'awaiting' };
  buying.add(productId);
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
    holdForConfirm(journeyId, r.purchase);
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
const keyOf = (p: ProductPurchase) => p.transactionId ?? p.purchaseToken;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryStep = 0;
let foreground: { remove(): void } | null = null;
let flushing: Promise<void> | null = null;

function publishHeld(): void {
  usePassPurchases.setState({ awaiting: [...new Set([...held.values()].map(h => h.purchase.productId))] });
  if (held.size > 0) return;
  // Nothing left to confirm: the backoff starts over for the next one, and the foreground hook goes.
  retryStep = 0;
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  foreground?.remove();
  foreground = null;
}

function holdForConfirm(journeyId: string, purchase: ProductPurchase): void {
  held.set(keyOf(purchase), { journeyId, purchase });
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
    flushing = (async () => {
      try {
        for (const [key, h] of [...held]) {
          if (await confirmHeld(h)) held.delete(key);
        }
      } finally {
        flushing = null;
      }
      publishHeld();
      scheduleRetry();
    })();
  }
  return flushing;
}

/** Hand one paid pass to the server again — the same store transaction every time; on its yes,
 *  consume it and tell the pass screen. */
async function confirmHeld({ journeyId, purchase }: Held): Promise<boolean> {
  const r = await confirmJourneyPurchase(journeyId, {
    platform: purchase.platform,
    productId: purchase.productId,
    purchaseToken: purchase.purchaseToken,
    transactionId: purchase.transactionId,
  });
  if (!r.owned) {
    devlog(`[journey] could not confirm pass ${purchase.productId} ${purchase.transactionId ?? ''}: ${r.error ?? ''}`);
    return false;
  }
  await finishPurchase(purchase);
  const owned = usePassPurchases.getState().owned;
  if (!owned.includes(journeyId)) usePassPurchases.setState({ owned: [...owned, journeyId] });
  return true;
}

/** Confirm every held pass now, with the backoff started over — the app came back to the
 *  foreground, which is when a dropped connection has most likely come back too. */
export function retryHeldPassPurchases(): Promise<void> {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  retryStep = 0;
  return flushHeld();
}

/** Jest only: forget every held purchase and timer between tests. */
export function resetPassConfirmsForTests(): void {
  held.clear();
  buying.clear();
  flushing = null;
  publishHeld();
  usePassPurchases.setState({ owned: [] });
}
