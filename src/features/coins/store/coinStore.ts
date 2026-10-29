import { create } from 'zustand';
import type { CoinProduct } from '../api/coinsApi';

/**
 * The account's coins, as the server last said — the header pill reads it, the journey's unlocks
 * and the coin shop write it. Not persisted: every number here comes from a server answer.
 *
 * The shop is one sheet for the whole app (mounted in App.tsx): any screen opens it with
 * `openShop()` — the journey's lock does when the coins run short.
 */
/** A purchase the server confirmed after the buy itself had given up on it (coinsApi's retry). */
export interface LateCredit {
  productId: string;
  coinsAdded: number;
  /** Bumped per credit, so two equal credits in a row are still two events. */
  seq: number;
}

interface CoinState {
  balance: number | null;
  products: CoinProduct[];
  shopOpen: boolean;
  /**
   * Products the store has charged for that the server has not confirmed yet (29-10). The shop
   * says "payment received" for them and will not start a second buy of the same product until
   * the retry in coinsApi lands — a "try again" here used to have players pay twice.
   */
  awaiting: string[];
  lateCredit: LateCredit | null;
  setAwaiting(productIds: string[]): void;
  noteLateCredit(productId: string, coinsAdded: number): void;
  setBalance(balance: number): void;
  setWallet(balance: number, products: CoinProduct[]): void;
  openShop(): void;
  closeShop(): void;
}

export const useCoins = create<CoinState>()(set => ({
  balance: null,
  products: [],
  shopOpen: false,
  awaiting: [],
  lateCredit: null,
  setAwaiting: awaiting => set({ awaiting }),
  noteLateCredit: (productId, coinsAdded) =>
    set(s => ({ lateCredit: { productId, coinsAdded, seq: (s.lateCredit?.seq ?? 0) + 1 } })),
  setBalance: balance => set({ balance }),
  setWallet: (balance, products) => set({ balance, products }),
  openShop: () => set({ shopOpen: true }),
  closeShop: () => set({ shopOpen: false }),
}));
