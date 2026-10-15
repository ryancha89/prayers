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
  | { ok: false; reason: 'cancelled' | 'pending' | 'invalid' | 'unavailable' | 'failed' };

/**
 * Buy one coin product, through `buyWithStore`: the store takes the money, the server verifies the
 * receipt and credits, then the purchase is consumed. The wallet is set here from the server's answer.
 *
 * Where the money comes from (10-15, user: "개발모드에서 이거 사도록 하고 실제 핸드폰으론 결제"):
 * a dev build on a SIMULATOR uses the server's `dev` platform — instant, free, no App Store (StoreKit
 * on a simulator hung on a real product). Anything on a real phone pays through the store: the
 * sandbox account in a dev build, the real one in release. `devPurchases` (shared/device/simulator).
 */
export async function buyCoins(productId: string, opts: { dev?: boolean } = {}): Promise<BuyCoinsResult> {
  const dev = opts.dev ?? devPurchases();
  const r = await buyWithStore<ConfirmResult>({ productId, dev, confirm: confirmCoinPurchase, accepted: c => c.ok });
  if (!r.ok && r.reason !== 'refused') return { ok: false, reason: r.reason };
  const confirmed = r.confirmed;
  if (!confirmed.ok) return { ok: false, reason: confirmed.error };
  useCoins.getState().setBalance(confirmed.balance);
  noteCoins(confirmed.coinsAdded, confirmed.balance);
  return confirmed;
}

export const isCoinProduct = (productId: string) => productId.startsWith('prayer_coin_');

/** One paid coin purchase that reached the app outside a buy: credit it (the server is idempotent per
 *  store transaction), then finish it. Unaccepted ones stay unfinished for the next try. */
async function settle(purchase: ProductPurchase): Promise<void> {
  if (!isCoinProduct(purchase.productId)) return;
  const r = await confirmCoinPurchase({
    platform: purchase.platform,
    productId: purchase.productId,
    purchaseToken: purchase.purchaseToken,
    transactionId: purchase.transactionId,
  });
  if (!r.ok) {
    devlog(`[coins] could not settle ${purchase.productId} ${purchase.transactionId ?? ''}: ${r.error}`);
    return;
  }
  await finishPurchase(purchase);
  useCoins.getState().setBalance(r.balance);
  if (r.coinsAdded > 0) noteCoins(r.coinsAdded, r.balance);
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
