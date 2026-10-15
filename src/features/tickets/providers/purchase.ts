import { Platform } from 'react-native';

/**
 * The store (react-native-iap 16 / OpenIAP: StoreKit 2 on iOS, Play Billing on Android), behind a
 * guarded require so a build without the native module neither crashes on the import nor shows a buy
 * button that always fails — `storeAvailable()` says so and callers fall back.
 *
 * Everything sold is a CONSUMABLE one-time product: the Prayer Coin packs (`prayer_coin_<base>`) and
 * the journey pass. They must exist in App Store Connect / Play Console (or, for local runs from
 * Xcode, in ios/prayers/PrayerCoins.storekit) for the store to return them.
 *
 * ⚠️ The receipt is NOT validated here, and must not be. The server verifies it (Apple JWS / Play
 * Developer API) and keeps a per-transaction ledger so one purchase cannot credit twice; a client
 * that decides for itself that a purchase happened is a client that can be told to decide it for free.
 */
function load(): unknown {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-iap');
    return mod?.default ?? mod;
  } catch {
    return null;
  }
}

// ── One-time products: the journey pass (27-09) and the Prayer Coin packs (10-15), iOS and Android ──

/** react-native-iap 16 (OpenIAP): purchases arrive through listeners, not as the return value. */
type Sub = { remove(): void };
type StorePurchase = {
  productId: string;
  purchaseToken?: string | null;
  transactionId?: string | null;
  id?: string;
  /** Android: 'pending' is a purchase the buyer has not paid yet (cash, slow card) — not yet ours. */
  purchaseState?: 'pending' | 'purchased' | 'unknown';
};
type IapProductModule = {
  initConnection(): Promise<unknown>;
  fetchProducts(opts: { skus: string[]; type?: 'in-app' | 'subs' }): Promise<{ id: string; displayPrice?: string }[] | null>;
  requestPurchase(opts: Record<string, unknown>): Promise<unknown>;
  purchaseUpdatedListener(cb: (p: StorePurchase) => void): Sub;
  purchaseErrorListener(cb: (e: { code?: string; message?: string }) => void): Sub;
  finishTransaction(opts: { purchase: unknown; isConsumable?: boolean }): Promise<unknown>;
  getAvailablePurchases?(opts?: { onlyIncludeActiveItemsIOS?: boolean }): Promise<StorePurchase[] | null>;
};

/** What the server needs to verify a one-time purchase: iOS sends the StoreKit 2 signed
 *  transaction (JWS), Android the Play purchase token — v16 puts both in `purchaseToken`. `raw` goes
 *  back to the store once the server has accepted it (finishTransaction), and not before — an
 *  unfinished purchase is re-delivered. */
export interface ProductPurchase {
  platform: 'ios' | 'android';
  productId: string;
  purchaseToken: string;
  transactionId?: string;
  raw: unknown;
}

function productModule(): IapProductModule | null {
  const iap = load() as unknown as IapProductModule | null;
  return iap && typeof iap.fetchProducts === 'function' ? iap : null;
}

export function storeAvailable(): boolean {
  return (Platform.OS === 'ios' || Platform.OS === 'android') && productModule() != null;
}

/** initConnection once per process — every call after the first is a no-op for the store anyway,
 *  but each one was a round trip on the way to a price or a buy. Reset when it fails. */
let connecting: Promise<unknown> | null = null;
function connect(iap: IapProductModule): Promise<unknown> {
  if (!connecting) connecting = iap.initConnection().catch(e => { connecting = null; throw e; });
  return connecting;
}

/**
 * The store's own price strings ("₩3,300", "$2.49") for every product it actually sells, in ONE
 * request. A product missing from the answer is not in the store (not created in App Store Connect /
 * Play Console yet, or no StoreKit configuration in this run) — callers treat it as unbuyable there.
 */
export async function storePrices(productIds: string[]): Promise<Record<string, string>> {
  const iap = productModule();
  if (!iap || productIds.length === 0) return {};
  try {
    await connect(iap);
    const list = (await iap.fetchProducts({ skus: productIds, type: 'in-app' })) ?? [];
    const out: Record<string, string> = {};
    list.forEach(p => { if (productIds.includes(p.id)) out[p.id] = p.displayPrice ?? ''; });
    return out;
  } catch {
    return {};
  }
}

