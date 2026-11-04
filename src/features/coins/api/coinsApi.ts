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

/** 'invalid' is the server's final no (422 PURCHASE_INVALID: the receipt does not verify); 'failed'
 *  is anything that can still succeed later — no answer, a 5xx, a 401 before a token refresh. */
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
  /** 'unverified' (29-10): the store took the money and the server refused the receipt for good
   *  (422). Not held — retrying cannot change that answer — and not finished either: the store keeps
   *  the transaction for re-delivery and for support to reconcile. */
  | { ok: false; reason: 'cancelled' | 'pending' | 'invalid' | 'unavailable' | 'failed' | 'awaiting' | 'unverified' };

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
  // A sign-out while the store sheet is up must not leave this buy writing into the next account.
  const at = session;
  buying.add(productId);
  useCoins.getState().clearNotice(productId);
  try {
    const r = await buyWithStore<ConfirmResult>({ productId, dev, confirm: confirmCoinPurchase, accepted: c => c.ok });
    if (!r.ok && r.reason !== 'refused') return { ok: false, reason: r.reason };
    const confirmed = r.confirmed;
    if (!confirmed.ok) {
      // The store charged (only a store buy carries `purchase`; the dev platform takes no money).
      if (!r.ok && r.purchase) {
        // 29-10: a 422 used to be held too, so the pack spun "payment received" forever and every
        // launch held it again. Only an answer that can change is worth asking again.
        if (confirmed.error === 'invalid') {
          devlog(`[coins] server refused the receipt for ${productId} ${r.purchase.transactionId ?? ''} - left unfinished for support`);
          return { ok: false, reason: 'unverified' };
        }
        if (at === session) holdForConfirm(r.purchase);
        return { ok: false, reason: 'awaiting' };
      }
      return { ok: false, reason: confirmed.error };
    }
    if (at === session) {
      useCoins.getState().setBalance(confirmed.balance);
      noteCoins(confirmed.coinsAdded, confirmed.balance);
    }
    return confirmed;
  } finally {
    buying.delete(productId);
  }
}

export const isCoinProduct = (productId: string) => productId.startsWith('prayer_coin_');

/* ---- paid, not yet confirmed ------------------------------------------------------------------ */

/** The waits between confirm attempts for a held purchase. Past the last one only a return to the
 *  foreground (or the next launch's unfinishedPurchases) asks again — the store keeps it meanwhile —
 *  and the pack's spinner goes, with a 'delayed' notice (29-10: it used to spin for good). */
export const CONFIRM_RETRY_MS = [3_000, 10_000, 30_000, 60_000, 120_000, 300_000];

/** Held purchases by store transaction: charged, still unfinished, the server not yet agreed. */
const held = new Map<string, ProductPurchase>();
/** Held ones whose timed retries ran out: still asked about on the foreground, but no longer shown
 *  as awaiting — the player was told, and the pack is not locked behind a spinner for good. */
const stalled = new Set<string>();
const keyOf = (p: ProductPurchase) => p.transactionId ?? p.purchaseToken;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryStep = 0;
let foreground: { remove(): void } | null = null;
let flushing: Promise<void> | null = null;
/** Bumped on sign-out (stopCoinConfirms): work started for one account drops its answer rather than
 *  holding, retrying or writing the wallet under the next one. */
let session = 0;

function publishHeld(): void {
  const waiting = [...held].filter(([key]) => !stalled.has(key)).map(([, p]) => p.productId);
  useCoins.getState().setAwaiting([...new Set(waiting)]);
  if (held.size > 0) return;
  // Nothing left to confirm: the backoff starts over for the next one, and the foreground hook goes.
  stalled.clear();
  retryStep = 0;
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  foreground?.remove();
  foreground = null;
}

/** The timed retries are spent: release every pack still spinning, and say so once per purchase. */
function stallHeld(): void {
  for (const [key, p] of held) {
    if (stalled.has(key)) continue;
    stalled.add(key);
    useCoins.getState().noteConfirm(p.productId, 'delayed');
  }
  publishHeld();
}

