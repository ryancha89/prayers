import { apiBase } from '../../../shared/config/api';
import { devlog } from '../../../shared/devlog';
import { authedFetch } from '../../auth/api/headers';
import { buyProduct, finishPurchase, storeAvailable } from '../../tickets/providers/purchase';
import { useCoins } from '../store/coinStore';

/**
 * The coin wallet (`users.coin_balance` on saju_server): what the journey's paid moments are bought
 * with (01-10), and the four consumable store products that fill it.
 *
 *   GET  prayers/coins          → { coin_balance, products: [{ product_id, coins, price_krw, bonus_pct }] }
 *   POST prayers/coins/purchase → 200 { success, coins_added, coin_balance } · 422 PURCHASE_INVALID
 *
 * The SERVER checks the store's receipt and adds the coins; it is idempotent per store transaction
 * (a replay answers coins_added 0). This file never decides that a purchase happened.
 */

export interface CoinProduct {
  productId: string;
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

async function confirmCoinPurchase(input: {
  platform: 'ios' | 'android' | 'dev';
  productId: string;
  purchaseToken?: string;
  transactionId?: string;
}): Promise<ConfirmResult> {
  try {
    const res = await authedFetch(`${apiBase()}/api/v1/prayers/coins/purchase`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platform: input.platform,
        product_id: input.productId,
        purchase_token: input.purchaseToken,
        transaction_id: input.transactionId,
      }),
    });
    if (!res) return { ok: false, error: 'failed' };
    const b = await res.json().catch(() => null);
    if (res.status === 422) return { ok: false, error: 'invalid' };
    if (!res.ok || !b?.success) return { ok: false, error: 'failed' };
    return { ok: true, coinsAdded: Number(b.coins_added ?? 0), balance: Number(b.coin_balance ?? 0) };
  } catch (e) {
    devlog(`[coins] purchase confirm failed: ${String(e)}`);
    return { ok: false, error: 'failed' };
  }
}

export type BuyCoinsResult =
  | { ok: true; coinsAdded: number; balance: number }
  | { ok: false; reason: 'cancelled' | 'invalid' | 'unavailable' | 'failed' };

/**
 * Buy one coin product. A dev build goes through the server's `dev` platform (accepted only in
 * development/test — a simulator has the store module but no store to take the money). Otherwise:
 * the store takes the money, the server verifies the receipt and adds the coins, and only THEN is
 * the purchase consumed (`finishPurchase`). A purchase the server refused stays unfinished, so the
 * store re-delivers it rather than it being lost.
 */
export async function buyCoins(productId: string, opts: { dev?: boolean } = {}): Promise<BuyCoinsResult> {
  const dev = opts.dev ?? (typeof __DEV__ !== 'undefined' && __DEV__);
  let confirmed: ConfirmResult;
  if (dev) {
    confirmed = await confirmCoinPurchase({ platform: 'dev', productId });
  } else {
    if (!storeAvailable()) return { ok: false, reason: 'unavailable' };
    let purchase;
    try {
      purchase = await buyProduct(productId);
    } catch (e) {
      const cancelled = String((e as Error)?.message ?? '').toLowerCase().includes('cancel');
      return { ok: false, reason: cancelled ? 'cancelled' : 'failed' };
    }
    confirmed = await confirmCoinPurchase({
      platform: purchase.platform,
      productId: purchase.productId,
      purchaseToken: purchase.purchaseToken,
      transactionId: purchase.transactionId,
    });
    if (confirmed.ok) await finishPurchase(purchase);
  }
  if (!confirmed.ok) return { ok: false, reason: confirmed.error };
  useCoins.getState().setBalance(confirmed.balance);
  return confirmed;
}