/** The store's own price string ("₩9,900", "$6.99"), or null to show ours. */
export async function productPrice(productId: string): Promise<string | null> {
  return (await storePrices([productId]))[productId] || null;
}

export async function buyProduct(productId: string): Promise<ProductPurchase> {
  const iap = productModule();
  if (!iap) {
    throw new Error('In-app purchase is not in this build — react-native-iap is not installed.');
  }
  await connect(iap);
  inFlight.add(productId);
  const p = await new Promise<StorePurchase>((resolve, reject) => {
    const subs: Sub[] = [];
    const done = () => subs.forEach(x => x.remove());
    subs.push(
      iap.purchaseUpdatedListener(purchase => {
        if (purchase.productId !== productId) return;
        done();
        resolve(purchase);
      }),
      iap.purchaseErrorListener(e => {
        done();
        reject(new Error(e.code === 'user-cancelled' ? 'cancelled' : e.message ?? e.code ?? 'purchase failed'));
      }),
    );
    iap
      .requestPurchase({ request: { apple: { sku: productId }, google: { skus: [productId] } }, type: 'in-app' })
      .catch(e => {
        done();
        reject(e);
      });
  }).finally(() => inFlight.delete(productId));
  // Android: accepted but not paid yet. It is NOT credited and NOT finished here — the store
  // delivers it again once it is paid, and the purchase listener (pendingPurchases) takes it then.
  if (p.purchaseState === 'pending') throw new Error('pending');
  const out = toProductPurchase(p);
  if (!out) throw new Error('The store returned no purchase token.');
  return out;
}

/** Products a buy flow is waiting on right now: the app-wide listener leaves those to the buy. */
const inFlight = new Set<string>();
export const buyingNow = (productId: string) => inFlight.has(productId);

function toProductPurchase(p: StorePurchase): ProductPurchase | null {
  if (!p.purchaseToken) return null;
  const transactionId = p.transactionId ?? p.id;
  return {
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
    productId: p.productId,
    purchaseToken: String(p.purchaseToken),
    transactionId: transactionId ? String(transactionId) : undefined,
    raw: p,
  };
}

/**
 * Paid purchases the store says were never finished — the app died, or the server could not be
 * reached, between the payment and `finishPurchase`. The store keeps them until they are finished
 * and that is the whole recovery: hand each to the server again (idempotent per transaction), then
 * finish it.
 */
export async function unfinishedPurchases(): Promise<ProductPurchase[]> {
  const iap = productModule();
  if (!iap?.getAvailablePurchases) return [];
  try {
    await connect(iap);
    const list = (await iap.getAvailablePurchases({ onlyIncludeActiveItemsIOS: false })) ?? [];
    return list
      .filter(p => p.purchaseState !== 'pending')
      .map(toProductPurchase)
      .filter((p): p is ProductPurchase => p != null);
  } catch {
    return [];
  }
}

/**
 * Purchases that arrive OUTSIDE a buy: an Android pending purchase that got paid, an Ask to Buy
 * approval, a transaction StoreKit re-delivers on launch. Returns the unsubscribe.
 */
export function onStorePurchase(cb: (p: ProductPurchase) => void): () => void {
  const iap = productModule();
  if (!iap) return () => {};
  const sub = iap.purchaseUpdatedListener(p => {
    if (p.purchaseState === 'pending' || inFlight.has(p.productId)) return;
    const out = toProductPurchase(p);
    if (out) cb(out);
  });
  connect(iap).catch(() => {});
  return () => sub.remove();
}

/**
 * Tell the store the purchase was delivered. Only after the server recorded it.
 *
 * CONSUMABLE (27-09): the new-year journey is one store product sold again every year, so it must
 * be consumed — on Android an unconsumed purchase blocks buying the same product again, and on iOS
 * an unfinished one is re-delivered on every launch. What it unlocked lives on the server.
 */
export async function finishPurchase(purchase: ProductPurchase): Promise<void> {
  try {
    await productModule()?.finishTransaction({ purchase: purchase.raw, isConsumable: true });
  } catch {}
}
