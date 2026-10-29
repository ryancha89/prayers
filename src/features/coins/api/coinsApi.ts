import { AppState } from 'react-native';
import { apiBase } from '../../../shared/config/api';
import { authedFetch } from '../../auth/api/headers';
import { buyWithStore, confirmStorePurchase, type StoreConfirmInput } from '../../tickets/providers/storeBuy';
import { finishPurchase, onStorePurchase, unfinishedPurchases, type ProductPurchase } from '../../tickets/providers/purchase';
import { devlog } from '../../../shared/devlog';
import { devPurchases } from '../../../shared/device/simulator';
import { useCoins } from '../store/coinStore';
import { noteCoins } from '../../myroom/inbox/inboxStore';

/**
 * Prayer Coins (PC) — the coin wallet (`users.coin_balance` on saju_server), 10-15 the app's one
 * currency: consultations, the journey and My Room are paid in it, and the six consumable store
 * products `prayer_coin_<base>` fill it (base coins + a bonus on the bigger packs).
 *
 *   GET  prayers/coins          → { coin_balance, products: [{ product_id, base_coins, coins, price_krw, bonus_pct }] }
 *   POST prayers/coins/purchase → 200 { success, coins_added, coin_balance } · 422 PURCHASE_INVALID
 *
 * The SERVER checks the store's receipt and adds the coins; it is idempotent per store transaction
 * (a replay answers coins_added 0). This file never decides that a purchase happened.
 */

/** What one consultation turn costs in Prayer Coins (20 in promode) — mirrored from
 *  Prayers::CoinGate::COST so the room can be refused politely on the way in. The server charges. */
export const CONSULT_COST = 10;

export interface CoinProduct {
  productId: string;
  /** The pack before its bonus. */
  baseCoins: number;
  /** What is credited: base + bonus. */
  coins: number;
  priceKrw: number;
  /** 0 = no badge. */
  bonusPct: number;
}

export async function fetchCoins(signal?: AbortSignal): Promise<{ balance: number; products: CoinProduct[] } | null> {
  try {
    const res = await authedFetch(`${apiBase()}/api/v1/prayers/coins`, { signal });
    if (!res?.ok) return null;
    const b = await res.json();
    const products: CoinProduct[] = (b?.products ?? []).map((p: any) => ({
      productId: String(p.product_id),
      baseCoins: Number(p.base_coins ?? p.coins ?? 0),
      coins: Number(p.coins ?? 0),
      priceKrw: Number(p.price_krw ?? 0),
      bonusPct: Number(p.bonus_pct ?? 0),
    }));
    return { balance: Number(b?.coin_balance ?? 0), products };
  } catch {
    return null;
  }
}

/** Fill the coin store from the server: the balance in the header pill and the shop's rows. */
export async function refreshCoins(): Promise<void> {
  const r = await fetchCoins();
  if (r) useCoins.getState().setWallet(r.balance, r.products);
}

type ConfirmResult = { ok: true; coinsAdded: number; balance: number } | { ok: false; error: 'invalid' | 'failed' };

async function confirmCoinPurchase(input: StoreConfirmInput): Promise<ConfirmResult> {
  const r = await confirmStorePurchase('/api/v1/prayers/coins/purchase', input);
  if (!r) return { ok: false, error: 'failed' };
  if (r.status === 422) return { ok: false, error: 'invalid' };
  if (!r.ok || !r.body?.success) return { ok: false, error: 'failed' };
  return { ok: true, coinsAdded: Number(r.body.coins_added ?? 0), balance: Number(r.body.coin_balance ?? 0) };
}

export type BuyCoinsResult =
  | { ok: true; coinsAdded: number; balance: number }
  /** 'awaiting' (29-10): the store took the money and the server has not confirmed it yet — the
   *  purchase is held and retried (below). Never "try again": that is how players paid twice. */
  | { ok: false; reason: 'cancelled' | 'pending' | 'invalid' | 'unavailable' | 'failed' | 'awaiting' };

/** Buys started and not yet answered, per product: a second tap from another mounted shop must not
 *  open a second store sheet for the same pack. */
const buying = new Set<string>();

/**
 * Buy one coin product, through `buyWithStore`: the store takes the money, the server verifies the
 * receipt and credits, then the purchase is consumed. The wallet is set here from the server's answer.
 *
 * Where the money comes from (10-15, user: "개발모드에서 이거 사도록 하고 실제 핸드폰으론 결제"):
 * a dev build on a SIMULATOR uses the server's `dev` platform — instant, free, no App Store (StoreKit
 * on a simulator hung on a real product). Anything on a real phone pays through the store: the
 * sandbox account in a dev build, the real one in release. `devPurchases` (shared/device/simulator).
 *
 * Charged but not confirmed (29-10): a dropped connection, a 5xx or a 422 after StoreKit said yes
 * used to come back as 'failed', the shop said "try again", and nothing retried until the next
 * launch — so players paid again and were credited twice later. Now the unfinished purchase is held
 * and confirmed again in this session (backoff + every return to the foreground), the answer is
 * 'awaiting', and the same pack cannot be bought again until it lands.
 */
