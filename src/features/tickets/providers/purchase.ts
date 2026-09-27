import { Platform } from 'react-native';

/**
 * The store, behind a guarded require — same shape as Apple Sign In, for the same reason.
 *
 * `react-native-iap` is a pod, and the products have to exist in App Store Connect before any of
 * this returns anything. Neither is done. A bundle built before that must not CRASH on the import
 * and must not show a buy button that always fails: it says the purchase is not available in this
 * build, which is exactly what is true.
 *
 * ⚠️ The receipt is NOT validated here, and must not be. The server re-checks it
 * (TicketSubscriptionService#activate keeps a transaction ledger so the same purchase cannot grant
 * twice); a client that decides for itself that a purchase happened is a client that can be told to
 * decide it for free.
 */
export interface PurchaseResult {
  productId: string;
  transactionId?: string;
  originalTransactionId?: string;
  expiresAt?: string;
}

type IapModule = {
  initConnection(): Promise<unknown>;
  requestSubscription(opts: { sku: string }): Promise<unknown>;
  getAvailablePurchases?(): Promise<unknown[]>;
};

function load(): IapModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-iap');
    return (mod?.default ?? mod) as IapModule;
  } catch {
    return null;
  }
}

/** 27-09: the pod is in now (for the journey), but the ticket SUBSCRIPTIONS are still not products
 *  in App Store Connect — a buy button for them would always fail, and review would see it fail. */
const SUBSCRIPTIONS_IN_STORE = false;

export function purchaseAvailable(): boolean {
  return SUBSCRIPTIONS_IN_STORE && Platform.OS === 'ios' && load() != null;
}

export async function buySubscription(productId: string): Promise<PurchaseResult> {
  const iap = load();
  if (!iap) {
    throw new Error(
      'In-app purchase is not in this build — the react-native-iap pod is not installed and the ' +
        'products are not configured in App Store Connect.',
    );
  }
  await iap.initConnection();
  const purchase = (await iap.requestSubscription({ sku: productId })) as
    | {
        transactionId?: string;
        originalTransactionIdentifierIOS?: string;
        transactionDate?: number;
      }
    | undefined;

  return {
    productId,
    transactionId: purchase?.transactionId,
    originalTransactionId: purchase?.originalTransactionIdentifierIOS,
    // Left undefined rather than guessed: the server reads the real expiry from the store receipt,
    // and a date invented here would be a date the ledger then trusts.
    expiresAt: undefined,
  };
}

// ── One-time products (27-09: the 2027 journey, 9,900원, iOS AND Android) ──────────────────────

/** react-native-iap 16 (OpenIAP): purchases arrive through listeners, not as the return value. */
type Sub = { remove(): void };
type StorePurchase = { productId: string; purchaseToken?: string | null; transactionId?: string | null; id?: string };
type IapProductModule = {
  initConnection(): Promise<unknown>;
  fetchProducts(opts: { skus: string[]; type?: 'in-app' | 'subs' }): Promise<{ id: string; displayPrice?: string }[] | null>;
  requestPurchase(opts: Record<string, unknown>): Promise<unknown>;
  purchaseUpdatedListener(cb: (p: StorePurchase) => void): Sub;
  purchaseErrorListener(cb: (e: { code?: string; message?: string }) => void): Sub;
  finishTransaction(opts: { purchase: unknown; isConsumable?: boolean }): Promise<unknown>;
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

/** The store's own price string ("₩9,900", "$6.99"), or null to show ours. */
export async function productPrice(productId: string): Promise<string | null> {
  const iap = productModule();
  if (!iap) return null;
  try {
    await iap.initConnection();
    const list = await iap.fetchProducts({ skus: [productId], type: 'in-app' });
    return list?.find(p => p.id === productId)?.displayPrice ?? null;
  } catch {
    return null;
  }
}

export async function buyProduct(productId: string): Promise<ProductPurchase> {
  const iap = productModule();
  if (!iap) {
    throw new Error('In-app purchase is not in this build — react-native-iap is not installed.');
  }
  await iap.initConnection();
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
  });
  if (!p.purchaseToken) throw new Error('The store returned no purchase token.');
  const transactionId = p.transactionId ?? p.id;
  return {
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
    productId,
    purchaseToken: String(p.purchaseToken),
    transactionId: transactionId ? String(transactionId) : undefined,
    raw: p,
  };
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
