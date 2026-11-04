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

/**
 * What became of a held purchase that did not simply land (29-10). 'unverified': the server refused
 * the receipt for good (422) — the pack is released and the player is told to contact support; the
 * store transaction stays unfinished so it can be reconciled. 'delayed': the timed retries ran out —
 * the spinner goes, the payment is still asked about on every return to the foreground.
 */
export interface CoinNotice {
  productId: string;
  kind: 'unverified' | 'delayed';
  /** Bumped per notice, like LateCredit's. */
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
  notice: CoinNotice | null;
  setAwaiting(productIds: string[]): void;
  noteLateCredit(productId: string, coinsAdded: number): void;
  noteConfirm(productId: string, kind: CoinNotice['kind']): void;
  /** Drop the notice about this product (it landed, or a new buy of it started). */
  clearNotice(productId: string): void;
  setBalance(balance: number): void;
  setWallet(balance: number, products: CoinProduct[]): void;
  openShop(): void;
  closeShop(): void;
}

// Module-wide, not read off the last notice: a cleared notice must not let the next one reuse a seq
// a mounted shop has already shown.
let noticeSeq = 0;

export const useCoins = create<CoinState>()(set => ({
  balance: null,
  products: [],
  shopOpen: false,
  awaiting: [],
  lateCredit: null,
  notice: null,
  setAwaiting: awaiting => set({ awaiting }),
  noteLateCredit: (productId, coinsAdded) =>
    set(s => ({ lateCredit: { productId, coinsAdded, seq: (s.lateCredit?.seq ?? 0) + 1 } })),
  noteConfirm: (productId, kind) => set({ notice: { productId, kind, seq: ++noticeSeq } }),
  clearNotice: productId => set(s => (s.notice?.productId === productId ? { notice: null } : {})),
  setBalance: balance => set({ balance }),
  setWallet: (balance, products) => set({ balance, products }),
  openShop: () => set({ shopOpen: true }),
  closeShop: () => set({ shopOpen: false }),
}));