function holdForConfirm(p: ProductPurchase): void {
  held.set(keyOf(p), p);
  // A purchase held after the backoff was spent gets its own: without this it spun until the next
  // foreground, the timer never started again.
  if (retryStep >= CONFIRM_RETRY_MS.length) retryStep = 0;
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
    const at = session;
    // Cleared in `.finally`, which always runs after this assignment — a run with nothing to await
    // must not leave its settled promise here for good. A run from before a sign-out leaves it alone.
    flushing = confirmHeld(at).finally(() => {
      if (at === session) flushing = null;
    });
  }
  return flushing;
}

async function confirmHeld(at: number): Promise<void> {
  for (const [key, p] of [...held]) {
    if (at !== session) return;
    const r = await credit(p, true);
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

/** Confirm every held purchase now, with the backoff started over — the app came back to the
 *  foreground, which is when a dropped connection has most likely come back too. */
export function retryHeldCoinPurchases(): Promise<void> {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  retryStep = 0;
  return flushHeld();
}

/**
 * Hand one paid purchase to the server; on its yes, consume it and set the wallet. Credits once:
 * the server is idempotent per store transaction (a replay adds 0, and noteCoins says nothing).
 * 'refused' is the server's final no (422): left UNFINISHED — never consume a purchase nobody was
 * credited for; the store re-delivers it and support can reconcile it — and the player is told.
 */
async function credit(purchase: ProductPurchase, late: boolean): Promise<'credited' | 'retry' | 'refused'> {
  const at = session;
  const r = await confirmCoinPurchase({
    platform: purchase.platform,
    productId: purchase.productId,
    purchaseToken: purchase.purchaseToken,
    transactionId: purchase.transactionId,
  });
  if (!r.ok) {
    devlog(`[coins] could not confirm ${purchase.productId} ${purchase.transactionId ?? ''}: ${r.error}`);
    if (r.error !== 'invalid') return 'retry';
    if (at === session) useCoins.getState().noteConfirm(purchase.productId, 'unverified');
    return 'refused';
  }
  // Credited to whichever account sent it, so it is consumed either way; only the wallet on screen
  // belongs to the session that asked.
  await finishPurchase(purchase);
  if (at !== session) return 'credited';
  useCoins.getState().setBalance(r.balance);
  noteCoins(r.coinsAdded, r.balance);
  useCoins.getState().clearNotice(purchase.productId);
  // 29-10: a replay of an already-credited purchase adds 0 — nothing to announce, and announcing it
  // wiped whatever the shop was saying.
  if (late && r.coinsAdded > 0) useCoins.getState().noteLateCredit(purchase.productId, r.coinsAdded);
  return 'credited';
}

/** One paid coin purchase that reached the app outside a buy (launch, a store re-delivery): credit
 *  it, then finish it. One the server could not answer yet is held and retried in this session too;
 *  one it refused for good is let go (and the shop says so). */
async function settle(purchase: ProductPurchase): Promise<void> {
  if (!isCoinProduct(purchase.productId)) return;
  const key = keyOf(purchase);
  const at = session;
  const r = await credit(purchase, held.has(key));
  if (at !== session) return;
  if (r === 'retry') {
    holdForConfirm(purchase);
  } else if (held.delete(key)) {
    stalled.delete(key);
    publishHeld();
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

/**
 * Sign-out (forgetLocalData): stop asking about the last account's payments. 29-10: the held map,
 * its timer and the foreground hook outlived the sign-out, so the next retry posted A's transaction
 * with B's token and the server credited B. The store transactions stay unfinished; the next
 * launch's recovery offers them again under whoever is signed in then.
 */
export function stopCoinConfirms(): void {
  session += 1;
  held.clear();
  stalled.clear();
  flushing = null;
  publishHeld();
  useCoins.setState({ awaiting: [], lateCredit: null, notice: null });
}

/** Jest only: forget every held purchase and timer between tests. */
export function resetCoinConfirmsForTests(): void {
  stopCoinConfirms();
  buying.clear();
}
