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

export function purchaseAvailable(): boolean {
  return Platform.OS === 'ios' && load() != null;
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