export async function buyCoins(productId: string, opts: { dev?: boolean } = {}): Promise<BuyCoinsResult> {
  if (buying.has(productId) || useCoins.getState().awaiting.includes(productId)) return { ok: false, reason: 'awaiting' };
  const dev = opts.dev ?? devPurchases();
  buying.add(productId);
  try {
    const r = await buyWithStore<ConfirmResult>({ productId, dev, confirm: confirmCoinPurchase, accepted: c => c.ok });
    if (!r.ok && r.reason !== 'refused') return { ok: false, reason: r.reason };
    const confirmed = r.confirmed;
    if (!confirmed.ok) {
      // The store charged (only a store buy carries `purchase`; the dev platform takes no money).
      if (!r.ok && r.purchase) {
        holdForConfirm(r.purchase);
        return { ok: false, reason: 'awaiting' };
      }
      return { ok: false, reason: confirmed.error };
    }
    useCoins.getState().setBalance(confirmed.balance);
    noteCoins(confirmed.coinsAdded, confirmed.balance);
    return confirmed;
  } finally {
    buying.delete(productId);
  }
}

export const isCoinProduct = (productId: string) => productId.startsWith('prayer_coin_');

/* ---- paid, not yet confirmed ------------------------------------------------------------------ */

/** The waits between confirm attempts for a held purchase. Past the last one only a return to the
 *  foreground (or the next launch's unfinishedPurchases) asks again — the store keeps it meanwhile. */
export const CONFIRM_RETRY_MS = [3_000, 10_000, 30_000, 60_000, 120_000, 300_000];

/** Held purchases by store transaction: charged, still unfinished, the server not yet agreed. */
const held = new Map<string, ProductPurchase>();
const keyOf = (p: ProductPurchase) => p.transactionId ?? p.purchaseToken;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryStep = 0;
let foreground: { remove(): void } | null = null;
let flushing: Promise<void> | null = null;

function publishHeld(): void {
  useCoins.getState().setAwaiting([...new Set([...held.values()].map(p => p.productId))]);
  if (held.size > 0) return;
  // Nothing left to confirm: the backoff starts over for the next one, and the foreground hook goes.
  retryStep = 0;
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  foreground?.remove();
  foreground = null;
}

function holdForConfirm(p: ProductPurchase): void {
  held.set(keyOf(p), p);
  publishHeld();
  if (!foreground) {
    foreground = AppState.addEventListener('change', st => {
      if (st === 'active') retryHeldCoinPurchases().catch(() => {});
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
        for (const [key, p] of [...held]) {
          if (await credit(p, true)) held.delete(key);
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

/** Confirm every held purchase now, with the backoff started over — the app came back to the
 *  foreground, which is when a dropped connection has most likely come back too. */
export function retryHeldCoinPurchases(): Promise<void> {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  retryStep = 0;
  return flushHeld();
}

/** Hand one paid purchase to the server; on its yes, consume it and set the wallet. Credits once:
 *  the server is idempotent per store transaction (a replay adds 0, and noteCoins says nothing). */
async function credit(purchase: ProductPurchase, late: boolean): Promise<boolean> {
  const r = await confirmCoinPurchase({
    platform: purchase.platform,
    productId: purchase.productId,
    purchaseToken: purchase.purchaseToken,
    transactionId: purchase.transactionId,
  });
  if (!r.ok) {
    devlog(`[coins] could not confirm ${purchase.productId} ${purchase.transactionId ?? ''}: ${r.error}`);
    return false;
  }
  await finishPurchase(purchase);
  useCoins.getState().setBalance(r.balance);
  noteCoins(r.coinsAdded, r.balance);
  if (late) useCoins.getState().noteLateCredit(purchase.productId, r.coinsAdded);
  return true;
}

/** One paid coin purchase that reached the app outside a buy (launch, a store re-delivery): credit
 *  it, then finish it. One the server did not accept is held and retried in this session too. */
async function settle(purchase: ProductPurchase): Promise<void> {
  if (!isCoinProduct(purchase.productId)) return;
  const key = keyOf(purchase);
  if (await credit(purchase, held.has(key))) {
    if (held.delete(key)) publishHeld();
  } else {
    holdForConfirm(purchase);
  }
}

/**
 * Started once the player is signed in (App.tsx): credits any coin purchase the store still holds
 * unfinished, then listens for ones that arrive later. Returns the stop.
 */
export function startCoinPurchaseRecovery(): () => void {
  const stop = onStorePurchase(p => { settle(p).catch(() => {}); });
  unfinishedPurchases()
    .then(list => list.reduce((chain, p) => chain.then(() => settle(p)), Promise.resolve()))
    .catch(() => {});
  return stop;
}

/** Jest only: forget every held purchase and timer between tests. */
export function resetCoinConfirmsForTests(): void {
  held.clear();
  buying.clear();
  flushing = null;
  publishHeld();
}
