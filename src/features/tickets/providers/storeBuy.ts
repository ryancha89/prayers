import { apiBase } from '../../../shared/config/api';
import { devlog } from '../../../shared/devlog';
import { authedFetch } from '../../auth/api/headers';
import { buyProduct, finishPurchase, storeAvailable } from './purchase';

/**
 * The one way a store product is bought and handed to the server — coin packs and the journey pass
 * both go through here, so the order below cannot drift between them:
 *
 *   dev build   → the server's `dev` platform (accepted in development/test only; a simulator has
 *                 the store module but no store to take the money)
 *   otherwise   → the store takes the money → the SERVER verifies the receipt → only then is the
 *                 purchase consumed (`finishPurchase`). A purchase the server refused stays
 *                 unfinished, so the store re-delivers it rather than it being lost.
 */

export interface StoreConfirmInput {
  platform: 'ios' | 'android' | 'dev';
  productId?: string;
  purchaseToken?: string;
  transactionId?: string;
}

/** What the confirm route answered. null = no answer at all (offline, or the request threw). */
export interface StoreConfirmReply {
  status: number;
  ok: boolean;
  /** The JSON body, or null when it could not be read. */
  body: any;
}

/** POST the store's purchase to a server route (`/api/v1/prayers/...`). The body is the same for
 *  every product: {platform, product_id, purchase_token, transaction_id}, undefined fields left out. */
export async function confirmStorePurchase(path: string, input: StoreConfirmInput): Promise<StoreConfirmReply | null> {
  try {
    const res = await authedFetch(`${apiBase()}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platform: input.platform,
        product_id: input.productId,
        purchase_token: input.purchaseToken,
        transaction_id: input.transactionId,
      }),
    });
    if (!res) return null;
    const body = await res.json().catch(() => null);
    return { status: res.status, ok: res.ok, body };
  } catch (e) {
    devlog(`[store] confirm ${path} failed: ${String(e)}`);
    return null;
  }
}

export type StoreBuyResult<R> =
  | { ok: true; confirmed: R }
  /** The server answered and did not accept it: `confirmed` says why. Nothing was consumed. */
  | { ok: false; reason: 'refused'; confirmed: R }
  /** 'pending' (Android): accepted, not paid yet — it is credited when the store delivers it paid. */
  | { ok: false; reason: 'cancelled' | 'pending' | 'unavailable' | 'failed' };

export async function buyWithStore<R>(opts: {
  productId: string;
  /** Go through the server's dev platform instead of the store. */
  dev: boolean;
  /** Hand the purchase to the server. Must not throw. */
  confirm(input: StoreConfirmInput): Promise<R>;
  /** Did the server accept it? Only then is the store purchase consumed. */
  accepted(r: R): boolean;
}): Promise<StoreBuyResult<R>> {
  if (opts.dev) {
    const r = await opts.confirm({ platform: 'dev', productId: opts.productId });
    return opts.accepted(r) ? { ok: true, confirmed: r } : { ok: false, reason: 'refused', confirmed: r };
  }
  if (!storeAvailable()) return { ok: false, reason: 'unavailable' };
  let purchase;
  try {
    purchase = await buyProduct(opts.productId);
  } catch (e) {
    const message = String((e as Error)?.message ?? '').toLowerCase();
    if (message === 'pending') return { ok: false, reason: 'pending' };
    return { ok: false, reason: message.includes('cancel') ? 'cancelled' : 'failed' };
  }
  const r = await opts.confirm({
    platform: purchase.platform,
    productId: purchase.productId,
    purchaseToken: purchase.purchaseToken,
    transactionId: purchase.transactionId,
  });
  if (!opts.accepted(r)) return { ok: false, reason: 'refused', confirmed: r };
  await finishPurchase(purchase);
  return { ok: true, confirmed: r };
}
