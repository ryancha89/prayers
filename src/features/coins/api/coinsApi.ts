import { apiBase } from '../../../shared/config/api';
import { authedFetch } from '../../auth/api/headers';
import { buyWithStore, confirmStorePurchase, type StoreConfirmInput } from '../../tickets/providers/storeBuy';
import { useCoins } from '../store/coinStore';
import { noteCoins } from '../../myroom/inbox/inboxStore';

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

async function confirmCoinPurchase(input: StoreConfirmInput): Promise<ConfirmResult> {
  const r = await confirmStorePurchase('/api/v1/prayers/coins/purchase', input);
  if (!r) return { ok: false, error: 'failed' };
  if (r.status === 422) return { ok: false, error: 'invalid' };
  if (!r.ok || !r.body?.success) return { ok: false, error: 'failed' };
  return { ok: true, coinsAdded: Number(r.body.coins_added ?? 0), balance: Number(r.body.coin_balance ?? 0) };
}

export type BuyCoinsResult =
  | { ok: true; coinsAdded: number; balance: number }
  | { ok: false; reason: 'cancelled' | 'invalid' | 'unavailable' | 'failed' };

/**
 * Buy one coin product, through `buyWithStore` (dev platform in a dev build, otherwise the store,
 * then the server, then consume). The wallet is set here from the server's answer.
 */
export async function buyCoins(productId: string, opts: { dev?: boolean } = {}): Promise<BuyCoinsResult> {
  const dev = opts.dev ?? (typeof __DEV__ !== 'undefined' && __DEV__);
  const r = await buyWithStore<ConfirmResult>({ productId, dev, confirm: confirmCoinPurchase, accepted: c => c.ok });
  if (!r.ok && r.reason !== 'refused') return { ok: false, reason: r.reason };
  const confirmed = r.confirmed;
  if (!confirmed.ok) return { ok: false, reason: confirmed.error };
  useCoins.getState().setBalance(confirmed.balance);
  noteCoins(confirmed.coinsAdded, confirmed.balance);
  return confirmed;
}
