import { create } from 'zustand';
import type { CoinProduct } from '../api/coinsApi';

/**
 * The account's coins, as the server last said — the header pill reads it, the journey's unlocks
 * and the coin shop write it. Not persisted: every number here comes from a server answer.
 *
 * The shop is one sheet for the whole app (mounted in App.tsx): any screen opens it with
 * `openShop()` — the journey's lock does when the coins run short.
 */
interface CoinState {
  balance: number | null;
  products: CoinProduct[];
  shopOpen: boolean;
  setBalance(balance: number): void;
  setWallet(balance: number, products: CoinProduct[]): void;
  openShop(): void;
  closeShop(): void;
}

export const useCoins = create<CoinState>()(set => ({
  balance: null,
  products: [],
  shopOpen: false,
  setBalance: balance => set({ balance }),
  setWallet: (balance, products) => set({ balance, products }),
  openShop: () => set({ shopOpen: true }),
  closeShop: () => set({ shopOpen: false }),
}));
